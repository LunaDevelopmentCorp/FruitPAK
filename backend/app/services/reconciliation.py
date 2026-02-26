"""Reconciliation service — detects mismatches between physical and financial records.

Each check_* method runs a specific comparison query and returns a list of
ReconciliationAlert objects (unsaved).  The `run_full_reconciliation` method
orchestrates all checks in a single pass, persists the alerts, and returns
a run summary.

Thresholds:
    - WEIGHT_TOLERANCE_PCT: ignore weight variances below this %
    - AMOUNT_TOLERANCE:     ignore monetary variances below this absolute value
    - HOURS_TOLERANCE:      ignore labour-hour variances below this absolute value
"""

import uuid
from datetime import datetime

from sqlalchemy import func, select, and_, case, literal
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.tenant.batch import Batch
from app.models.tenant.grower import Grower
from app.models.tenant.lot import Lot
from app.models.tenant.pallet import Pallet
from app.models.tenant.container import Container
from app.models.tenant.export import Export
from app.models.tenant.grower_payment import GrowerPayment
from app.models.tenant.harvest_team import HarvestTeam
from app.models.tenant.harvest_team_payment import HarvestTeamPayment
from app.models.tenant.client_invoice import ClientInvoice
from app.models.tenant.labour_cost import LabourCost
from app.models.tenant.reconciliation_alert import ReconciliationAlert

# ── Configurable thresholds ──────────────────────────────────
WEIGHT_TOLERANCE_PCT = 2.0    # ignore variances under 2%
AMOUNT_TOLERANCE = 50.0       # ignore monetary variances under 50 (currency units)
HOURS_TOLERANCE = 1.0         # ignore labour hour variances under 1h
PALLET_COUNT_TOLERANCE = 0    # pallet counts must be exact


def _severity(variance_pct: float) -> str:
    """Map variance percentage to severity level."""
    abs_pct = abs(variance_pct) if variance_pct else 0
    if abs_pct >= 20:
        return "critical"
    if abs_pct >= 10:
        return "high"
    if abs_pct >= 5:
        return "medium"
    return "low"


def _safe_pct(expected: float, actual: float) -> float:
    """Calculate percentage variance safely."""
    if not expected:
        return 100.0 if actual else 0.0
    return round(abs(actual - expected) / abs(expected) * 100, 2)


# ─────────────────────────────────────────────────────────────
# CHECK 1:  GRN intake weight  ≠  sum of Lots produced from Batch
# ─────────────────────────────────────────────────────────────

async def check_batch_vs_lots(db: AsyncSession, run_id: str) -> list[ReconciliationAlert]:
    """Compare each completed Batch net_weight_kg against the total
    weight of Lots created from it.  Flags batches where the packed
    output diverges from the intake weight beyond tolerance."""

    # Subquery: total lot weight per batch
    lot_totals = (
        select(
            Lot.batch_id,
            func.coalesce(func.sum(Lot.weight_kg), 0).label("lot_total_kg"),
            func.count(Lot.id).label("lot_count"),
        )
        .where(Lot.is_deleted == False)  # noqa: E712
        .group_by(Lot.batch_id)
        .subquery()
    )

    stmt = (
        select(
            Batch.id,
            Batch.batch_code,
            Batch.net_weight_kg,
            Batch.gross_weight_kg,
            lot_totals.c.lot_total_kg,
            lot_totals.c.lot_count,
        )
        .outerjoin(lot_totals, Batch.id == lot_totals.c.batch_id)
        .where(
            Batch.is_deleted == False,  # noqa: E712
            Batch.status.in_(["packing", "complete"]),
        )
    )

    result = await db.execute(stmt)
    alerts = []

    for row in result.all():
        batch_weight = row.net_weight_kg or row.gross_weight_kg or 0
        lot_weight = float(row.lot_total_kg or 0)

        if not batch_weight and not lot_weight:
            continue

        variance = lot_weight - batch_weight
        pct = _safe_pct(batch_weight, lot_weight)

        if pct <= WEIGHT_TOLERANCE_PCT:
            continue

        alerts.append(ReconciliationAlert(
            alert_type="lot_vs_batch",
            severity=_severity(pct),
            title=f"Batch {row.batch_code}: packed weight ≠ intake weight",
            description=(
                f"Batch {row.batch_code} received {batch_weight:.1f} kg but "
                f"{row.lot_count} lots total {lot_weight:.1f} kg "
                f"(variance {variance:+.1f} kg / {pct:.1f}%)."
            ),
            expected_value=batch_weight,
            actual_value=lot_weight,
            variance=variance,
            variance_pct=pct,
            unit="kg",
            entity_refs={"batch_id": row.id, "batch_code": row.batch_code},
            run_id=run_id,
        ))

    return alerts


