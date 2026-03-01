"""Pallet management router.

Endpoints:
    POST  /api/pallets/from-lots         Create pallets from lot assignments
    POST  /api/pallets/                  Create an empty pallet
    GET   /api/pallets/                   List pallets (with filters)
    GET   /api/pallets/{pallet_id}        Single pallet detail
    PATCH /api/pallets/{pallet_id}        Update pallet properties
    DELETE /api/pallets/{pallet_id}       Soft-delete a pallet (empty only)
    GET   /api/pallets/{pallet_id}/qr     QR code SVG for pallet
    GET   /api/pallets/config/box-sizes   Enterprise box sizes
    GET   /api/pallets/config/pallet-types Enterprise pallet types
"""

import io
import json
import math
import uuid
from datetime import datetime

import segno
from fastapi import APIRouter, Depends, HTTPException, Query, status as http_status
from fastapi.responses import Response
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth.deps import require_onboarded, require_permission
from app.database import get_tenant_db
from app.models.public.user import User
from app.models.tenant.batch import Batch
from app.models.tenant.lot import Lot
from app.models.tenant.pallet import Pallet, PalletLot
from app.models.tenant.product_config import BoxSize, PalletType
from app.models.tenant.tenant_config import TenantConfig
from app.schemas.common import PaginatedResponse
from app.schemas.pallet import (
    AllocateBoxesRequest,
    BoxSizeOut,
    CreateEmptyPalletRequest,
    DeallocateResult,
    PalletDetail,
    PalletFromLotsRequest,
    PalletLotOut,
    PalletSummary,
    PalletTypeOut,
    PalletUpdate,
)
from app.utils.activity import log_activity
from app.utils.cache import cached
from app.utils.locks import get_pallet_locks
from app.utils.numbering import generate_code, generate_codes

router = APIRouter()


# ── Helpers ──────────────────────────────────────────────────

async def _already_palletized(db: AsyncSession, lot_id: str) -> int:
    """Return total boxes already allocated from a lot across all pallets."""
    result = await db.scalar(
        select(func.coalesce(func.sum(PalletLot.box_count), 0))
        .where(PalletLot.lot_id == lot_id, PalletLot.is_deleted == False)  # noqa: E712
    )
    return int(result)


async def _already_palletized_batch(db: AsyncSession, lot_ids: list[str]) -> dict[str, int]:
    """Return {lot_id: total_boxes_palletized} for multiple lots in a single query."""
    if not lot_ids:
        return {}
    result = await db.execute(
        select(PalletLot.lot_id, func.coalesce(func.sum(PalletLot.box_count), 0))
        .where(PalletLot.lot_id.in_(lot_ids), PalletLot.is_deleted == False)  # noqa: E712
        .group_by(PalletLot.lot_id)
    )
    palletized = {row[0]: int(row[1]) for row in result.all()}
    # Ensure all requested lot_ids have an entry (0 if not palletized)
    return {lid: palletized.get(lid, 0) for lid in lot_ids}


async def _get_mixed_pallet_rules(db: AsyncSession) -> dict:
    """Load mixed pallet rules from tenant_config."""
    result = await db.execute(
        select(TenantConfig).where(TenantConfig.key == "mixed_pallet_rules")
    )
    config = result.scalar_one_or_none()
    return config.value if config else {}


def _resolve_mixed_flag(request_value: bool | None, tenant_value: bool) -> bool:
    """Resolve a mixed pallet flag: explicit request overrides tenant default."""
    if request_value is not None:
        return request_value
    return tenant_value


# ── Config endpoints (enterprise box sizes & pallet types) ───

@router.get("/config/box-sizes", response_model=list[BoxSizeOut])
@cached(ttl=600, prefix="config")
async def get_box_sizes(
    db: AsyncSession = Depends(get_tenant_db),
    _user: User = Depends(require_onboarded),
):
    result = await db.execute(select(BoxSize))
    return [BoxSizeOut.model_validate(bs) for bs in result.scalars().all()]


