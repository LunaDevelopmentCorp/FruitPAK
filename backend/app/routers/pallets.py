"""Pallet management router.

Endpoints:
    POST  /api/pallets/from-lots         Create pallets from lot assignments
    GET   /api/pallets/                   List pallets (with filters)
    GET   /api/pallets/{pallet_id}        Single pallet detail
    GET   /api/pallets/config/box-sizes   Enterprise box sizes
    GET   /api/pallets/config/pallet-types Enterprise pallet types
"""

import uuid
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth.deps import require_onboarded, require_permission
from app.database import get_tenant_db
from app.models.public.user import User
from app.models.tenant.lot import Lot
from app.models.tenant.pallet import Pallet, PalletLot
from app.models.tenant.product_config import BoxSize, PalletType
from app.schemas.common import PaginatedResponse
from app.schemas.pallet import (
    BoxSizeOut,
    PalletDetail,
    PalletFromLotsRequest,
    PalletLotOut,
    PalletSummary,
    PalletTypeOut,
)

router = APIRouter()


# ── Helpers ──────────────────────────────────────────────────

def _generate_pallet_number(index: int) -> str:
    today = date.today().strftime("%Y%m%d")
    return f"PAL-{today}-{index:03d}"


async def _next_pallet_index(db: AsyncSession) -> int:
    today_prefix = f"PAL-{date.today().strftime('%Y%m%d')}-"
    result = await db.execute(
        select(func.count()).where(
            Pallet.pallet_number.like(f"{today_prefix}%"),
            Pallet.is_deleted == False,  # noqa: E712
        )
    )
    return (result.scalar() or 0) + 1


# ── Config endpoints (enterprise box sizes & pallet types) ───

@router.get("/config/box-sizes", response_model=list[BoxSizeOut])
async def get_box_sizes(
    db: AsyncSession = Depends(get_tenant_db),
    _user: User = Depends(require_onboarded),
):
    result = await db.execute(select(BoxSize))
    return [BoxSizeOut.model_validate(bs) for bs in result.scalars().all()]


@router.get("/config/pallet-types", response_model=list[PalletTypeOut])
async def get_pallet_types(
    db: AsyncSession = Depends(get_tenant_db),
    _user: User = Depends(require_onboarded),
):
    result = await db.execute(select(PalletType))
    return [PalletTypeOut.model_validate(pt) for pt in result.scalars().all()]


# ── POST /api/pallets/from-lots ──────────────────────────────