# ─────────────────────────────────────────────────────────────
# CHECK 2:  GRN intake volume  ≠  grower payment quantity
# ─────────────────────────────────────────────────────────────

async def check_grn_vs_payment(db: AsyncSession, run_id: str) -> list[ReconciliationAlert]:
    """For each grower with both batches and payments, compare total
    received kg against total payment kg.  Uses GrowerPayment.total_kg
    which should reconcile against sum of Batch net weights."""

    # Total received per grower (from grower-routed batches only)
    batch_totals = (
        select(
            Batch.grower_id,
            func.coalesce(func.sum(
                case(
                    (Batch.net_weight_kg != None, Batch.net_weight_kg),  # noqa: E711
                    else_=Batch.gross_weight_kg,
                )
            ), 0).label("received_kg"),
            func.count(Batch.id).label("batch_count"),
        )
        .where(
            Batch.is_deleted == False,  # noqa: E712
            Batch.status != "rejected",
            Batch.payment_routing == "grower",
        )
        .group_by(Batch.grower_id)
        .subquery()
    )

    # Total paid per grower
    payment_totals = (
        select(
            GrowerPayment.grower_id,
            func.coalesce(func.sum(GrowerPayment.total_kg), 0).label("paid_kg"),
            func.coalesce(func.sum(GrowerPayment.net_amount), 0).label("paid_amount"),
            func.count(GrowerPayment.id).label("payment_count"),
        )
        .where(
            GrowerPayment.is_deleted == False,  # noqa: E712
            GrowerPayment.status != "cancelled",
        )
        .group_by(GrowerPayment.grower_id)
        .subquery()
    )

    stmt = (
        select(
            batch_totals.c.grower_id,
            Grower.name.label("grower_name"),
            batch_totals.c.received_kg,
            batch_totals.c.batch_count,
            payment_totals.c.paid_kg,
            payment_totals.c.paid_amount,
            payment_totals.c.payment_count,
        )
        .outerjoin(
            payment_totals,
            batch_totals.c.grower_id == payment_totals.c.grower_id,
        )
        .outerjoin(
            Grower,
            batch_totals.c.grower_id == Grower.id,
        )
    )

    result = await db.execute(stmt)
    alerts = []

    for row in result.all():
        received = float(row.received_kg or 0)
        paid = float(row.paid_kg or 0)

        if not received and not paid:
            continue

        variance = paid - received
        pct = _safe_pct(received, paid)

        if pct <= WEIGHT_TOLERANCE_PCT:
            continue

        grower_label = row.grower_name or row.grower_id
        alerts.append(ReconciliationAlert(
            alert_type="grn_vs_payment",
            severity=_severity(pct),
            title=f"{grower_label}: payment kg ≠ received kg",
            description=(
                f"{grower_label} received {received:.1f} kg across {row.batch_count} batches "
                f"but payments cover {paid:.1f} kg across {row.payment_count or 0} payments "
                f"(variance {variance:+.1f} kg / {pct:.1f}%). "
                f"Total paid: {row.paid_amount or 0:,.2f}."
            ),
            expected_value=received,
            actual_value=paid,
            variance=variance,
            variance_pct=pct,
            unit="kg",
            entity_refs={
                "grower_id": row.grower_id,
            },
            run_id=run_id,
        ))

    return alerts


