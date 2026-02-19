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
from app.models.tenant.packaging_stock import PackagingMovement, PackagingStock
from app.models.tenant.pallet import PalletLot
from app.models.tenant.product_config import BoxSize
from app.schemas.common import PaginatedResponse
from app.schemas.lot import (
    LotFromBatchItem,
    LotOut,
    LotSummary,
    LotUpdate,
    LotsFromBatchRequest,
)
from app.utils.activity import log_activity
from app.utils.numbering import generate_code

router = APIRouter()


async def _adjust_packaging_stock(
    db: AsyncSession,
    box_size_id: str,
    quantity: int,
    movement_type: str,
    user_id: str,
    reference_id: str | None = None,
) -> None:
    """Adjust packaging stock for a box size. Positive = add, negative = deduct."""
    result = await db.execute(
        select(PackagingStock).where(PackagingStock.box_size_id == box_size_id)
    )
    stock = result.scalar_one_or_none()
    if not stock:
        # Auto-create stock record (starts at 0)
        stock = PackagingStock(
            id=str(uuid.uuid4()),
            box_size_id=box_size_id,
            current_quantity=0,
        )
        db.add(stock)
        await db.flush()

    stock.current_quantity += quantity

    movement = PackagingMovement(
        id=str(uuid.uuid4()),
        stock_id=stock.id,
        movement_type=movement_type,
        quantity=quantity,
        reference_type="lot",
        reference_id=reference_id,
        recorded_by=user_id,
    )
    db.add(movement)


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

    # Pre-load box sizes for auto-weight calculation
    box_size_ids = [item.box_size_id for item in body.lots if item.box_size_id]
    box_size_map: dict[str, float] = {}
    if box_size_ids:
        bs_result = await db.execute(
            select(BoxSize).where(BoxSize.id.in_(box_size_ids))
        )
        for bs in bs_result.scalars().all():
            box_size_map[bs.id] = bs.weight_kg

    created_lots = []
    for item in body.lots:
        # Auto-calculate weight: carton_count × box weight (if box_size provided)
        weight_kg = item.weight_kg
        if item.box_size_id and item.box_size_id in box_size_map:
            weight_kg = item.carton_count * box_size_map[item.box_size_id]

        lot = Lot(
            id=str(uuid.uuid4()),
            lot_code=await generate_code(db, "lot", batch_code=batch.batch_code),
            batch_id=batch.id,
            grower_id=batch.grower_id,
            packhouse_id=batch.packhouse_id,
            fruit_type=batch.fruit_type,
            variety=batch.variety,
            grade=item.grade,
            size=item.size,
            box_size_id=item.box_size_id,
            weight_kg=weight_kg,
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

    # Deduct packaging stock for each lot with a box_size_id
    for lot in created_lots:
        if lot.box_size_id and lot.carton_count > 0:
            await _adjust_packaging_stock(
                db, lot.box_size_id, -lot.carton_count,
                "consumption", user.id, lot.id,
            )
    await db.flush()

    # Re-query with relationships for response
    lot_ids = [lot.id for lot in created_lots]
    result = await db.execute(
        select(Lot)
        .where(Lot.id.in_(lot_ids))
        .options(
            selectinload(Lot.batch),
            selectinload(Lot.grower),
            selectinload(Lot.box_size),
        )
    )
    lots = result.scalars().all()

    lot_codes = [lot.lot_code for lot in created_lots]
    await log_activity(
        db, user,
        action="created",
        entity_type="lot",
        entity_id=created_lots[0].id if len(created_lots) == 1 else None,
        entity_code=lot_codes[0] if len(lot_codes) == 1 else f"{lot_codes[0]}…+{len(lot_codes)-1}",
        summary=f"Created {len(created_lots)} lot(s) from batch {batch.batch_code}",
        details={"lot_codes": lot_codes, "batch_code": batch.batch_code},
    )

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

    # Compute palletized box counts per lot
    lot_ids = [lot.id for lot in items]
    palletized_map: dict[str, int] = {}
    if lot_ids:
        pal_result = await db.execute(
            select(PalletLot.lot_id, func.sum(PalletLot.box_count))
            .where(PalletLot.lot_id.in_(lot_ids), PalletLot.is_deleted == False)  # noqa: E712
            .group_by(PalletLot.lot_id)
        )
        palletized_map = {row[0]: int(row[1]) for row in pal_result.all()}

    summaries = [LotSummary.model_validate(lot) for lot in items]
    for s in summaries:
        s.palletized_boxes = palletized_map.get(s.id, 0)

    return PaginatedResponse(
        items=summaries,
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
        .options(
            selectinload(Lot.batch),
            selectinload(Lot.grower),
            selectinload(Lot.box_size),
        )
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
    user: User = Depends(require_permission("batch.write")),
    _onboarded: User = Depends(require_onboarded),
):
    result = await db.execute(
        select(Lot)
        .where(Lot.id == lot_id, Lot.is_deleted == False)  # noqa: E712
        .options(
            selectinload(Lot.batch),
            selectinload(Lot.grower),
            selectinload(Lot.box_size),
        )
    )
    lot = result.scalar_one_or_none()
    if not lot:
        raise HTTPException(status_code=404, detail="Lot not found")

    # Capture old values for packaging stock adjustment
    old_carton_count = lot.carton_count
    old_box_size_id = lot.box_size_id

    updates = body.model_dump(exclude_unset=True)
    for field, value in updates.items():
        setattr(lot, field, value)

    # Auto-recalculate weight if carton_count or box_size_id changed
    recalc = "carton_count" in updates or "box_size_id" in updates
    if recalc:
        # Resolve the box size (may have just been changed)
        effective_box_size_id = lot.box_size_id
        if effective_box_size_id:
            bs_result = await db.execute(
                select(BoxSize).where(BoxSize.id == effective_box_size_id)
            )
            bs = bs_result.scalar_one_or_none()
            if bs:
                lot.weight_kg = lot.carton_count * bs.weight_kg

    # Adjust packaging stock if carton_count or box_size_id changed
    if "carton_count" in updates or "box_size_id" in updates:
        # Reverse old consumption (if there was one)
        if old_box_size_id and old_carton_count > 0:
            await _adjust_packaging_stock(
                db, old_box_size_id, old_carton_count,
                "reversal", user.id, lot.id,
            )
        # Record new consumption
        if lot.box_size_id and lot.carton_count > 0:
            await _adjust_packaging_stock(
                db, lot.box_size_id, -lot.carton_count,
                "consumption", user.id, lot.id,
            )

    await db.flush()
    return LotOut.from_orm_with_names(lot)