@router.get("/config/pallet-types", response_model=list[PalletTypeOut])
@cached(ttl=600, prefix="config")
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
    # Load all referenced lots with row-level lock to prevent concurrent over-allocation
    lot_ids = list({a.lot_id for a in body.lot_assignments})
    lot_result = await db.execute(
        select(Lot).where(
            Lot.id.in_(lot_ids),
            Lot.is_deleted == False,  # noqa: E712
        ).options(selectinload(Lot.box_size))
        .with_for_update()
    )
    lot_map: dict[str, Lot] = {lot.id: lot for lot in lot_result.scalars().all()}

    # Check all lots were found
    for assignment in body.lot_assignments:
        if assignment.lot_id not in lot_map:
            raise HTTPException(
                status_code=404,
                detail=f"Lot {assignment.lot_id} not found",
            )

    # Validate each lot has enough unallocated boxes (single batched query)
    palletized_map = await _already_palletized_batch(db, lot_ids)
    for assignment in body.lot_assignments:
        lot = lot_map[assignment.lot_id]
        already = palletized_map.get(assignment.lot_id, 0)
        available = lot.carton_count - already
        if assignment.box_count > available:
            raise HTTPException(
                status_code=400,
                detail=f"Lot {lot.lot_code} has only {available} unallocated box(es), "
                       f"cannot assign {assignment.box_count}",
            )

    # Load tenant mixed pallet rules and resolve flags
    tenant_rules = await _get_mixed_pallet_rules(db)
    allow_mixed_sizes = _resolve_mixed_flag(
        body.allow_mixed_sizes, tenant_rules.get("allow_mixed_sizes", False)
    )
    allow_mixed_box_types = _resolve_mixed_flag(
        body.allow_mixed_box_types, tenant_rules.get("allow_mixed_box_types", False)
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

    # Validate size consistency
    lot_sizes = {item["size"] for item in box_queue if item["size"]}
    if len(lot_sizes) > 1 and not allow_mixed_sizes:
        raise HTTPException(
            status_code=400,
            detail=f"Mixed sizes on pallet ({', '.join(sorted(lot_sizes))}). "
                   "Use allow_mixed_sizes to override.",
        )

    # Validate box type consistency
    lot_box_ids = {
        lot_map[a.lot_id].box_size_id
        for a in body.lot_assignments
        if lot_map[a.lot_id].box_size_id
    }
    if len(lot_box_ids) > 1 and not allow_mixed_box_types:
        names: list[str] = []
        for bsid in lot_box_ids:
            for lot in lot_map.values():
                if lot.box_size_id == bsid:
                    bs_name = lot.box_size.name if hasattr(lot, "box_size") and lot.box_size else bsid
                    names.append(bs_name)
                    break
        raise HTTPException(
            status_code=400,
            detail=f"Mixed box types on pallet ({', '.join(sorted(set(names)))}). "
                   "Use allow_mixed_box_types to override.",
        )

    # Determine pallet size: explicit > detected from lots
    pallet_size = body.size or (lot_sizes.pop() if len(lot_sizes) == 1 else None)

    # Detect fruit info from first lot for denormalization
    first_lot = lot_map[body.lot_assignments[0].lot_id]

    # Pre-generate all pallet codes in one batch (2 DB queries instead of 2N)
    total_boxes = sum(item["box_count"] for item in box_queue)
    estimated_pallets = math.ceil(total_boxes / body.capacity_boxes)
    pallet_codes = await generate_codes(db, "pallet", estimated_pallets)
    code_idx = 0

    # Fill pallets (auto-overflow)
    created_pallets: list[Pallet] = []
    remaining_capacity = body.capacity_boxes
    current_pallet: Pallet | None = None

    for item in box_queue:
        boxes_left = item["box_count"]
        while boxes_left > 0:
            if current_pallet is None or remaining_capacity <= 0:
                # Create new pallet using pre-generated code
                pallet_number = pallet_codes[code_idx]
                code_idx += 1
                current_pallet = Pallet(
                    id=str(uuid.uuid4()),
                    pallet_number=pallet_number,
                    pallet_type_name=body.pallet_type_name,
                    capacity_boxes=body.capacity_boxes,
                    current_boxes=0,
                    packhouse_id=body.packhouse_id,
                    fruit_type=first_lot.fruit_type,
                    variety=first_lot.variety,
                    grade=first_lot.grade,
                    size=pallet_size,
                    box_size_id=first_lot.box_size_id,
                    box_size_name=(
                        first_lot.box_size.name
                        if hasattr(first_lot, "box_size") and first_lot.box_size
                        else None
                    ),
                    palletized_by=user.id,
                    status="open",
                    notes=body.notes,
                )
                db.add(current_pallet)
                created_pallets.append(current_pallet)
                remaining_capacity = body.capacity_boxes

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


# ── POST /api/pallets/ (empty pallet) ────────────────────────

@router.post("/", response_model=PalletSummary, status_code=201)
async def create_empty_pallet(
    body: CreateEmptyPalletRequest,
    db: AsyncSession = Depends(get_tenant_db),
    user: User = Depends(require_permission("batch.write")),
    _onboarded: User = Depends(require_onboarded),
):
    """Create an empty pallet shell for later lot allocation."""
    # Resolve box size name if box_size_id provided
    box_size_name = None
    if body.box_size_id:
        bs_result = await db.execute(
            select(BoxSize).where(BoxSize.id == body.box_size_id)
        )
        bs = bs_result.scalar_one_or_none()
        if not bs:
            raise HTTPException(status_code=404, detail="Box size not found")
        box_size_name = bs.name

    pallet_number = await generate_code(db, "pallet")
    pallet = Pallet(
        id=str(uuid.uuid4()),
        pallet_number=pallet_number,
        pallet_type_name=body.pallet_type_name,
        capacity_boxes=body.capacity_boxes,
        current_boxes=0,
        packhouse_id=body.packhouse_id,
        size=body.size,
        box_size_id=body.box_size_id,
        box_size_name=box_size_name,
        palletized_by=user.id,
        status="open",
        notes=body.notes,
    )
    db.add(pallet)
    await db.flush()

    await log_activity(
        db, user,
        action="created",
        entity_type="pallet",
        entity_id=pallet.id,
        entity_code=pallet.pallet_number,
        summary=f"Created empty pallet {pallet.pallet_number} (capacity {pallet.capacity_boxes})",
    )

    return PalletSummary.model_validate(pallet)


# ── GET /api/pallets/ ────────────────────────────────────────

@router.get("/", response_model=PaginatedResponse[PalletSummary])
async def list_pallets(
    status: str | None = None,
    pallet_type: str | None = None,
    search: str | None = Query(None),
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
    if search:
        q = f"%{search}%"
        base = (
            base
            .outerjoin(PalletLot, (PalletLot.pallet_id == Pallet.id) & (PalletLot.is_deleted == False))  # noqa: E712
            .outerjoin(Lot, Lot.id == PalletLot.lot_id)
            .outerjoin(Batch, Batch.id == Lot.batch_id)
            .where(or_(
                Pallet.pallet_number.ilike(q),
                Lot.lot_code.ilike(q),
                Batch.batch_code.ilike(q),
            ))
            .distinct()
        )

    count_result = await db.execute(
        select(func.count()).select_from(base.subquery())
    )
    total = count_result.scalar() or 0

    items_result = await db.execute(
        base.order_by(Pallet.created_at.desc()).limit(limit).offset(offset)
    )
    items = list(items_result.scalars().all())

    # Populate lot_codes and batch_codes only when searching (avoids
    # extra JOIN on every default page load)
    if items and search:
        pallet_ids = [p.id for p in items]
        trace_result = await db.execute(
            select(PalletLot.pallet_id, Lot.lot_code, Batch.batch_code)
            .join(Lot, Lot.id == PalletLot.lot_id)
            .join(Batch, Batch.id == Lot.batch_id)
            .where(PalletLot.pallet_id.in_(pallet_ids), PalletLot.is_deleted == False)  # noqa: E712
        )
        lot_map: dict[str, set[str]] = {}
        batch_map: dict[str, set[str]] = {}
        for pid, lot_code, batch_code in trace_result.all():
            lot_map.setdefault(pid, set()).add(lot_code)
            batch_map.setdefault(pid, set()).add(batch_code)

        summaries = []
        for p in items:
            s = PalletSummary.model_validate(p)
            s.lot_codes = sorted(lot_map.get(p.id, set()))
            s.batch_codes = sorted(batch_map.get(p.id, set()))
            summaries.append(s)
    else:
        summaries = [PalletSummary.model_validate(p) for p in items]

    return PaginatedResponse(
        items=summaries,
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
        .options(
            selectinload(Pallet.pallet_lots)
            .selectinload(PalletLot.lot)
            .selectinload(Lot.box_size),
        )
    )
    pallet = result.scalar_one_or_none()
    if not pallet:
        raise HTTPException(status_code=404, detail="Pallet not found")

    # Filter to active allocations only and enrich with lot info
    detail = PalletDetail.model_validate(pallet)
    active_lots = [pl for pl in pallet.pallet_lots if not pl.is_deleted]
    detail.pallet_lots = [PalletLotOut.model_validate(pl) for pl in active_lots]
    for pl_out, pl_orm in zip(detail.pallet_lots, active_lots):
        if pl_orm.lot:
            pl_out.lot_code = pl_orm.lot.lot_code
            pl_out.grade = pl_orm.lot.grade
            pl_out.box_size_name = (
                pl_orm.lot.box_size.name if pl_orm.lot.box_size else None
            )

    # Add downstream lock info
    lock_info = await get_pallet_locks(db, pallet)
    detail.locked_fields = lock_info.locked_field_names()

    return detail


# ── PATCH /api/pallets/{pallet_id} ────────────────────────────

@router.patch("/{pallet_id}", response_model=PalletDetail)
async def update_pallet(
    pallet_id: str,
    body: PalletUpdate,
    db: AsyncSession = Depends(get_tenant_db),
    _user: User = Depends(require_permission("batch.write")),
    _onboarded: User = Depends(require_onboarded),
):
    """Update editable fields on a pallet. Blocked for loaded/exported pallets."""
    result = await db.execute(
        select(Pallet)
        .where(Pallet.id == pallet_id, Pallet.is_deleted == False)  # noqa: E712
        .options(
            selectinload(Pallet.pallet_lots)
            .selectinload(PalletLot.lot)
            .selectinload(Lot.box_size),
        )
    )
    pallet = result.scalar_one_or_none()
    if not pallet:
        raise HTTPException(status_code=404, detail="Pallet not found")
    if pallet.status in ("loaded", "exported"):
        raise HTTPException(
            status_code=400,
            detail=f"Cannot edit a '{pallet.status}' pallet",
        )

    # ── Downstream lock check ─────────────────────────────────
    lock_info = await get_pallet_locks(db, pallet)
    if lock_info.is_locked:
        updating = set(body.model_dump(exclude_unset=True).keys())
        conflict = lock_info.check_update(updating)
        if conflict:
            raise HTTPException(
                status_code=http_status.HTTP_409_CONFLICT,
                detail=f"{conflict.reason}. {conflict.unlock_hint}",
            )

    updates = body.model_dump(exclude_unset=True)
    if "capacity_boxes" in updates and updates["capacity_boxes"] < pallet.current_boxes:
        raise HTTPException(
            status_code=400,
            detail=f"Capacity cannot be less than current boxes ({pallet.current_boxes})",
        )

    # Auto-resolve box_size_name when box_size_id changes
    if "box_size_id" in updates:
        new_box_id = updates["box_size_id"]
        if new_box_id:
            bs_result = await db.execute(
                select(BoxSize).where(BoxSize.id == new_box_id)
            )
            bs = bs_result.scalar_one_or_none()
            if not bs:
                raise HTTPException(status_code=400, detail="Box size not found")
            updates["box_size_name"] = bs.name
        else:
            updates["box_size_name"] = None

    for field, value in updates.items():
        setattr(pallet, field, value)

    await db.flush()

    detail = PalletDetail.model_validate(pallet)
    active_lots = [pl for pl in pallet.pallet_lots if not pl.is_deleted]
    detail.pallet_lots = [PalletLotOut.model_validate(pl) for pl in active_lots]
    for pl_out, pl_orm in zip(detail.pallet_lots, active_lots):
        if pl_orm.lot:
            pl_out.lot_code = pl_orm.lot.lot_code
            pl_out.grade = pl_orm.lot.grade
            pl_out.box_size_name = (
                pl_orm.lot.box_size.name if pl_orm.lot.box_size else None
            )
    return detail


# ── DELETE /api/pallets/{pallet_id} ──────────────────────────

@router.delete("/{pallet_id}", status_code=http_status.HTTP_204_NO_CONTENT)
async def delete_pallet(
    pallet_id: str,
    db: AsyncSession = Depends(get_tenant_db),
    _user: User = Depends(require_permission("batch.write")),
    _onboarded: User = Depends(require_onboarded),
):
    """Soft-delete a pallet. Only allowed if current_boxes == 0."""
    result = await db.execute(
        select(Pallet).where(
            Pallet.id == pallet_id,
            Pallet.is_deleted == False,  # noqa: E712
        )
    )
    pallet = result.scalar_one_or_none()
    if not pallet:
        raise HTTPException(status_code=404, detail="Pallet not found")
    if pallet.current_boxes > 0:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot delete pallet with {pallet.current_boxes} allocated box(es). "
                   "Deallocate all lots first.",
        )

    pallet.is_deleted = True
    await db.flush()

    await log_activity(
        db, _user,
        action="deleted",
        entity_type="pallet",
        entity_id=pallet.id,
        entity_code=pallet.pallet_number,
        summary=f"Deleted pallet {pallet.pallet_number}",
    )


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
        pl.lot.lot_code for pl in pallet.pallet_lots if pl.lot and not pl.is_deleted
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
    if pallet.container_id:
        raise HTTPException(
            status_code=http_status.HTTP_409_CONFLICT,
            detail="Cannot allocate boxes: pallet is loaded in a container. Unload pallet first.",
        )

    total_new_boxes = sum(a.box_count for a in body.lot_assignments)
    remaining = pallet.capacity_boxes - pallet.current_boxes
    if total_new_boxes > remaining:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot fit {total_new_boxes} boxes, only {remaining} capacity remaining",
        )

    # Load tenant mixed pallet rules and resolve flags
    tenant_rules = await _get_mixed_pallet_rules(db)
    allow_mixed_sizes = _resolve_mixed_flag(
        body.allow_mixed_sizes, tenant_rules.get("allow_mixed_sizes", False)
    )
    allow_mixed_box_types = _resolve_mixed_flag(
        body.allow_mixed_box_types, tenant_rules.get("allow_mixed_box_types", False)
    )

    # Load all referenced lots with row-level lock to prevent concurrent over-allocation
    alloc_lot_ids = list({a.lot_id for a in body.lot_assignments})
    lot_result_all = await db.execute(
        select(Lot).where(
            Lot.id.in_(alloc_lot_ids),
            Lot.is_deleted == False,  # noqa: E712
        ).options(selectinload(Lot.box_size))
        .with_for_update()
    )
    alloc_lot_map: dict[str, Lot] = {lot.id: lot for lot in lot_result_all.scalars().all()}

    # Check all lots were found
    for a in body.lot_assignments:
        if a.lot_id not in alloc_lot_map:
            raise HTTPException(status_code=404, detail=f"Lot {a.lot_id} not found")

    # Validate size consistency with pallet
    if pallet.size and not allow_mixed_sizes:
        mismatched: list[str] = []
        for a in body.lot_assignments:
            lot_check = alloc_lot_map[a.lot_id]
            lot_size = a.size or lot_check.size
            if lot_size and lot_size != pallet.size:
                mismatched.append(f"{lot_check.lot_code} (size: {lot_size})")
        if mismatched:
            raise HTTPException(
                status_code=400,
                detail=f"Pallet size is '{pallet.size}'. Mismatched lots: "
                       f"{', '.join(mismatched)}. Use allow_mixed_sizes to override.",
            )

    # Validate box type consistency with pallet
    if pallet.box_size_id and not allow_mixed_box_types:
        mismatched_box: list[str] = []
        for a in body.lot_assignments:
            lot_bt = alloc_lot_map[a.lot_id]
            if lot_bt.box_size_id and lot_bt.box_size_id != pallet.box_size_id:
                lot_box_name = lot_bt.box_size.name if lot_bt.box_size else lot_bt.box_size_id
                mismatched_box.append(f"{lot_bt.lot_code} (box type: {lot_box_name})")
        if mismatched_box:
            raise HTTPException(
                status_code=400,
                detail=f"Pallet box type is '{pallet.box_size_name}'. Mismatched lots: "
                       f"{', '.join(mismatched_box)}. Use allow_mixed_box_types to override.",
            )

    # Validate each lot has enough unallocated boxes (single batched query)
    palletized_map = await _already_palletized_batch(db, alloc_lot_ids)
    for assignment in body.lot_assignments:
        lot = alloc_lot_map[assignment.lot_id]
        already = palletized_map.get(assignment.lot_id, 0)
        available = lot.carton_count - already
        if assignment.box_count > available:
            raise HTTPException(
                status_code=400,
                detail=f"Lot {lot.lot_code} has only {available} unallocated box(es), "
                       f"cannot assign {assignment.box_count}",
            )

    for assignment in body.lot_assignments:
        lot = alloc_lot_map[assignment.lot_id]
        lot_size = assignment.size or lot.size
        pallet_lot = PalletLot(
            id=str(uuid.uuid4()),
            pallet_id=pallet.id,
            lot_id=assignment.lot_id,
            box_count=assignment.box_count,
            size=lot_size,
        )
        db.add(pallet_lot)
        pallet.current_boxes += assignment.box_count

        # Auto-set pallet metadata from first allocation if not yet set
        if not pallet.size and lot_size:
            pallet.size = lot_size
        if not pallet.fruit_type and lot.fruit_type:
            pallet.fruit_type = lot.fruit_type
        if not pallet.variety and lot.variety:
            pallet.variety = lot.variety
        if not pallet.grade and lot.grade:
            pallet.grade = lot.grade
        if not pallet.box_size_id and lot.box_size_id:
            pallet.box_size_id = lot.box_size_id
            pallet.box_size_name = (
                lot.box_size.name if lot.box_size else None
            )

        if lot.status == "created":
            lot.status = "palletizing"

    if pallet.current_boxes >= pallet.capacity_boxes:
        pallet.status = "closed"

    await db.flush()

    await log_activity(
        db, user,
        action="allocated",
        entity_type="pallet",
        entity_id=pallet.id,
        entity_code=pallet.pallet_number,
        summary=f"Allocated {total_new_boxes} box(es) to pallet {pallet.pallet_number}",
        details={"boxes_added": total_new_boxes, "current_boxes": pallet.current_boxes},
    )

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

    # Load the pallet-lot link (active only)
    pl_result = await db.execute(
        select(PalletLot).where(
            PalletLot.id == pallet_lot_id,
            PalletLot.pallet_id == pallet_id,
            PalletLot.is_deleted == False,  # noqa: E712
        )
    )
    pallet_lot = pl_result.scalar_one_or_none()
    if not pallet_lot:
        raise HTTPException(status_code=404, detail="Pallet-lot allocation not found")

    boxes_returned = pallet_lot.box_count
    lot_id = pallet_lot.lot_id

    # Soft-delete the allocation (preserves traceability history)
    pallet_lot.is_deleted = True
    pallet_lot.deallocated_at = datetime.utcnow()

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

    # Revert batch status if it was "complete"/"completed" but now has unallocated lots
    if lot:
        batch_result = await db.execute(
            select(Batch).where(Batch.id == lot.batch_id)
        )
        batch = batch_result.scalar_one_or_none()
        if batch and batch.status in ("complete", "completed"):
            batch.status = "packing"

    await db.flush()

    await log_activity(
        db, user,
        action="deallocated",
        entity_type="pallet",
        entity_id=pallet.id,
        entity_code=pallet.pallet_number,
        summary=f"Deallocated {boxes_returned} box(es) from pallet {pallet.pallet_number}",
        details={"boxes_returned": boxes_returned, "current_boxes": pallet.current_boxes},
    )

    return DeallocateResult(
        pallet_id=pallet_id,
        pallet_lot_id=pallet_lot_id,
        boxes_returned=boxes_returned,
        pallet_status=pallet.status,
        pallet_current_boxes=pallet.current_boxes,
    )