# ─────────────────────────────────────────────────────────────
# CHECK 2b:  Harvest-team-routed batch volume  ≠  team payment quantity
# ─────────────────────────────────────────────────────────────

async def check_harvest_team_vs_payment(db: AsyncSession, run_id: str) -> list[ReconciliationAlert]:
    """For each harvest team with team-routed batches and payments, compare
    total received kg against total payment kg."""

    # Total received per harvest team (from harvest-team-routed batches)
    batch_totals = (
        select(
            Batch.harvest_team_id,
            func.coalesce(func.sum(
                case(
                    (Batch.net_weight_kg != None, Batch.net_weight_kg),  # noqa: E711
                    else_=Batch.gross_weight_kg,
                )
            ), 0).label("received_kg"),
            func.count(Batch.id).label("batch_count"),
        )
        .where(
            Batch.is_deleted == False,  # noqa: E712
            Batch.status != "rejected",
            Batch.payment_routing == "harvest_team",
            Batch.harvest_team_id != None,  # noqa: E711
        )
        .group_by(Batch.harvest_team_id)
        .subquery()
    )

    # Total paid per harvest team
    payment_totals = (
        select(
            HarvestTeamPayment.harvest_team_id,
            func.coalesce(func.sum(HarvestTeamPayment.total_kg), 0).label("paid_kg"),
            func.coalesce(func.sum(HarvestTeamPayment.net_amount), 0).label("paid_amount"),
            func.count(HarvestTeamPayment.id).label("payment_count"),
        )
        .where(
            HarvestTeamPayment.is_deleted == False,  # noqa: E712
            HarvestTeamPayment.status != "cancelled",
        )
        .group_by(HarvestTeamPayment.harvest_team_id)
        .subquery()
    )

    stmt = (
        select(
            batch_totals.c.harvest_team_id,
            HarvestTeam.name.label("team_name"),
            HarvestTeam.team_leader.label("team_leader"),
            batch_totals.c.received_kg,
            batch_totals.c.batch_count,
            payment_totals.c.paid_kg,
            payment_totals.c.paid_amount,
            payment_totals.c.payment_count,
        )
        .outerjoin(
            payment_totals,
            batch_totals.c.harvest_team_id == payment_totals.c.harvest_team_id,
        )
        .outerjoin(
            HarvestTeam,
            batch_totals.c.harvest_team_id == HarvestTeam.id,
        )
    )

    result = await db.execute(stmt)
    alerts = []

    for row in result.all():
        received = float(row.received_kg or 0)
        paid = float(row.paid_kg or 0)

        if not received and not paid:
            continue

        variance = paid - received
        pct = _safe_pct(received, paid)

        if pct <= WEIGHT_TOLERANCE_PCT:
            continue

        team_label = row.team_name or row.harvest_team_id
        if row.team_leader:
            team_label = f"{team_label} ({row.team_leader})"

        alerts.append(ReconciliationAlert(
            alert_type="team_vs_payment",
            severity=_severity(pct),
            title=f"{team_label}: payment kg ≠ received kg",
            description=(
                f"Team {team_label} received {received:.1f} kg across {row.batch_count} batches "
                f"but payments cover {paid:.1f} kg across {row.payment_count or 0} payments "
                f"(variance {variance:+.1f} kg / {pct:.1f}%). "
                f"Total paid: {row.paid_amount or 0:,.2f}."
            ),
            expected_value=received,
            actual_value=paid,
            variance=variance,
            variance_pct=pct,
            unit="kg",
            entity_refs={
                "harvest_team_id": row.harvest_team_id,
            },
            run_id=run_id,
        ))

    return alerts


