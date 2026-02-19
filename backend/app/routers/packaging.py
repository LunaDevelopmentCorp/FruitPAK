"""Packaging stock management router.

Endpoints:
    GET   /api/packaging/stock           Current stock levels
    POST  /api/packaging/receipt         Import / receive packaging stock
    PATCH /api/packaging/stock/{id}/min  Update min stock level
    POST  /api/packaging/adjustment      Manual stock correction
    GET   /api/packaging/movements       Movement history
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import require_onboarded, require_permission
from app.database import get_tenant_db
from app.models.public.user import User
from app.models.tenant.packaging_stock import PackagingMovement, PackagingStock
from app.models.tenant.product_config import BoxSize, PalletType
from app.schemas.common import PaginatedResponse
from app.schemas.packaging import (
    PackagingAdjustmentRequest,
    PackagingMovementOut,
    PackagingReceiptRequest,
    PackagingStockOut,
    PackagingWriteOffRequest,
    UpdateMinStockRequest,
)

router = APIRouter()


# ── Helpers ──────────────────────────────────────────────────

def _enrich_stock(stock: PackagingStock) -> PackagingStockOut:
    """Build a PackagingStockOut with resolved name/type from relationships."""
    out = PackagingStockOut.model_validate(stock)
    if stock.box_size:
        out.name = stock.box_size.name
        out.weight_kg = stock.box_size.weight_kg
        out.cost_per_unit = stock.box_size.cost_per_unit
        out.packaging_type = "box"
    elif stock.pallet_type:
        out.name = stock.pallet_type.name
        out.packaging_type = "pallet"
    return out


async def _get_or_create_stock(
    db: AsyncSession,
    box_size_id: str | None,
    pallet_type_id: str | None,
) -> PackagingStock:
    """Find existing stock record or create one."""
    if box_size_id:
        result = await db.execute(
            select(PackagingStock).where(PackagingStock.box_size_id == box_size_id)
        )
    elif pallet_type_id:
        result = await db.execute(
            select(PackagingStock).where(PackagingStock.pallet_type_id == pallet_type_id)
        )
    else:
        raise HTTPException(status_code=400, detail="Provide box_size_id or pallet_type_id")

    stock = result.scalar_one_or_none()
    if not stock:
        stock = PackagingStock(
            id=str(uuid.uuid4()),
            box_size_id=box_size_id,
            pallet_type_id=pallet_type_id,
            current_quantity=0,
        )
        db.add(stock)
        await db.flush()
        # Reload with relationships
        result = await db.execute(
            select(PackagingStock).where(PackagingStock.id == stock.id)
        )
        stock = result.scalar_one()
    return stock


# ── GET /api/packaging/stock ────────────────────────────────

@router.get("/stock", response_model=list[PackagingStockOut])
async def get_stock_levels(
    db: AsyncSession = Depends(get_tenant_db),
    _user: User = Depends(require_onboarded),
):
    """Return current stock levels for all packaging types.

    Automatically creates stock records for any box sizes or pallet types
    that don't have one yet.
    """
    # Ensure every box size and pallet type has a stock record
    box_sizes = (await db.execute(select(BoxSize))).scalars().all()
    pallet_types = (await db.execute(select(PalletType))).scalars().all()

    existing = (await db.execute(select(PackagingStock))).scalars().all()
    existing_box_ids = {s.box_size_id for s in existing if s.box_size_id}
    existing_pallet_ids = {s.pallet_type_id for s in existing if s.pallet_type_id}

    for bs in box_sizes:
        if bs.id not in existing_box_ids:
            db.add(PackagingStock(
                id=str(uuid.uuid4()),
                box_size_id=bs.id,
                current_quantity=0,
            ))
    for pt in pallet_types:
        if pt.id not in existing_pallet_ids:
            db.add(PackagingStock(
                id=str(uuid.uuid4()),
                pallet_type_id=pt.id,
                current_quantity=0,
            ))
    await db.flush()

    # Re-query with relationships
    result = await db.execute(select(PackagingStock))
    all_stock = result.scalars().all()

    return [_enrich_stock(s) for s in all_stock]


# ── POST /api/packaging/receipt ─────────────────────────────

@router.post("/receipt", response_model=PackagingStockOut, status_code=201)
async def receive_packaging(
    body: PackagingReceiptRequest,
    db: AsyncSession = Depends(get_tenant_db),
    user: User = Depends(require_permission("batch.write")),
    _onboarded: User = Depends(require_onboarded),
):
    """Import / receive packaging stock (opening balance or new delivery)."""
    # Validate that the referenced box_size or pallet_type exists
    if body.box_size_id:
        bs = await db.execute(select(BoxSize).where(BoxSize.id == body.box_size_id))
        if not bs.scalar_one_or_none():
            raise HTTPException(status_code=404, detail="Box size not found")
    elif body.pallet_type_id:
        pt = await db.execute(select(PalletType).where(PalletType.id == body.pallet_type_id))
        if not pt.scalar_one_or_none():
            raise HTTPException(status_code=404, detail="Pallet type not found")
    else:
        raise HTTPException(status_code=400, detail="Provide box_size_id or pallet_type_id")

    stock = await _get_or_create_stock(db, body.box_size_id, body.pallet_type_id)
    stock.current_quantity += body.quantity

    # Record movement
    movement = PackagingMovement(
        id=str(uuid.uuid4()),
        stock_id=stock.id,
        movement_type="receipt",
        quantity=body.quantity,
        cost_per_unit=body.cost_per_unit,
        notes=body.notes,
        recorded_by=user.id,
    )
    db.add(movement)
    await db.flush()

    # Reload with relationships
    result = await db.execute(
        select(PackagingStock).where(PackagingStock.id == stock.id)
    )
    stock = result.scalar_one()
    return _enrich_stock(stock)


# ── PATCH /api/packaging/stock/{stock_id}/min ───────────────

@router.patch("/stock/{stock_id}/min", response_model=PackagingStockOut)
async def update_min_stock(
    stock_id: str,
    body: UpdateMinStockRequest,
    db: AsyncSession = Depends(get_tenant_db),
    _user: User = Depends(require_permission("batch.write")),
    _onboarded: User = Depends(require_onboarded),
):
    """Update the minimum stock level (low-stock alert threshold)."""
    result = await db.execute(
        select(PackagingStock).where(PackagingStock.id == stock_id)
    )
    stock = result.scalar_one_or_none()
    if not stock:
        raise HTTPException(status_code=404, detail="Stock record not found")

    stock.min_stock_level = body.min_stock_level
    await db.flush()
    return _enrich_stock(stock)


# ── POST /api/packaging/adjustment ──────────────────────────

@router.post("/adjustment", response_model=PackagingStockOut)
async def adjust_stock(
    body: PackagingAdjustmentRequest,
    db: AsyncSession = Depends(get_tenant_db),
    user: User = Depends(require_permission("batch.write")),
    _onboarded: User = Depends(require_onboarded),
):
    """Manual stock correction (positive to add, negative to subtract)."""
    result = await db.execute(
        select(PackagingStock).where(PackagingStock.id == body.stock_id)
    )
    stock = result.scalar_one_or_none()
    if not stock:
        raise HTTPException(status_code=404, detail="Stock record not found")

    new_qty = stock.current_quantity + body.quantity
    if new_qty < 0:
        raise HTTPException(
            status_code=400,
            detail=f"Adjustment would result in negative stock ({new_qty})",
        )

    stock.current_quantity = new_qty

    movement = PackagingMovement(
        id=str(uuid.uuid4()),
        stock_id=stock.id,
        movement_type="adjustment",
        quantity=body.quantity,
        notes=body.notes,
        recorded_by=user.id,
    )
    db.add(movement)
    await db.flush()

    # Reload with relationships
    result = await db.execute(
        select(PackagingStock).where(PackagingStock.id == stock.id)
    )
    stock = result.scalar_one()
    return _enrich_stock(stock)


# ── POST /api/packaging/write-off ─────────────────────────

@router.post("/write-off", response_model=PackagingStockOut)
async def write_off_stock(
    body: PackagingWriteOffRequest,
    db: AsyncSession = Depends(get_tenant_db),
    user: User = Depends(require_permission("batch.write")),
    _onboarded: User = Depends(require_onboarded),
):
    """Write off stock as lost, damaged, expired, etc."""
    result = await db.execute(
        select(PackagingStock).where(PackagingStock.id == body.stock_id)
    )
    stock = result.scalar_one_or_none()
    if not stock:
        raise HTTPException(status_code=404, detail="Stock record not found")

    new_qty = stock.current_quantity - body.quantity
    if new_qty < 0:
        raise HTTPException(
            status_code=400,
            detail=f"Write-off would result in negative stock ({new_qty})",
        )

    stock.current_quantity = new_qty

    # Build notes: "damaged: water damage on delivery" or just "damaged"
    note_text = body.reason
    if body.notes:
        note_text = f"{body.reason}: {body.notes}"

    movement = PackagingMovement(
        id=str(uuid.uuid4()),
        stock_id=stock.id,
        movement_type="write_off",
        quantity=-body.quantity,
        notes=note_text,
        recorded_by=user.id,
    )
    db.add(movement)
    await db.flush()

    # Reload with relationships
    result = await db.execute(
        select(PackagingStock).where(PackagingStock.id == stock.id)
    )
    stock = result.scalar_one()
    return _enrich_stock(stock)


# ── GET /api/packaging/movements ────────────────────────────

@router.get("/movements", response_model=PaginatedResponse[PackagingMovementOut])
async def list_movements(
    stock_id: str | None = Query(None),
    movement_type: str | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_tenant_db),
    _user: User = Depends(require_onboarded),
):
    """List packaging movement history with optional filters."""
    from sqlalchemy import func

    base = select(PackagingMovement)
    if stock_id:
        base = base.where(PackagingMovement.stock_id == stock_id)
    if movement_type:
        base = base.where(PackagingMovement.movement_type == movement_type)

    count_result = await db.execute(
        select(func.count()).select_from(base.subquery())
    )
    total = count_result.scalar() or 0

    items_result = await db.execute(
        base.order_by(PackagingMovement.recorded_at.desc())
        .limit(limit)
        .offset(offset)
    )
    items = items_result.scalars().all()

    return PaginatedResponse(
        items=[PackagingMovementOut.model_validate(m) for m in items],
        total=total,
        limit=limit,
        offset=offset,
    )
