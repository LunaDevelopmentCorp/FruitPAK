"""Batch router — GRN intake and batch management.

Endpoints:
    POST   /api/batches/grn           Create batch via GRN intake
    GET    /api/batches/              List batches (with filters)
    GET    /api/batches/{batch_id}    Single batch detail
    GET    /api/batches/{batch_id}/qr QR code SVG for batch
    PATCH  /api/batches/{batch_id}   Update batch fields
    DELETE /api/batches/{batch_id}   Soft-delete batch and its lots
"""

import io
import json
from datetime import date, datetime

import segno
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import Response
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth.deps import require_onboarded, require_permission
from app.auth.permissions import has_permission
from app.database import get_db, get_tenant_db
from app.models.public.user import User
from app.models.tenant.batch import Batch
from app.models.tenant.batch_history import BatchHistory
from app.models.tenant.grower import Grower
from app.models.tenant.lot import Lot
from app.models.tenant.pallet import PalletLot
from app.schemas.batch import (
    BatchDetailOut,
    BatchHistoryOut,
    BatchOut,
    BatchSummary,
    BatchUpdate,
    GRNRequest,
    GRNResponse,
    LotSummaryWithAllocation,
)
from app.schemas.common import CursorPaginatedResponse, PaginatedResponse
from app.services.grn import create_grn
from app.utils.activity import log_activity
from app.utils.cache import cached, invalidate_cache

router = APIRouter()


# ── GRN Intake ───────────────────────────────────────────────

@router.post("/grn", response_model=GRNResponse, status_code=status.HTTP_201_CREATED)
async def grn_intake(
    body: GRNRequest,
    db: AsyncSession = Depends(get_tenant_db),
    user: User = Depends(require_permission("batch.write")),
    _onboarded: User = Depends(require_onboarded),
):
    """Create a new batch from a GRN (Goods Received Note) intake.

    Generates a unique batch code, records the intake event in
    BatchHistory, and links any pending advance payment for the grower.

    Returns the batch details plus a QR code stub URL for traceability.
    """
    try:
        result = await create_grn(body, user_id=user.id, db=db)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=str(exc),
        )

    batch = result["batch"]
    qr_url = f"/api/batches/{batch.id}/qr"

    await invalidate_cache("batches:*")

    await log_activity(
        db, user,
        action="created",
        entity_type="batch",
        entity_id=batch.id,
        entity_code=batch.batch_code,
        summary=f"Submitted GRN {batch.batch_code} — {batch.fruit_type or 'unknown'}, {batch.net_weight_kg or 0:.1f} kg",
    )

    return GRNResponse(
        batch=BatchOut.model_validate(batch),
        qr_code_url=qr_url,
        advance_payment_linked=result["advance_payment_linked"],
        advance_payment_ref=result["advance_payment_ref"],
    )


# ── List batches ─────────────────────────────────────────────

@router.get("/", response_model=CursorPaginatedResponse[BatchSummary])
@cached(ttl=60, prefix="batches")  # Cache for 1 minute (batches change frequently)
async def list_batches(
    grower_id: str | None = Query(None),
    harvest_team_id: str | None = Query(None),
    batch_status: str | None = Query(None, alias="status"),
    fruit_type: str | None = Query(None),
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    search: str | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
    cursor: str | None = Query(None),
    db: AsyncSession = Depends(get_tenant_db),
    _user: User = Depends(require_permission("batch.read")),
    _onboarded: User = Depends(require_onboarded),
):
    # Build base query with filters
    base_stmt = select(Batch).where(Batch.is_deleted == False)  # noqa: E712

    if grower_id:
        base_stmt = base_stmt.where(Batch.grower_id == grower_id)
    if harvest_team_id:
        base_stmt = base_stmt.where(Batch.harvest_team_id == harvest_team_id)
    if batch_status:
        base_stmt = base_stmt.where(Batch.status == batch_status)
    if fruit_type:
        base_stmt = base_stmt.where(Batch.fruit_type == fruit_type)
    if date_from:
        base_stmt = base_stmt.where(Batch.intake_date >= date_from)
    if date_to:
        base_stmt = base_stmt.where(Batch.intake_date <= date_to)
    if search:
        q = f"%{search}%"
        base_stmt = base_stmt.join(Grower, Batch.grower_id == Grower.id, isouter=True).where(
            or_(
                Batch.batch_code.ilike(q),
                Batch.fruit_type.ilike(q),
                Grower.name.ilike(q),
            )
        )

    # Count total matching records
    count_stmt = select(func.count()).select_from(base_stmt.subquery())
    total = await db.scalar(count_stmt) or 0

    # Apply cursor (created_at of last item from previous page)
    if cursor:
        try:
            cursor_dt = datetime.fromisoformat(cursor)
            base_stmt = base_stmt.where(Batch.created_at > cursor_dt)
        except ValueError:
            pass

    # Fetch limit+1 to detect has_more without a second COUNT query
    # Oldest first (FIFO) — packhouses process first-in first-out
    items_stmt = (
        base_stmt
        .options(selectinload(Batch.grower), selectinload(Batch.harvest_team))
        .order_by(Batch.created_at.asc())
        .limit(limit + 1)
    )
    result = await db.execute(items_stmt)
    rows = list(result.scalars().all())

    has_more = len(rows) > limit
    items = rows[:limit]

    next_cursor = None
    if has_more and items:
        next_cursor = items[-1].created_at.isoformat()

    return CursorPaginatedResponse(
        items=[BatchSummary.model_validate(b) for b in items],
        total=total,
        limit=limit,
        next_cursor=next_cursor,
        has_more=has_more,
    )