# ─────────────────────────────────────────────────────────────
# CHECK 3:  Exported volume  ≠  invoiced volume
# ─────────────────────────────────────────────────────────────

async def check_export_vs_invoice(db: AsyncSession, run_id: str) -> list[ReconciliationAlert]:
    """For each Export with at least one container loaded, compare the
    total pallet/carton counts against linked ClientInvoice totals."""

    # Actual container totals per export
    container_totals = (
        select(
            Container.export_id,
            func.coalesce(func.sum(Container.pallet_count), 0).label("shipped_pallets"),
            func.coalesce(func.sum(Container.total_cartons), 0).label("shipped_cartons"),
            func.coalesce(func.sum(Container.gross_weight_kg), 0).label("shipped_kg"),
        )
        .where(
            Container.is_deleted == False,  # noqa: E712
            Container.export_id != None,  # noqa: E711
        )
        .group_by(Container.export_id)
        .subquery()
    )

    # Invoice totals per export
    invoice_totals = (
        select(
            ClientInvoice.export_id,
            func.coalesce(func.sum(ClientInvoice.total_amount), 0).label("invoiced_amount"),
            func.count(ClientInvoice.id).label("invoice_count"),
        )
        .where(
            ClientInvoice.is_deleted == False,  # noqa: E712
            ClientInvoice.export_id != None,  # noqa: E711
            ClientInvoice.status != "cancelled",
        )
        .group_by(ClientInvoice.export_id)
        .subquery()
    )

    stmt = (
        select(
            Export.id,
            Export.booking_ref,
            Export.client_name,
            Export.total_pallets,
            Export.total_cartons,
            Export.total_weight_kg,
            Export.total_value,
            container_totals.c.shipped_pallets,
            container_totals.c.shipped_cartons,
            container_totals.c.shipped_kg,
            invoice_totals.c.invoiced_amount,
            invoice_totals.c.invoice_count,
        )
        .outerjoin(container_totals, Export.id == container_totals.c.export_id)
        .outerjoin(invoice_totals, Export.id == invoice_totals.c.export_id)
        .where(
            Export.is_deleted == False,  # noqa: E712
            Export.status.in_(["loaded", "in_transit", "arrived", "completed"]),
        )
    )

    result = await db.execute(stmt)
    alerts = []

    for row in result.all():
        # --- Weight mismatch between export header and containers ---
        export_kg = float(row.total_weight_kg or 0)
        shipped_kg = float(row.shipped_kg or 0)

        if export_kg or shipped_kg:
            kg_variance = shipped_kg - export_kg
            kg_pct = _safe_pct(export_kg, shipped_kg)
            if kg_pct > WEIGHT_TOLERANCE_PCT:
                alerts.append(ReconciliationAlert(
                    alert_type="export_vs_invoice",
                    severity=_severity(kg_pct),
                    title=f"Export {row.booking_ref}: shipped kg ≠ booking kg",
                    description=(
                        f"Export {row.booking_ref} ({row.client_name}) booked "
                        f"{export_kg:.1f} kg but containers total {shipped_kg:.1f} kg "
                        f"(variance {kg_variance:+.1f} kg / {kg_pct:.1f}%)."
                    ),
                    expected_value=export_kg,
                    actual_value=shipped_kg,
                    variance=kg_variance,
                    variance_pct=kg_pct,
                    unit="kg",
                    entity_refs={
                        "export_id": row.id,
                        "booking_ref": row.booking_ref,
                    },
                    run_id=run_id,
                ))

        # --- Value mismatch between export and invoices ---
        export_value = float(row.total_value or 0)
        invoiced = float(row.invoiced_amount or 0)

        if export_value or invoiced:
            val_variance = invoiced - export_value
            if abs(val_variance) > AMOUNT_TOLERANCE:
                val_pct = _safe_pct(export_value, invoiced)
                alerts.append(ReconciliationAlert(
                    alert_type="export_vs_invoice",
                    severity=_severity(val_pct),
                    title=f"Export {row.booking_ref}: invoiced ≠ expected value",
                    description=(
                        f"Export {row.booking_ref} ({row.client_name}) expected value "
                        f"{export_value:,.2f} but {row.invoice_count or 0} invoices total "
                        f"{invoiced:,.2f} (variance {val_variance:+,.2f} / {val_pct:.1f}%)."
                    ),
                    expected_value=export_value,
                    actual_value=invoiced,
                    variance=val_variance,
                    variance_pct=val_pct,
                    unit="currency",
                    entity_refs={
                        "export_id": row.id,
                        "booking_ref": row.booking_ref,
                    },
                    run_id=run_id,
                ))

    return alerts


