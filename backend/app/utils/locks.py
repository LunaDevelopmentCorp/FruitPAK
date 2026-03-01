"""Downstream locking — prevent edits to fields referenced downstream.

Each check function returns a LockInfo describing which fields are locked
and why, without raising exceptions.  The caller (router) decides whether
to block the request based on which fields are being updated.
"""

from __future__ import annotations

from dataclasses import dataclass, field

import json

from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.tenant.pallet import Pallet, PalletLot
from app.models.tenant.container import Container
from app.models.tenant.export import Export
from app.models.tenant.grower_payment import GrowerPayment
from app.models.tenant.harvest_team_payment import HarvestTeamPayment


# ── Data structures ────────────────────────────────────────────


@dataclass
class FieldLock:
    """A single locked field with reason and unlock instructions."""
    field: str
    reason: str
    blocker_type: str   # "pallet_lot", "container", "export", "payment"
    blocker_ref: str    # human-readable reference (e.g. "PAL-20260301-014")
    unlock_hint: str    # "Remove pallet allocations first."


@dataclass
class LockInfo:
    """Lock state for an entity.  Empty locked_fields means nothing locked."""
    locked_fields: dict[str, FieldLock] = field(default_factory=dict)

    @property
    def is_locked(self) -> bool:
        return len(self.locked_fields) > 0

    def check_update(self, updating_fields: set[str]) -> FieldLock | None:
        """Return the first FieldLock that conflicts, or None."""
        for f in updating_fields:
            if f in self.locked_fields:
                return self.locked_fields[f]
        return None

    def locked_field_names(self) -> list[str]:
        return list(self.locked_fields.keys())


def _add_locks(
    info: LockInfo,
    field_names: list[str],
    reason: str,
    blocker_type: str,
    blocker_ref: str,
    unlock_hint: str,
) -> None:
    for name in field_names:
        info.locked_fields[name] = FieldLock(
            field=name,
            reason=f"Cannot edit {name}: {reason}",
            blocker_type=blocker_type,
            blocker_ref=blocker_ref,
            unlock_hint=unlock_hint,
        )


# ── Lot locks (downstream: PalletLot allocations) ─────────────


LOT_QUANTITY_FIELDS = ["carton_count", "weight_kg", "grade", "size", "box_size_id"]


async def get_lot_locks(db: AsyncSession, lot) -> LockInfo:
    """Check if a lot has active pallet allocations."""
    info = LockInfo()

    result = await db.execute(
        select(
            func.sum(PalletLot.box_count),
            func.count(PalletLot.id),
        ).where(
            PalletLot.lot_id == lot.id,
            PalletLot.is_deleted == False,  # noqa: E712
        )
    )
    row = result.one()
    total_boxes = int(row[0] or 0)
    alloc_count = int(row[1] or 0)

    if alloc_count == 0:
        return info

    # Get a representative pallet number for the message
    pallet_result = await db.execute(
        select(Pallet.pallet_number)
        .join(PalletLot, PalletLot.pallet_id == Pallet.id)
        .where(
            PalletLot.lot_id == lot.id,
            PalletLot.is_deleted == False,  # noqa: E712
        )
        .limit(1)
    )
    pallet_ref = pallet_result.scalar() or "unknown"
    suffix = f" (+{alloc_count - 1} more)" if alloc_count > 1 else ""

    _add_locks(
        info,
        LOT_QUANTITY_FIELDS,
        reason=f"{total_boxes} boxes allocated to {pallet_ref}{suffix}",
        blocker_type="pallet_lot",
        blocker_ref=pallet_ref,
        unlock_hint="Remove pallet allocations first.",
    )
    return info


# ── Batch locks (downstream: paid Payments) ────────────────────


BATCH_FINANCIAL_FIELDS = [
    "payment_routing", "harvest_rate_per_kg",
    "gross_weight_kg", "tare_weight_kg", "net_weight_kg",
]