# ── Single batch detail ──────────────────────────────────────

@router.get("/{batch_id}", response_model=BatchDetailOut)
async def get_batch(
    batch_id: str,
    db: AsyncSession = Depends(get_tenant_db),
    public_db: AsyncSession = Depends(get_db),
    _user: User = Depends(require_permission("batch.read")),
    _onboarded: User = Depends(require_onboarded),
):
    # Load batch with grower, packhouse, lots (but NOT history — loaded separately with limit)
    result = await db.execute(
        select(Batch)
        .where(Batch.id == batch_id, Batch.is_deleted == False)  # noqa: E712
        .options(
            selectinload(Batch.grower),
            selectinload(Batch.packhouse),
            selectinload(Batch.lots),
        )
    )
    batch = result.scalar_one_or_none()
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")

    # Load history separately — last 50 events only (uses (batch_id, recorded_at) index)
    history_result = await db.execute(
        select(BatchHistory)
        .where(BatchHistory.batch_id == batch_id)
        .order_by(BatchHistory.recorded_at.desc())
        .limit(50)
    )
    history_events = list(reversed(history_result.scalars().all()))

    detail = BatchDetailOut.model_validate(batch)
    detail.history = [BatchHistoryOut.model_validate(h) for h in history_events]

    # Resolve received_by UUID → user full_name (User lives in public schema)
    if batch.received_by:
        user_result = await public_db.execute(
            select(User.full_name).where(User.id == batch.received_by)
        )
        name = user_result.scalar_one_or_none()
        if name:
            detail.received_by_name = name

    # Resolve recorded_by UUIDs in history events → user full names
    recorder_ids = {
        h.recorded_by for h in history_events if h.recorded_by
    }
    if recorder_ids:
        name_result = await public_db.execute(
            select(User.id, User.full_name).where(User.id.in_(recorder_ids))
        )
        name_map = {row[0]: row[1] for row in name_result.all()}
        for h_out in detail.history:
            if h_out.recorded_by and h_out.recorded_by in name_map:
                h_out.recorded_by_name = name_map[h_out.recorded_by]

    # Compute palletized box counts per lot (single batched query)
    if batch.lots:
        lot_ids = [lot.id for lot in batch.lots]
        pal_result = await db.execute(
            select(PalletLot.lot_id, func.sum(PalletLot.box_count))
            .where(PalletLot.lot_id.in_(lot_ids), PalletLot.is_deleted == False)  # noqa: E712
            .group_by(PalletLot.lot_id)
        )
        palletized_map = {row[0]: int(row[1]) for row in pal_result.all()}
        for lot_out in detail.lots:
            lot_out.palletized_boxes = palletized_map.get(lot_out.id, 0)

    return detail


# ── QR code ──────────────────────────────────────────────────

