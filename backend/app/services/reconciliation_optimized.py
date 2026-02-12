"""Optimized reconciliation queries.

This module contains performance-optimized versions of reconciliation checks
that use aggregates and CTEs to minimize database scans.

Key optimizations:
1. Use CTEs (Common Table Expressions) for better query planning
2. Combine multiple aggregates in single pass
3. Use database-side filtering to reduce data transfer
4. Avoid loading full ORM objects when not needed
"""

from datetime import datetime
from sqlalchemy import func, select, and_, case
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.tenant.batch import Batch
from app.models.tenant.lot import Lot
from app.models.tenant.grower_payment import GrowerPayment
from app.models.tenant.labour_cost import LabourCost
from app.models.tenant.reconciliation_alert import ReconciliationAlert


# Same thresholds as original
WEIGHT_TOLERANCE_PCT = 2.0
AMOUNT_TOLERANCE = 50.0


async def run_optimized_grn_vs_payment_check(
    db: AsyncSession,
    run_id: str,
) -> list[ReconciliationAlert]:
    """Optimized GRN vs Payment check.

    Instead of loading all batches and all payments separately,
    use a single CTE-based query that computes both aggregates
    and joins them efficiently.

    Performance: O(n) instead of O(n+m) with reduced memory usage
    """

    # CTE: Aggregate batches by grower
    batch_agg = (
        select(
            Batch.grower_id,
            func.coalesce(
                func.sum(
                    case(
                        (Batch.net_weight_kg != None, Batch.net_weight_kg),
                        else_=Batch.gross_weight_kg,
                    )
                ),
                0,
            ).label("received_kg"),
            func.count(Batch.id).label("batch_count"),
        )
        .where(
            Batch.is_deleted == False,
            Batch.status != "rejected",
        )
        .group_by(Batch.grower_id)
        .cte("batch_totals")
    )

    # CTE: Aggregate payments by grower
    payment_agg = (
        select(
            GrowerPayment.grower_id,
            func.coalesce(func.sum(GrowerPayment.total_kg), 0).label("paid_kg"),
            func.coalesce(func.sum(GrowerPayment.net_amount), 0).label("paid_amount"),
            func.count(GrowerPayment.id).label("payment_count"),
        )
        .where(
            GrowerPayment.is_deleted == False,
            GrowerPayment.status != "cancelled",
        )
        .group_by(GrowerPayment.grower_id)
        .cte("payment_totals")
    )

    # Final query: Join CTEs and filter for mismatches
    stmt = (
        select(
            batch_agg.c.grower_id,
            batch_agg.c.received_kg,
            batch_agg.c.batch_count,
            payment_agg.c.paid_kg,
            payment_agg.c.paid_amount,
            payment_agg.c.payment_count,
        )
        .select_from(batch_agg)
        .outerjoin(payment_agg, batch_agg.c.grower_id == payment_agg.c.grower_id)
        # Filter in database instead of Python
        .where(
            func.abs(
                (payment_agg.c.paid_kg - batch_agg.c.received_kg)
                / func.nullif(batch_agg.c.received_kg, 0)
                * 100
            )
            > WEIGHT_TOLERANCE_PCT
        )
    )

    result = await db.execute(stmt)
    alerts = []

    for row in result.all():
        received = float(row.received_kg or 0)
        paid = float(row.paid_kg or 0)
        variance = paid - received
        pct = abs(variance / received * 100) if received else 100.0

        severity = (
            "critical" if pct >= 20
            else "high" if pct >= 10
            else "medium" if pct >= 5
            else "low"
        )

        alerts.append(
            ReconciliationAlert(
                alert_type="grn_vs_payment",
                severity=severity,
                title=f"Grower payment mismatch: {pct:.1f}%",
                description=(
                    f"Grower received {received:.1f} kg but payments cover {paid:.1f} kg "
                    f"(variance {variance:+.1f} kg / {pct:.1f}%)"
                ),
                expected_value=received,
                actual_value=paid,
                variance=variance,
                variance_pct=pct,
                unit="kg",
                entity_refs={"grower_id": row.grower_id},
                run_id=run_id,
            )
        )

    return alerts


async def run_optimized_labour_check(
    db: AsyncSession,
    run_id: str,
) -> list[ReconciliationAlert]:
    """Optimized labour cost consistency check.

    Uses database-side computation to filter inconsistencies
    before loading data into Python.

    Performance: Reduces data transfer by 90%+ for clean records
    """

    # Filter on database side for records with mismatches
    stmt = (
        select(
            LabourCost.id,
            LabourCost.category,
            LabourCost.work_date,
            LabourCost.hours_worked,
            LabourCost.rate_per_hour,
            LabourCost.headcount,
            LabourCost.total_amount,
            # Compute expected on database side
            (
                LabourCost.hours_worked
                * LabourCost.rate_per_hour
                * func.coalesce(LabourCost.headcount, 1)
            ).label("expected_total"),
        )
        .where(
            LabourCost.is_deleted == False,
            LabourCost.status != "cancelled",
            # Only fetch records with mismatches
            func.abs(
                LabourCost.total_amount
                - (
                    LabourCost.hours_worked
                    * LabourCost.rate_per_hour
                    * func.coalesce(LabourCost.headcount, 1)
                )
            )
            > AMOUNT_TOLERANCE,
        )
    )

    result = await db.execute(stmt)
    alerts = []

    for row in result.all():
        hours = row.hours_worked or 0
        rate = row.rate_per_hour or 0
        total = row.total_amount or 0
        expected = row.expected_total or 0
        variance = total - expected
        pct = abs(variance / expected * 100) if expected else 100.0

        severity = (
            "critical" if pct >= 20
            else "high" if pct >= 10
            else "medium" if pct >= 5
            else "low"
        )

        alerts.append(
            ReconciliationAlert(
                alert_type="labour_vs_cost",
                severity=severity,
                title=f"Labour cost mismatch: {row.category}",
                description=(
                    f"{hours:.1f}h × {rate:.2f}/h = {expected:,.2f} expected, "
                    f"but recorded {total:,.2f} (variance {variance:+,.2f})"
                ),
                expected_value=expected,
                actual_value=total,
                variance=variance,
                variance_pct=pct,
                unit="currency",
                entity_refs={
                    "labour_cost_id": row.id,
                    "category": row.category,
                    "work_date": str(row.work_date),
                },
                run_id=run_id,
            )
        )

    return alerts


# Export optimized functions
__all__ = [
    "run_optimized_grn_vs_payment_check",
    "run_optimized_labour_check",
]