@router.post("/from-lots", response_model=list[PalletSummary], status_code=201)
async def create_pallets_from_lots(
    body: PalletFromLotsRequest,
    db: AsyncSession = Depends(get_tenant_db),
    user: User = Depends(require_permission("batch.write")),
):
    """Create one or more pallets from lot assignments.

    If total boxes exceed pallet capacity, overflow creates additional pallets.
    """
    # Validate all lots exist and collect info
    lot_map: dict[str, Lot] = {}
    for assignment in body.lot_assignments:
        if assignment.lot_id not in lot_map:
            result = await db.execute(
                select(Lot).where(
                    Lot.id == assignment.lot_id,
                    Lot.is_deleted == False,  # noqa: E712
                )
            )
            lot = result.scalar_one_or_none()
            if not lot:
                raise HTTPException(
                    status_code=404,
                    detail=f"Lot {assignment.lot_id} not found",
                )
            lot_map[assignment.lot_id] = lot

    # Build a flat list of box assignments to fill pallets
    box_queue: list[dict] = []
    for assignment in body.lot_assignments:
        lot = lot_map[assignment.lot_id]
        box_queue.append({
            "lot_id": assignment.lot_id,
            "lot": lot,
            "box_count": assignment.box_count,
            "size": assignment.size or lot.size,
        })

    # Detect size from first lot for denormalization
    first_lot = lot_map[body.lot_assignments[0].lot_id]

    # Fill pallets (auto-overflow)
    created_pallets: list[Pallet] = []
    pallet_idx = await _next_pallet_index(db)
    remaining_capacity = body.capacity_boxes
    current_pallet: Pallet | None = None

    for item in box_queue:
        boxes_left = item["box_count"]
        while boxes_left > 0:
            if current_pallet is None or remaining_capacity <= 0:
                # Create new pallet
                current_pallet = Pallet(
                    id=str(uuid.uuid4()),
                    pallet_number=_generate_pallet_number(pallet_idx),
                    pallet_type_name=body.pallet_type_name,
                    capacity_boxes=body.capacity_boxes,
                    current_boxes=0,
                    packhouse_id=body.packhouse_id,
                    fruit_type=first_lot.fruit_type,
                    variety=first_lot.variety,
                    grade=first_lot.grade,
                    size=item["size"],
                    palletized_by=user.id,
                    status="open",
                    notes=body.notes,
                )
                db.add(current_pallet)
                created_pallets.append(current_pallet)
                remaining_capacity = body.capacity_boxes
                pallet_idx += 1

            fill = min(boxes_left, remaining_capacity)
            pallet_lot = PalletLot(
                id=str(uuid.uuid4()),
                pallet_id=current_pallet.id,
                lot_id=item["lot_id"],
                box_count=fill,
                size=item["size"],
            )
            db.add(pallet_lot)

            current_pallet.current_boxes += fill
            remaining_capacity -= fill
            boxes_left -= fill

        # Update lot status
        lot = item["lot"]
        if lot.status == "created":
            lot.status = "palletizing"

    # Close pallets that are full
    for p in created_pallets:
        if p.current_boxes >= p.capacity_boxes:
            p.status = "closed"

    await db.flush()
    return [PalletSummary.model_validate(p) for p in created_pallets]


# ── GET /api/pallets/ ────────────────────────────────────────

@router.get("/", response_model=PaginatedResponse[PalletSummary])
async def list_pallets(
    status: str | None = None,
    pallet_type: str | None = None,
    limit: int = Query(50, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_tenant_db),
    _user: User = Depends(require_permission("batch.read")),
    _onboarded: User = Depends(require_onboarded),
):
    base = select(Pallet).where(Pallet.is_deleted == False)  # noqa: E712
    if status:
        base = base.where(Pallet.status == status)
    if pallet_type:
        base = base.where(Pallet.pallet_type_name == pallet_type)

    count_result = await db.execute(
        select(func.count()).select_from(base.subquery())
    )
    total = count_result.scalar() or 0

    items_result = await db.execute(
        base.order_by(Pallet.created_at.desc()).limit(limit).offset(offset)
    )
    items = items_result.scalars().all()

    return PaginatedResponse(
        items=[PalletSummary.model_validate(p) for p in items],
        total=total,
        limit=limit,
        offset=offset,
    )


# ── GET /api/pallets/{pallet_id} ─────────────────────────────

@router.get("/{pallet_id}", response_model=PalletDetail)
async def get_pallet(
    pallet_id: str,
    db: AsyncSession = Depends(get_tenant_db),
    _user: User = Depends(require_permission("batch.read")),
    _onboarded: User = Depends(require_onboarded),
):
    result = await db.execute(
        select(Pallet)
        .where(Pallet.id == pallet_id, Pallet.is_deleted == False)  # noqa: E712
        .options(selectinload(Pallet.pallet_lots).selectinload(PalletLot.lot))
    )
    pallet = result.scalar_one_or_none()
    if not pallet:
        raise HTTPException(status_code=404, detail="Pallet not found")

    # Enrich pallet_lots with lot_code and grade
    detail = PalletDetail.model_validate(pallet)
    for pl_out, pl_orm in zip(detail.pallet_lots, pallet.pallet_lots):
        if pl_orm.lot:
            pl_out.lot_code = pl_orm.lot.lot_code
            pl_out.grade = pl_orm.lot.grade
    return detail