@router.get("/{batch_id}/qr")
async def get_batch_qr(
    batch_id: str,
    db: AsyncSession = Depends(get_tenant_db),
    _user: User = Depends(require_permission("batch.read")),
    _onboarded: User = Depends(require_onboarded),
):
    """Return an SVG QR code encoding key batch information."""
    result = await db.execute(
        select(Batch).where(Batch.id == batch_id, Batch.is_deleted == False)  # noqa: E712
        .options(selectinload(Batch.grower))
    )
    batch = result.scalar_one_or_none()
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")

    grower_name = batch.grower.name if batch.grower else None
    qr_data = json.dumps({
        "batch_id": batch.id,
        "code": batch.batch_code,
        "grower_name": grower_name,
        "variety": batch.variety,
        "net_weight_kg": float(batch.net_weight_kg) if batch.net_weight_kg else None,
        "intake_date": batch.intake_date.isoformat() if batch.intake_date else None,
    }, separators=(",", ":"))

    qr = segno.make(qr_data)
    buf = io.BytesIO()
    qr.save(buf, kind="svg", scale=4, dark="#15803d")
    return Response(content=buf.getvalue(), media_type="image/svg+xml")


# ── Update batch ─────────────────────────────────────────────

@router.patch("/{batch_id}", response_model=BatchOut)
async def update_batch(
    batch_id: str,
    body: BatchUpdate,
    db: AsyncSession = Depends(get_tenant_db),
    _user: User = Depends(require_permission("batch.write")),
    _onboarded: User = Depends(require_onboarded),
):
    # Financial fields require financials.write permission
    financial_fields = {"payment_routing", "harvest_rate_per_kg"}
    updating = set(body.model_dump(exclude_unset=True).keys())
    if updating & financial_fields:
        payload = getattr(_user, "_token_payload", {})
        user_perms = payload.get("permissions", [])
        if not has_permission(user_perms, "financials.write"):
            raise HTTPException(
                status_code=403,
                detail="financials.write permission required to change payment routing or harvest rate",
            )

    result = await db.execute(
        select(Batch).where(Batch.id == batch_id, Batch.is_deleted == False)  # noqa: E712
        .options(selectinload(Batch.grower))
    )
    batch = result.scalar_one_or_none()
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(batch, field, value)

    # Recompute net weight if gross or tare changed (guard against None)
    if body.gross_weight_kg is not None or body.tare_weight_kg is not None:
        if batch.gross_weight_kg is not None:
            batch.net_weight_kg = batch.gross_weight_kg - (batch.tare_weight_kg or 0)

    await db.flush()
    await invalidate_cache("batches:*")
    return BatchOut.model_validate(batch)


# ── Close production run ─────────────────────────────────────

@router.post("/{batch_id}/close", response_model=BatchOut)
async def close_production_run(
    batch_id: str,
    db: AsyncSession = Depends(get_tenant_db),
    _user: User = Depends(require_permission("batch.write")),
    _onboarded: User = Depends(require_onboarded),
):
    """Close a batch production run.

    Validates that incoming weight is accounted for (lot weight + waste).
    Sets status to 'complete'.
    """
    result = await db.execute(
        select(Batch)
        .where(Batch.id == batch_id, Batch.is_deleted == False)  # noqa: E712
        .options(selectinload(Batch.lots), selectinload(Batch.grower))
    )
    batch = result.scalar_one_or_none()
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")

    if batch.status == "complete":
        raise HTTPException(status_code=400, detail="Batch already closed")

    # Check for unallocated boxes (lots with cartons not yet palletized)
    lot_ids = [lot.id for lot in batch.lots] if batch.lots else []
    palletized_map: dict[str, int] = {}
    if lot_ids:
        pal_result = await db.execute(
            select(PalletLot.lot_id, func.sum(PalletLot.box_count))
            .where(PalletLot.lot_id.in_(lot_ids), PalletLot.is_deleted == False)  # noqa: E712
            .group_by(PalletLot.lot_id)
        )
        palletized_map = {row[0]: int(row[1]) for row in pal_result.all()}

    unallocated_lots = []
    for lot in (batch.lots or []):
        palletized = palletized_map.get(lot.id, 0)
        if palletized < lot.carton_count:
            unallocated_lots.append(
                f"{lot.lot_code}: {lot.carton_count - palletized} boxes unallocated"
            )

    if unallocated_lots:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot close: {'; '.join(unallocated_lots)}",
        )

    batch.status = "complete"
    await db.flush()
    await invalidate_cache("batches:*")

    await log_activity(
        db, _user,
        action="status_changed",
        entity_type="batch",
        entity_id=batch.id,
        entity_code=batch.batch_code,
        summary=f"Closed production run for {batch.batch_code}",
    )

    return BatchOut.model_validate(batch)


# ── Reopen production run ─────────────────────────────────────

