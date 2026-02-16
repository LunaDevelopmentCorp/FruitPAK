"""Batch router — GRN intake and batch management.

Endpoints:
    POST /api/batches/grn           Create batch via GRN intake
    GET  /api/batches/              List batches (with filters)
    GET  /api/batches/{batch_id}    Single batch detail
    GET  /api/batches/{batch_id}/qr QR code SVG for batch
    PATCH /api/batches/{batch_id}   Update batch fields
"""

import io
import json
from datetime import date

import segno
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import Response
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth.deps import require_onboarded, require_permission
from app.database import get_tenant_db
from app.models.public.user import User
from app.models.tenant.batch import Batch
from app.models.tenant.lot import Lot
from app.models.tenant.pallet import PalletLot
from app.schemas.batch import (
    BatchDetailOut,
    BatchOut,
    BatchSummary,
    BatchUpdate,
    GRNRequest,
    GRNResponse,
    LotSummaryWithAllocation,
)
from app.schemas.common import PaginatedResponse
from app.services.grn import create_grn
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

    return GRNResponse(
        batch=BatchOut.model_validate(batch),
        qr_code_url=qr_url,
        advance_payment_linked=result["advance_payment_linked"],
        advance_payment_ref=result["advance_payment_ref"],
    )


# ── List batches ─────────────────────────────────────────────

@router.get("/", response_model=PaginatedResponse[BatchSummary])
@cached(ttl=60, prefix="batches")  # Cache for 1 minute (batches change frequently)
async def list_batches(
    grower_id: str | None = Query(None),
    batch_status: str | None = Query(None, alias="status"),
    fruit_type: str | None = Query(None),
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_tenant_db),
    _user: User = Depends(require_permission("batch.read")),
    _onboarded: User = Depends(require_onboarded),
):
    # Build base query with filters
    base_stmt = select(Batch).where(Batch.is_deleted == False)  # noqa: E712

    if grower_id:
        base_stmt = base_stmt.where(Batch.grower_id == grower_id)
    if batch_status:
        base_stmt = base_stmt.where(Batch.status == batch_status)
    if fruit_type:
        base_stmt = base_stmt.where(Batch.fruit_type == fruit_type)
    if date_from:
        base_stmt = base_stmt.where(Batch.intake_date >= date_from)
    if date_to:
        base_stmt = base_stmt.where(Batch.intake_date <= date_to)

    # Count total matching records
    count_stmt = select(func.count()).select_from(base_stmt.subquery())
    total = await db.scalar(count_stmt) or 0

    # Get paginated items with eager loading for grower relationship
    # This prevents N+1 query problem when accessing batch.grower
    items_stmt = (
        base_stmt
        .options(selectinload(Batch.grower))  # Eager load grower relationship
        .order_by(Batch.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    result = await db.execute(items_stmt)
    items = result.scalars().all()

    return PaginatedResponse(
        items=[BatchSummary.model_validate(b) for b in items],
        total=total,
        limit=limit,
        offset=offset,
    )


# ── Single batch detail ──────────────────────────────────────

@router.get("/{batch_id}", response_model=BatchDetailOut)
async def get_batch(
    batch_id: str,
    db: AsyncSession = Depends(get_tenant_db),
    _user: User = Depends(require_permission("batch.read")),
    _onboarded: User = Depends(require_onboarded),
):
    result = await db.execute(
        select(Batch)
        .where(Batch.id == batch_id, Batch.is_deleted == False)  # noqa: E712
        .options(
            selectinload(Batch.grower),
            selectinload(Batch.packhouse),
            selectinload(Batch.history),
            selectinload(Batch.lots),
        )
    )
    batch = result.scalar_one_or_none()
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")

    detail = BatchDetailOut.model_validate(batch)

    # Resolve received_by UUID → user full_name
    # Tenant session search_path includes public, so User table is accessible
    if batch.received_by:
        user_result = await db.execute(
            select(User.full_name).where(User.id == batch.received_by)
        )
        name = user_result.scalar_one_or_none()
        if name:
            detail.received_by_name = name

    # Compute palletized box counts per lot
    if batch.lots:
        lot_ids = [lot.id for lot in batch.lots]
        pal_result = await db.execute(
            select(PalletLot.lot_id, func.sum(PalletLot.box_count))
            .where(PalletLot.lot_id.in_(lot_ids))
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
    result = await db.execute(
        select(Batch).where(Batch.id == batch_id, Batch.is_deleted == False)  # noqa: E712
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
        .options(selectinload(Batch.lots))
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
            .where(PalletLot.lot_id.in_(lot_ids))
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
        .options(selectinload(Batch.lots))
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

    # Mass balance check
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
    diff = abs(incoming_net - accounted)

    if diff > 0.5:
        raise HTTPException(
            status_code=400,
            detail=f"Mass balance not zero: incoming {incoming_net:.1f} kg vs accounted {accounted:.1f} kg (diff {diff:.1f} kg)",
        )

    batch.status = "completed"
    await db.flush()
    await invalidate_cache("batches:*")
    return BatchOut.model_validate(batch)