# ─────────────────────────────────────────────────────────────
# CHECK 4:  Pallet count on container  ≠  actual pallets linked
# ─────────────────────────────────────────────────────────────

async def check_container_vs_pallets(db: AsyncSession, run_id: str) -> list[ReconciliationAlert]:
    """Compare Container.pallet_count (header value) against the count
    of Pallet rows actually linked to each container."""

    actual_counts = (
        select(
            Pallet.container_id,
            func.count(Pallet.id).label("actual_pallets"),
            func.coalesce(func.sum(Pallet.current_boxes), 0).label("actual_cartons"),
            func.coalesce(func.sum(Pallet.gross_weight_kg), 0).label("actual_kg"),
        )
        .where(
            Pallet.is_deleted == False,  # noqa: E712
            Pallet.container_id != None,  # noqa: E711
        )
        .group_by(Pallet.container_id)
        .subquery()
    )

    stmt = (
        select(
            Container.id,
            Container.container_number,
            Container.pallet_count,
            Container.total_cartons,
            actual_counts.c.actual_pallets,
            actual_counts.c.actual_cartons,
        )
        .outerjoin(actual_counts, Container.id == actual_counts.c.container_id)
        .where(
            Container.is_deleted == False,  # noqa: E712
            Container.status.in_(["loading", "sealed", "dispatched"]),
        )
    )

    result = await db.execute(stmt)
    alerts = []

    for row in result.all():
        header_pallets = row.pallet_count or 0
        actual_pallets = int(row.actual_pallets or 0)

        if header_pallets == actual_pallets:
            continue

        variance = actual_pallets - header_pallets
        pct = _safe_pct(header_pallets, actual_pallets)

        alerts.append(ReconciliationAlert(
            alert_type="pallet_vs_container",
            severity="high" if abs(variance) > 2 else "medium",
            title=f"Container {row.container_number}: pallet count mismatch",
            description=(
                f"Container {row.container_number} header says {header_pallets} pallets "
                f"but {actual_pallets} pallets are actually linked "
                f"(variance {variance:+d}). "
                f"Cartons: header {row.total_cartons or 0} vs actual {row.actual_cartons or 0}."
            ),
            expected_value=float(header_pallets),
            actual_value=float(actual_pallets),
            variance=float(variance),
            variance_pct=pct,
            unit="pallets",
            entity_refs={
                "container_id": row.id,
                "container_number": row.container_number,
            },
            run_id=run_id,
        ))

    return alerts


# ─────────────────────────────────────────────────────────────
# CHECK 5:  Labour hours logged  ≠  cost applied
# ─────────────────────────────────────────────────────────────