async def get_batch_locks(db: AsyncSession, batch) -> LockInfo:
    """Check if a batch is referenced by paid payments."""
    info = LockInfo()

    # Use PostgreSQL JSONB containment (@>) to filter server-side
    # This avoids loading all payments into Python
    batch_id_literal = json.dumps([batch.id])

    # Grower payments referencing this batch
    gp_result = await db.execute(
        select(GrowerPayment.payment_ref).where(
            GrowerPayment.is_deleted == False,  # noqa: E712
            GrowerPayment.status == "paid",
            text("batch_ids::jsonb @> :bid").bindparams(bid=batch_id_literal),
        ).limit(3)
    )
    grower_refs = [row[0] for row in gp_result.all()]

    # Team payments referencing this batch
    htp_result = await db.execute(
        select(HarvestTeamPayment.payment_ref).where(
            HarvestTeamPayment.is_deleted == False,  # noqa: E712
            HarvestTeamPayment.status == "paid",
            text("batch_ids::jsonb @> :bid").bindparams(bid=batch_id_literal),
        ).limit(3)
    )
    team_refs = [row[0] for row in htp_result.all()]

    all_refs = grower_refs + team_refs
    if not all_refs:
        return info

    first_ref = all_refs[0]
    suffix = f" (+{len(all_refs) - 1} more)" if len(all_refs) > 1 else ""

    _add_locks(
        info,
        BATCH_FINANCIAL_FIELDS,
        reason=f"Paid payment {first_ref}{suffix} references this batch",
        blocker_type="payment",
        blocker_ref=first_ref,
        unlock_hint="Cancel the payment first.",
    )
    return info


# ── Pallet locks (downstream: Container loading) ──────────────


PALLET_LOCKED_FIELDS = [
    "grade", "size", "box_size_id", "capacity_boxes",
    "pallet_type_name", "fruit_type", "variety",
]


async def get_pallet_locks(db: AsyncSession, pallet) -> LockInfo:
    """Check if a pallet is loaded into a container."""
    info = LockInfo()

    if not pallet.container_id:
        return info

    container_result = await db.execute(
        select(Container.container_number).where(Container.id == pallet.container_id)
    )
    container_ref = container_result.scalar() or "unknown"

    _add_locks(
        info,
        PALLET_LOCKED_FIELDS,
        reason=f"Pallet loaded in container {container_ref}",
        blocker_type="container",
        blocker_ref=container_ref,
        unlock_hint="Unload pallet from container first.",
    )
    return info


# ── Container locks (downstream: dispatched Export) ────────────


CONTAINER_LOCKED_FIELDS = [
    "container_type", "capacity_pallets", "client_id",
    "customer_name", "destination", "shipping_container_number",
    "export_date", "seal_number",
]


async def get_container_locks(db: AsyncSession, container) -> LockInfo:
    """Check if a container is in a dispatched/in-transit/arrived export."""
    info = LockInfo()

    if not container.export_id:
        return info

    export_result = await db.execute(
        select(Export.booking_ref, Export.status).where(Export.id == container.export_id)
    )
    row = export_result.one_or_none()
    if not row or row[1] not in ("dispatched", "in_transit", "arrived"):
        return info

    _add_locks(
        info,
        CONTAINER_LOCKED_FIELDS,
        reason=f"Container is in export {row[0]} (status: {row[1]})",
        blocker_type="export",
        blocker_ref=row[0],
        unlock_hint="Wait for export to complete or remove container from export.",
    )
    return info


# ── Payment locks (status-based, no DB query needed) ──────────


PAYMENT_LOCKED_FIELDS = ["amount", "payment_type"]


def get_payment_locks(payment) -> LockInfo:
    """Check if a payment is already paid."""
    info = LockInfo()

    if payment.status != "paid":
        return info

    _add_locks(
        info,
        PAYMENT_LOCKED_FIELDS,
        reason=f"Payment {payment.payment_ref} is already paid",
        blocker_type="payment_status",
        blocker_ref=payment.payment_ref,
        unlock_hint="Cancel the payment and create a new one.",
    )
    return info
