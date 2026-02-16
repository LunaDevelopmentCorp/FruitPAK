"""Pallet management router.

Endpoints:
    POST  /api/pallets/from-lots         Create pallets from lot assignments
    GET   /api/pallets/                   List pallets (with filters)
    GET   /api/pallets/{pallet_id}        Single pallet detail
    GET   /api/pallets/{pallet_id}/qr     QR code SVG for pallet
    GET   /api/pallets/config/box-sizes   Enterprise box sizes
    GET   /api/pallets/config/pallet-types Enterprise pallet types
"""

import io
import json
import uuid
from datetime import date

import segno
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
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
    AllocateBoxesRequest,
    BoxSizeOut,
    DeallocateResult,
    PalletDetail,
    PalletFromLotsRequest,
    PalletLotOut,
    PalletSummary,
    PalletTypeOut,
)

router = APIRouter()


# ── Helpers ──────────────────────────────────────────────────

async def _already_palletized(db: AsyncSession, lot_id: str) -> int:
    """Return total boxes already allocated from a lot across all pallets."""
    result = await db.scalar(
        select(func.coalesce(func.sum(PalletLot.box_count), 0))
        .where(PalletLot.lot_id == lot_id)
    )
    return int(result)

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

    # Validate each lot has enough unallocated boxes
    for assignment in body.lot_assignments:
        lot = lot_map[assignment.lot_id]
        already = await _already_palletized(db, assignment.lot_id)
        available = lot.carton_count - already
        if assignment.box_count > available:
            raise HTTPException(
                status_code=400,
                detail=f"Lot {lot.lot_code} has only {available} unallocated box(es), "
                       f"cannot assign {assignment.box_count}",
            )

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


# ── GET /api/pallets/{pallet_id}/qr ──────────────────────────

@router.get("/{pallet_id}/qr")
async def get_pallet_qr(
    pallet_id: str,
    db: AsyncSession = Depends(get_tenant_db),
    _user: User = Depends(require_permission("batch.read")),
    _onboarded: User = Depends(require_onboarded),
):
    """Return an SVG QR code encoding key pallet information."""
    result = await db.execute(
        select(Pallet)
        .where(Pallet.id == pallet_id, Pallet.is_deleted == False)  # noqa: E712
        .options(selectinload(Pallet.pallet_lots).selectinload(PalletLot.lot))
    )
    pallet = result.scalar_one_or_none()
    if not pallet:
        raise HTTPException(status_code=404, detail="Pallet not found")

    lot_codes = [
        pl.lot.lot_code for pl in pallet.pallet_lots if pl.lot
    ]
    qr_data = json.dumps({
        "type": "pallet",
        "pallet_id": pallet.id,
        "number": pallet.pallet_number,
        "fruit_type": pallet.fruit_type,
        "grade": pallet.grade,
        "boxes": pallet.current_boxes,
        "lots": lot_codes[:10],
    }, separators=(",", ":"))

    qr = segno.make(qr_data)
    buf = io.BytesIO()
    qr.save(buf, kind="svg", scale=4, dark="#15803d")
    return Response(content=buf.getvalue(), media_type="image/svg+xml")


# ── POST /api/pallets/{pallet_id}/allocate ──────────────────