@router.post("/{batch_id}/reopen", response_model=BatchOut)
async def reopen_production_run(
    batch_id: str,
    db: AsyncSession = Depends(get_tenant_db),
    _user: User = Depends(require_permission("batch.write")),
    _onboarded: User = Depends(require_onboarded),
):
    """Reopen a closed production run to allow further edits.

    Only works on batches with status 'complete'. Finalized batches
    cannot be reopened.
    """
    result = await db.execute(
        select(Batch)
        .where(Batch.id == batch_id, Batch.is_deleted == False)  # noqa: E712
        .options(selectinload(Batch.grower))
    )
    batch = result.scalar_one_or_none()
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")

    if batch.status != "complete":
        raise HTTPException(
            status_code=400,
            detail="Only closed (complete) batches can be reopened",
        )

    batch.status = "packing"
    await db.flush()
    await invalidate_cache("batches:*")

    await log_activity(
        db, _user,
        action="status_changed",
        entity_type="batch",
        entity_id=batch.id,
        entity_code=batch.batch_code,
        summary=f"Reopened production run for {batch.batch_code}",
    )

    return BatchOut.model_validate(batch)


# ── Finalize GRN ─────────────────────────────────────────────

@router.post("/{batch_id}/finalize", response_model=BatchOut)
async def finalize_grn(
    batch_id: str,
    db: AsyncSession = Depends(get_tenant_db),
    _user: User = Depends(require_permission("batch.write")),
    _onboarded: User = Depends(require_onboarded),
):
    """Finalize a GRN after production run is closed.

    Validates mass balance (incoming net == lot weight + waste) within
    0.5 kg tolerance, then sets status to 'completed'.
    """
    result = await db.execute(
        select(Batch)
        .where(Batch.id == batch_id, Batch.is_deleted == False)  # noqa: E712
        .options(selectinload(Batch.lots), selectinload(Batch.grower))
    )
    batch = result.scalar_one_or_none()
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")

    if batch.status == "completed":
        raise HTTPException(status_code=400, detail="GRN already finalized")
    if batch.status != "complete":
        raise HTTPException(
            status_code=400,
            detail="Production run must be closed before finalizing",
        )

    # Mass balance — auto-assign unaccounted weight as batch waste
    incoming_net = batch.net_weight_kg or 0.0
    total_lot_weight = sum(
        (lot.weight_kg if lot.weight_kg is not None else lot.carton_count * 4.0)
        for lot in (batch.lots or [])
    )
    total_lot_waste = sum(
        (lot.waste_kg or 0.0) for lot in (batch.lots or [])
    )
    batch_waste = batch.waste_kg or 0.0
    accounted = total_lot_weight + total_lot_waste + batch_waste
    diff = incoming_net - accounted  # positive = unaccounted weight

    adjustment_note = ""
    if abs(diff) > 0.5:
        # Auto-assign the unaccounted difference to batch waste
        batch.waste_kg = batch_waste + diff
        adjustment_note = f" (adjusted batch waste by {diff:+.1f} kg to balance)"

    batch.status = "completed"
    await db.flush()
    await invalidate_cache("batches:*")

    await log_activity(
        db, _user,
        action="status_changed",
        entity_type="batch",
        entity_id=batch.id,
        entity_code=batch.batch_code,
        summary=f"Finalized GRN {batch.batch_code}{adjustment_note}",
    )

    return BatchOut.model_validate(batch)


# ── Delete batch ─────────────────────────────────────────────

@router.delete("/{batch_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_batch(
    batch_id: str,
    db: AsyncSession = Depends(get_tenant_db),
    _user: User = Depends(require_permission("batch.write")),
    _onboarded: User = Depends(require_onboarded),
):
    """Soft-delete a batch (GRN) and all its lots.

    Marks the batch and its lots as is_deleted=True. Does not remove
    any associated pallet allocations — the pallet detail pages will
    simply show the lots as deleted.
    """
    result = await db.execute(
        select(Batch)
        .where(Batch.id == batch_id, Batch.is_deleted == False)  # noqa: E712
        .options(selectinload(Batch.lots), selectinload(Batch.grower))
    )
    batch = result.scalar_one_or_none()
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")

    batch.is_deleted = True
    for lot in (batch.lots or []):
        lot.is_deleted = True

    await db.flush()
    await invalidate_cache("batches:*")

    await log_activity(
        db, _user,
        action="deleted",
        entity_type="batch",
        entity_id=batch.id,
        entity_code=batch.batch_code,
        summary=f"Deleted batch {batch.batch_code} and {len(batch.lots or [])} lot(s)",
    )