async def check_labour_consistency(db: AsyncSession, run_id: str) -> list[ReconciliationAlert]:
    """For each LabourCost record that has hours_worked and rate_per_hour,
    verify that total_amount ≈ hours_worked × rate_per_hour × headcount.
    Also flags records with hours but zero cost, or cost but zero hours.

    Optimized: computes expected_total in SQL and only returns mismatched
    rows, avoiding a full table scan into Python.
    """

    hours_col = func.coalesce(LabourCost.hours_worked, literal(0))
    rate_col = func.coalesce(LabourCost.rate_per_hour, literal(0))
    headcount_col = func.coalesce(LabourCost.headcount, literal(1))
    total_col = func.coalesce(LabourCost.total_amount, literal(0))
    expected_col = hours_col * rate_col * headcount_col
    variance_col = total_col - expected_col

    # Case 1: has hours+rate but total doesn't match (beyond tolerance)
    calc_mismatch_stmt = (
        select(
            LabourCost.id,
            LabourCost.category,
            LabourCost.work_date,
            hours_col.label("hours"),
            rate_col.label("rate"),
            headcount_col.label("headcount"),
            total_col.label("total"),
            expected_col.label("expected_total"),
            variance_col.label("variance"),
        )
        .where(
            LabourCost.is_deleted == False,  # noqa: E712
            LabourCost.status != "cancelled",
            hours_col > 0,
            rate_col > 0,
            func.abs(variance_col) > AMOUNT_TOLERANCE,
        )
    )

    result = await db.execute(calc_mismatch_stmt)
    alerts = []

    for row in result.all():
        pct = _safe_pct(float(row.expected_total), float(row.total))
        alerts.append(ReconciliationAlert(
            alert_type="labour_vs_cost",
            severity=_severity(pct),
            title=f"Labour cost {row.id[:8]}: total ≠ hours × rate",
            description=(
                f"{row.category} labour on {row.work_date}: "
                f"{float(row.hours):.1f}h × {float(row.rate):.2f}/h × "
                f"{float(row.headcount):.0f} heads = "
                f"{float(row.expected_total):,.2f} expected, but recorded "
                f"{float(row.total):,.2f} "
                f"(variance {float(row.variance):+,.2f} / {pct:.1f}%)."
            ),
            expected_value=float(row.expected_total),
            actual_value=float(row.total),
            variance=float(row.variance),
            variance_pct=pct,
            unit="currency",
            entity_refs={
                "labour_cost_id": row.id,
                "category": row.category,
                "work_date": str(row.work_date),
            },
            run_id=run_id,
        ))

    # Case 2: has cost but no hours/rate (cannot verify)
    no_hours_stmt = (
        select(
            LabourCost.id,
            LabourCost.category,
            LabourCost.work_date,
            total_col.label("total"),
        )
        .where(
            LabourCost.is_deleted == False,  # noqa: E712
            LabourCost.status != "cancelled",
            total_col > AMOUNT_TOLERANCE,
            hours_col == 0,
            rate_col == 0,
        )
    )

    result2 = await db.execute(no_hours_stmt)

    for row in result2.all():
        alerts.append(ReconciliationAlert(
            alert_type="labour_vs_cost",
            severity="medium",
            title=f"Labour cost {row.id[:8]}: cost recorded without hours",
            description=(
                f"{row.category} labour on {row.work_date}: "
                f"{float(row.total):,.2f} recorded but no hours or rate "
                f"specified. Cannot verify cost calculation."
            ),
            expected_value=0,
            actual_value=float(row.total),
            variance=float(row.total),
            variance_pct=100.0,
            unit="currency",
            entity_refs={
                "labour_cost_id": row.id,
                "category": row.category,
                "work_date": str(row.work_date),
            },
            run_id=run_id,
        ))

    return alerts


# ─────────────────────────────────────────────────────────────
# CHECK 6:  Batches without any payment record
# ─────────────────────────────────────────────────────────────