@router.post("/{pallet_id}/allocate", response_model=PalletSummary)
async def allocate_boxes_to_pallet(
    pallet_id: str,
    body: AllocateBoxesRequest,
    db: AsyncSession = Depends(get_tenant_db),
    user: User = Depends(require_permission("batch.write")),
    _onboarded: User = Depends(require_onboarded),
):
    """Add boxes from lots to an existing open pallet."""
    result = await db.execute(
        select(Pallet)
        .where(Pallet.id == pallet_id, Pallet.is_deleted == False)  # noqa: E712
    )
    pallet = result.scalar_one_or_none()
    if not pallet:
        raise HTTPException(status_code=404, detail="Pallet not found")
    if pallet.status not in ("open",):
        raise HTTPException(
            status_code=400,
            detail=f"Pallet is '{pallet.status}', must be 'open' to allocate",
        )

    total_new_boxes = sum(a.box_count for a in body.lot_assignments)
    remaining = pallet.capacity_boxes - pallet.current_boxes
    if total_new_boxes > remaining:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot fit {total_new_boxes} boxes, only {remaining} capacity remaining",
        )

    for assignment in body.lot_assignments:
        lot_result = await db.execute(
            select(Lot).where(
                Lot.id == assignment.lot_id,
                Lot.is_deleted == False,  # noqa: E712
            )
        )
        lot = lot_result.scalar_one_or_none()
        if not lot:
            raise HTTPException(
                status_code=404,
                detail=f"Lot {assignment.lot_id} not found",
            )

        # Check lot has enough unallocated boxes
        already = await _already_palletized(db, assignment.lot_id)
        available = lot.carton_count - already
        if assignment.box_count > available:
            raise HTTPException(
                status_code=400,
                detail=f"Lot {lot.lot_code} has only {available} unallocated box(es), "
                       f"cannot assign {assignment.box_count}",
            )

        pallet_lot = PalletLot(
            id=str(uuid.uuid4()),
            pallet_id=pallet.id,
            lot_id=assignment.lot_id,
            box_count=assignment.box_count,
            size=assignment.size or lot.size,
        )
        db.add(pallet_lot)
        pallet.current_boxes += assignment.box_count

        if lot.status == "created":
            lot.status = "palletizing"

    if pallet.current_boxes >= pallet.capacity_boxes:
        pallet.status = "closed"

    await db.flush()
    return PalletSummary.model_validate(pallet)


# ── DELETE /api/pallets/{pallet_id}/lots/{pallet_lot_id} ─────

@router.delete("/{pallet_id}/lots/{pallet_lot_id}", response_model=DeallocateResult)
async def deallocate_from_pallet(
    pallet_id: str,
    pallet_lot_id: str,
    db: AsyncSession = Depends(get_tenant_db),
    user: User = Depends(require_permission("batch.write")),
    _onboarded: User = Depends(require_onboarded),
):
    """Remove a lot allocation from a pallet, returning boxes to lot stock."""
    # Load pallet
    result = await db.execute(
        select(Pallet).where(
            Pallet.id == pallet_id,
            Pallet.is_deleted == False,  # noqa: E712
        )
    )
    pallet = result.scalar_one_or_none()
    if not pallet:
        raise HTTPException(status_code=404, detail="Pallet not found")
    if pallet.status in ("loaded", "exported"):
        raise HTTPException(
            status_code=400,
            detail=f"Cannot deallocate from a '{pallet.status}' pallet",
        )

    # Load the pallet-lot link
    pl_result = await db.execute(
        select(PalletLot).where(
            PalletLot.id == pallet_lot_id,
            PalletLot.pallet_id == pallet_id,
        )
    )
    pallet_lot = pl_result.scalar_one_or_none()
    if not pallet_lot:
        raise HTTPException(status_code=404, detail="Pallet-lot allocation not found")

    boxes_returned = pallet_lot.box_count
    lot_id = pallet_lot.lot_id

    # Remove the allocation
    await db.delete(pallet_lot)

    # Update pallet box count
    pallet.current_boxes = max(0, pallet.current_boxes - boxes_returned)

    # Reopen pallet if it was closed and now has capacity
    if pallet.status == "closed" and pallet.current_boxes < pallet.capacity_boxes:
        pallet.status = "open"

    # Check if the lot still has any allocations left
    lot_result = await db.execute(
        select(Lot).where(Lot.id == lot_id, Lot.is_deleted == False)  # noqa: E712
    )
    lot = lot_result.scalar_one_or_none()
    if lot and lot.status == "palletizing":
        remaining = await _already_palletized(db, lot_id)
        # remaining still includes the deleted record until flush, so flush first
        await db.flush()
        remaining_after = await _already_palletized(db, lot_id)
        if remaining_after == 0:
            lot.status = "created"

    await db.flush()
    return DeallocateResult(
        pallet_id=pallet_id,
        pallet_lot_id=pallet_lot_id,
        boxes_returned=boxes_returned,
        pallet_status=pallet.status,
        pallet_current_boxes=pallet.current_boxes,
    )
