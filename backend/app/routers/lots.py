"""Lot router — packing lot management.

Endpoints:
    POST  /api/lots/from-batch/{batch_id}  Create lots from a batch
    GET   /api/lots/                        List lots (with filters)
    GET   /api/lots/{lot_id}                Single lot detail
    PATCH /api/lots/{lot_id}                Update lot fields
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth.deps import require_onboarded, require_permission
from app.database import get_tenant_db
from app.models.public.user import User
from app.models.tenant.batch import Batch
from app.models.tenant.lot import Lot
from app.schemas.common import PaginatedResponse
from app.schemas.lot import (
    LotFromBatchItem,
    LotOut,
    LotSummary,
    LotUpdate,
    LotsFromBatchRequest,
)

router = APIRouter()


def _generate_lot_code(batch_code: str, index: int) -> str:
    """Generate lot code like GRN-20260213-001-L01."""
    return f"{batch_code}-L{index:02d}"


# ── Create lots from batch ───────────────────────────────────

@router.post(
    "/from-batch/{batch_id}",
    response_model=list[LotOut],
    status_code=status.HTTP_201_CREATED,
)
async def create_lots_from_batch(
    batch_id: str,
    body: LotsFromBatchRequest,
    db: AsyncSession = Depends(get_tenant_db),
    user: User = Depends(require_permission("batch.write")),
    _onboarded: User = Depends(require_onboarded),
):
    """Split a batch into packing lots by grade/size.

    Each lot inherits the batch's grower, packhouse, fruit type, and variety.
    The batch status is updated to 'packing'.
    """
    # Load batch with relationships
    result = await db.execute(
        select(Batch)
        .where(Batch.id == batch_id, Batch.is_deleted == False)  # noqa: E712
        .options(selectinload(Batch.lots))
    )
    batch = result.scalar_one_or_none()
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")

    # Determine starting lot index (continue numbering if lots already exist)
    existing_count = len(batch.lots) if batch.lots else 0

    created_lots = []
    for i, item in enumerate(body.lots):
        lot_index = existing_count + i + 1
        lot = Lot(
            id=str(uuid.uuid4()),
            lot_code=_generate_lot_code(batch.batch_code, lot_index),
            batch_id=batch.id,
            grower_id=batch.grower_id,
            packhouse_id=batch.packhouse_id,
            fruit_type=batch.fruit_type,
            variety=batch.variety,
            grade=item.grade,
            size=item.size,
            weight_kg=item.weight_kg,
            carton_count=item.carton_count,
            pack_date=item.pack_date,
            waste_kg=item.waste_kg or 0.0,
            waste_reason=item.waste_reason,
            notes=item.notes,
            packed_by=user.id,
            status="created",
        )
        db.add(lot)
        created_lots.append(lot)

    # Update batch status to packing
    if batch.status == "received":
        batch.status = "packing"

    await db.flush()

    # Re-query with relationships for response
    lot_ids = [lot.id for lot in created_lots]
    result = await db.execute(
        select(Lot)
        .where(Lot.id.in_(lot_ids))
        .options(selectinload(Lot.batch), selectinload(Lot.grower))
    )
    lots = result.scalars().all()

    return [LotOut.from_orm_with_names(lot) for lot in lots]


# ── List lots ────────────────────────────────────────────────

@router.get("/", response_model=PaginatedResponse[LotSummary])
async def list_lots(
    batch_id: str | None = Query(None),
    lot_status: str | None = Query(None, alias="status"),
    grade: str | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_tenant_db),
    _user: User = Depends(require_permission("batch.read")),
    _onboarded: User = Depends(require_onboarded),
):
    base_stmt = select(Lot).where(Lot.is_deleted == False)  # noqa: E712

    if batch_id:
        base_stmt = base_stmt.where(Lot.batch_id == batch_id)
    if lot_status:
        base_stmt = base_stmt.where(Lot.status == lot_status)
    if grade:
        base_stmt = base_stmt.where(Lot.grade == grade)

    count_stmt = select(func.count()).select_from(base_stmt.subquery())
    total = await db.scalar(count_stmt) or 0

    items_stmt = (
        base_stmt
        .order_by(Lot.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    result = await db.execute(items_stmt)
    items = result.scalars().all()

    return PaginatedResponse(
        items=[LotSummary.model_validate(lot) for lot in items],
        total=total,
        limit=limit,
        offset=offset,
    )


# ── Single lot detail ────────────────────────────────────────

@router.get("/{lot_id}", response_model=LotOut)
async def get_lot(
    lot_id: str,
    db: AsyncSession = Depends(get_tenant_db),
    _user: User = Depends(require_permission("batch.read")),
    _onboarded: User = Depends(require_onboarded),
):
    result = await db.execute(
        select(Lot)
        .where(Lot.id == lot_id, Lot.is_deleted == False)  # noqa: E712
        .options(selectinload(Lot.batch), selectinload(Lot.grower))
    )
    lot = result.scalar_one_or_none()
    if not lot:
        raise HTTPException(status_code=404, detail="Lot not found")
    return LotOut.from_orm_with_names(lot)


# ── Update lot ───────────────────────────────────────────────

@router.patch("/{lot_id}", response_model=LotOut)
async def update_lot(
    lot_id: str,
    body: LotUpdate,
    db: AsyncSession = Depends(get_tenant_db),
    _user: User = Depends(require_permission("batch.write")),
    _onboarded: User = Depends(require_onboarded),
):
    result = await db.execute(
        select(Lot)
        .where(Lot.id == lot_id, Lot.is_deleted == False)  # noqa: E712
        .options(selectinload(Lot.batch), selectinload(Lot.grower))
    )
    lot = result.scalar_one_or_none()
    if not lot:
        raise HTTPException(status_code=404, detail="Lot not found")

    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(lot, field, value)

    await db.flush()
    return LotOut.from_orm_with_names(lot)