async def check_unpaid_batches(db: AsyncSession, run_id: str) -> list[ReconciliationAlert]:
    """Flag completed batches that have no associated GrowerPayment.
    Uses the JSON batch_ids array on GrowerPayment — a batch is
    considered covered if its ID appears in any payment's batch_ids.

    Since batch_ids is a JSON array and scanning it at scale is expensive,
    we use a simpler approach: check growers with batches but zero payments.
    """

    # Growers with completed grower-routed batches
    batch_growers = (
        select(
            Batch.grower_id,
            func.count(Batch.id).label("batch_count"),
            func.coalesce(func.sum(
                case(
                    (Batch.net_weight_kg != None, Batch.net_weight_kg),  # noqa: E711
                    else_=Batch.gross_weight_kg,
                )
            ), 0).label("total_kg"),
        )
        .where(
            Batch.is_deleted == False,  # noqa: E712
            Batch.status == "complete",
            Batch.payment_routing == "grower",
        )
        .group_by(Batch.grower_id)
        .subquery()
    )

    # Growers with any non-cancelled payment
    paid_growers = (
        select(GrowerPayment.grower_id)
        .where(
            GrowerPayment.is_deleted == False,  # noqa: E712
            GrowerPayment.status != "cancelled",
        )
        .distinct()
        .subquery()
    )

    stmt = (
        select(
            batch_growers.c.grower_id,
            batch_growers.c.batch_count,
            batch_growers.c.total_kg,
        )
        .outerjoin(paid_growers, batch_growers.c.grower_id == paid_growers.c.grower_id)
        .where(paid_growers.c.grower_id == None)  # noqa: E711
    )

    result = await db.execute(stmt)
    alerts = []

    for row in result.all():
        alerts.append(ReconciliationAlert(
            alert_type="grn_vs_payment",
            severity="high",
            title=f"Grower {row.grower_id[:8]}…: {row.batch_count} batches with zero payments",
            description=(
                f"Grower has {row.batch_count} completed batches "
                f"totalling {float(row.total_kg):,.1f} kg but no payment records exist."
            ),
            expected_value=float(row.total_kg),
            actual_value=0,
            variance=-float(row.total_kg),
            variance_pct=100.0,
            unit="kg",
            entity_refs={"grower_id": row.grower_id},
            run_id=run_id,
        ))

    return alerts


# ─────────────────────────────────────────────────────────────
# ORCHESTRATOR:  Run all checks in one pass
# ─────────────────────────────────────────────────────────────

async def run_full_reconciliation(db: AsyncSession) -> dict:
    """Execute all reconciliation checks, persist alerts, return summary.

    Returns:
        {
            "run_id": "...",
            "ran_at": "...",
            "total_alerts": int,
            "by_type": {"grn_vs_payment": int, ...},
            "by_severity": {"critical": int, "high": int, ...},
        }
    """
    run_id = str(uuid.uuid4())

    # Auto-resolve stale open alerts from previous runs
    # (if a mismatch no longer appears, it was fixed)
    old_open = await db.execute(
        select(ReconciliationAlert).where(
            ReconciliationAlert.status == "open",
            ReconciliationAlert.run_id != run_id,
        )
    )
    for old_alert in old_open.scalars().all():
        old_alert.status = "resolved"
        old_alert.resolution_note = "Auto-resolved: mismatch no longer detected"
        old_alert.resolved_at = datetime.utcnow()
    await db.flush()

    # Run all checks
    all_alerts: list[ReconciliationAlert] = []

    checks = [
        check_batch_vs_lots,
        check_grn_vs_payment,
        check_harvest_team_vs_payment,
        check_export_vs_invoice,
        check_container_vs_pallets,
        check_labour_consistency,
        check_unpaid_batches,
    ]

    for check_fn in checks:
        alerts = await check_fn(db, run_id)
        all_alerts.extend(alerts)

    # Persist new alerts
    for alert in all_alerts:
        db.add(alert)
    await db.flush()

    # Build summary
    by_type: dict[str, int] = {}
    by_severity: dict[str, int] = {}
    for a in all_alerts:
        by_type[a.alert_type] = by_type.get(a.alert_type, 0) + 1
        by_severity[a.severity] = by_severity.get(a.severity, 0) + 1

    return {
        "run_id": run_id,
        "ran_at": datetime.utcnow().isoformat(),
        "total_alerts": len(all_alerts),
        "by_type": by_type,
        "by_severity": by_severity,
    }
