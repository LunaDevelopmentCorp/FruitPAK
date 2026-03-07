"""Container management router.

Endpoints:
    POST   /api/containers/                     Create empty container
    POST   /api/containers/from-pallets         Create container and assign pallets
    POST   /api/containers/{id}/load-pallets    Load pallets into existing container
    POST   /api/containers/{id}/mark-loaded     Transition loading → loaded
    POST   /api/containers/{id}/seal            Transition loaded → sealed
    POST   /api/containers/{id}/dispatch        Transition sealed → dispatched
    POST   /api/containers/{id}/export          Transition dispatched → in_transit
    POST   /api/containers/{id}/arrive          Transition in_transit → arrived
    POST   /api/containers/{id}/deliver         Transition arrived → delivered
    POST   /api/containers/{id}/revert          Step back one status
    GET    /api/containers/                     List containers (with filters)
    GET    /api/containers/{container_id}       Detail with pallets + traceability
    GET    /api/containers/{container_id}/qr    QR code SVG for container
    PATCH  /api/containers/{container_id}       Update container details
    DELETE /api/containers/{container_id}       Soft-delete container
"""

import io
import json
import uuid
from datetime import date, datetime

import segno
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import Response
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth.deps import require_onboarded, require_permission
from app.auth.packhouse_scope import get_packhouse_scope
from app.database import get_tenant_db
from app.models.public.user import User
from app.models.tenant.client import Client
from app.models.tenant.batch import Batch
from app.models.tenant.container import Container
from app.models.tenant.lot import Lot
from app.models.tenant.pallet import Pallet, PalletLot
from app.schemas.common import PaginatedResponse
from app.schemas.container import (
    ContainerDetail,
    ContainerFromPalletsRequest,
    ContainerPalletOut,
    ContainerSummary,
    ContainerUpdate,
    CreateEmptyContainerRequest,
    ExportContainerRequest,
    LoadPalletsRequest,
    SealContainerRequest,
    TraceBatch,
    TraceLot,
    TracePallet,
)
from app.utils.activity import log_activity
from app.utils.locks import get_container_locks
from app.utils.numbering import generate_code

router = APIRouter()


def _container_summary(container: Container) -> ContainerSummary:
    """Build a ContainerSummary with denormalized relationship names + overdue flag."""
    s = ContainerSummary.model_validate(container)
    if container.transporter:
        s.transporter_name = container.transporter.name
    if container.shipping_agent:
        s.shipping_agent_name = container.shipping_agent.name
    if container.shipping_line:
        s.shipping_line_name = container.shipping_line.name
    s.is_overdue = (
        container.status in ("dispatched", "in_transit")
        and container.eta is not None
        and container.eta < date.today()
    )
    return s


async def _load_container(
    db: AsyncSession, container_id: str, packhouse_scope: list[str] | None,
) -> Container:
    """Load a single container with scope check, raising 404 if not found."""
    result = await db.execute(
        select(Container).where(
            Container.id == container_id,
            Container.is_deleted == False,  # noqa: E712
        )
    )
    container = result.scalar_one_or_none()
    if not container:
        raise HTTPException(status_code=404, detail="Container not found")
    if packhouse_scope is not None and container.packhouse_id and container.packhouse_id not in packhouse_scope:
        raise HTTPException(status_code=404, detail="Container not found")
    return container


async def _resolve_client(db: AsyncSession, client_id: str | None) -> tuple[str | None, str | None]:
    """Return (client_id, customer_name) from client lookup."""
    if not client_id:
        return None, None
    result = await db.execute(select(Client).where(Client.id == client_id))
    client = result.scalar_one_or_none()
    if not client:
        raise HTTPException(status_code=400, detail="Client not found")
    return client.id, client.name


# ── POST /api/containers/ (empty) ────────────────────────────

@router.post("/", response_model=ContainerSummary, status_code=201)
async def create_empty_container(
    body: CreateEmptyContainerRequest,
    db: AsyncSession = Depends(get_tenant_db),
    user: User = Depends(require_permission("batch.write")),
    packhouse_scope: list[str] | None = Depends(get_packhouse_scope),
):
    """Create an empty container (no pallets yet — load them later)."""
    client_id, customer_name = await _resolve_client(db, body.client_id)

    container_number = await generate_code(db, "container")
    container = Container(
        id=str(uuid.uuid4()),
        container_number=container_number,
        container_type=body.container_type,
        capacity_pallets=body.capacity_pallets,
        client_id=client_id,
        customer_name=customer_name,
        shipping_container_number=body.shipping_container_number,
        destination=body.destination,
        export_date=body.export_date,
        seal_number=body.seal_number,
        transporter_id=body.transporter_id,
        shipping_agent_id=body.shipping_agent_id,
        shipping_line_id=body.shipping_line_id,
        vessel_name=body.vessel_name,
        voyage_number=body.voyage_number,
        eta=body.eta,
        pallet_count=0,
        total_cartons=0,
        status="open",
        notes=body.notes,
    )
    db.add(container)
    await db.flush()

    await log_activity(
        db, user,
        action="created",
        entity_type="container",
        entity_id=container.id,
        entity_code=container.container_number,
        summary=f"Created empty container {container.container_number} for {customer_name or 'unassigned client'}",
    )

    return _container_summary(container)


# ── POST /api/containers/from-pallets ────────────────────────

@router.post("/from-pallets", response_model=ContainerSummary, status_code=201)
async def create_container_from_pallets(
    body: ContainerFromPalletsRequest,
    db: AsyncSession = Depends(get_tenant_db),
    user: User = Depends(require_permission("batch.write")),
    packhouse_scope: list[str] | None = Depends(get_packhouse_scope),
):
    """Create a container and assign pallets to it."""
    # Resolve client if provided
    client_id, client_name = await _resolve_client(db, body.client_id)
    customer_name = client_name or body.customer_name

    # Validate pallets exist and are available
    result = await db.execute(
        select(Pallet)
        .where(
            Pallet.id.in_(body.pallet_ids),
            Pallet.is_deleted == False,  # noqa: E712
        )
        .options(selectinload(Pallet.pallet_lots))
    )
    pallets = result.scalars().all()

    if len(pallets) != len(body.pallet_ids):
        found = {p.id for p in pallets}
        missing = [pid for pid in body.pallet_ids if pid not in found]
        raise HTTPException(
            status_code=404,
            detail=f"Pallets not found: {', '.join(missing[:3])}",
        )

    # Check pallets are within packhouse scope
    if packhouse_scope is not None:
        out_of_scope = [p.pallet_number for p in pallets if p.packhouse_id not in packhouse_scope]
        if out_of_scope:
            raise HTTPException(
                status_code=403,
                detail=f"Pallets not in scope: {', '.join(out_of_scope[:3])}",
            )

    # Check pallets aren't already in a container
    already_loaded = [p.pallet_number for p in pallets if p.container_id]
    if already_loaded:
        raise HTTPException(
            status_code=422,
            detail=f"Already in a container: {', '.join(already_loaded[:3])}",
        )

    # Create container
    container_number = await generate_code(db, "container")
    total_cartons = sum(p.current_boxes for p in pallets)
    total_weight = sum(p.gross_weight_kg or p.net_weight_kg or 0.0 for p in pallets)

    container = Container(
        id=str(uuid.uuid4()),
        container_number=container_number,
        container_type=body.container_type,
        capacity_pallets=body.capacity_pallets,
        client_id=client_id,
        customer_name=customer_name,
        shipping_container_number=body.shipping_container_number,
        destination=body.destination,
        export_date=body.export_date,
        seal_number=body.seal_number,
        transporter_id=body.transporter_id,
        shipping_agent_id=body.shipping_agent_id,
        shipping_line_id=body.shipping_line_id,
        vessel_name=body.vessel_name,
        voyage_number=body.voyage_number,
        eta=body.eta,
        pallet_count=len(pallets),
        total_cartons=total_cartons,
        gross_weight_kg=total_weight if total_weight else None,
        status="loading",
        notes=body.notes,
    )
    db.add(container)
    await db.flush()

    # Link pallets to container
    for pallet in pallets:
        pallet.container_id = container.id
        pallet.loaded_at = datetime.utcnow()
        if pallet.status in ("open", "closed", "stored", "allocated"):
            pallet.status = "loaded"

    await db.flush()

    await log_activity(
        db, user,
        action="created",
        entity_type="container",
        entity_id=container.id,
        entity_code=container.container_number,
        summary=f"Created container {container.container_number} with {len(pallets)} pallet(s) for {customer_name or 'unknown customer'}",
        details={"pallet_count": len(pallets), "total_cartons": total_cartons},
    )

    return _container_summary(container)


# ── POST /api/containers/{id}/load-pallets ───────────────────

@router.post("/{container_id}/load-pallets", response_model=ContainerSummary)
async def load_pallets_into_container(
    container_id: str,
    body: LoadPalletsRequest,
    db: AsyncSession = Depends(get_tenant_db),
    user: User = Depends(require_permission("batch.write")),
    packhouse_scope: list[str] | None = Depends(get_packhouse_scope),
):
    """Load pallets into an existing container."""
    result = await db.execute(
        select(Container).where(
            Container.id == container_id,
            Container.is_deleted == False,  # noqa: E712
        )
    )
    container = result.scalar_one_or_none()
    if not container:
        raise HTTPException(status_code=404, detail="Container not found")
    if packhouse_scope is not None and container.packhouse_id and container.packhouse_id not in packhouse_scope:
        raise HTTPException(status_code=404, detail="Container not found")

    if container.status in ("loaded", "sealed", "dispatched", "in_transit", "arrived", "delivered"):
        raise HTTPException(
            status_code=422,
            detail=f"Cannot load pallets — container is {container.status}",
        )

    lock_info = await get_container_locks(db, container)
    if lock_info.is_locked:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cannot load pallets: container is in a dispatched export. Remove from export first.",
        )

    # Validate pallets
    pallet_result = await db.execute(
        select(Pallet)
        .where(
            Pallet.id.in_(body.pallet_ids),
            Pallet.is_deleted == False,  # noqa: E712
        )
        .options(selectinload(Pallet.pallet_lots))
    )
    pallets = pallet_result.scalars().all()

    if len(pallets) != len(body.pallet_ids):
        found = {p.id for p in pallets}
        missing = [pid for pid in body.pallet_ids if pid not in found]
        raise HTTPException(
            status_code=404,
            detail=f"Pallets not found: {', '.join(missing[:3])}",
        )

    already_loaded = [p.pallet_number for p in pallets if p.container_id]
    if already_loaded:
        raise HTTPException(
            status_code=422,
            detail=f"Already in a container: {', '.join(already_loaded[:3])}",
        )

    # Link pallets — assign sequential position based on current count
    next_pos = container.pallet_count + 1
    for pallet in pallets:
        pallet.container_id = container.id
        pallet.loaded_at = datetime.utcnow()
        pallet.position_in_container = str(next_pos)
        next_pos += 1
        if pallet.status in ("open", "closed", "stored", "allocated"):
            pallet.status = "loaded"

    # Update container tallies
    added_cartons = sum(p.current_boxes for p in pallets)
    added_weight = sum(p.gross_weight_kg or p.net_weight_kg or 0.0 for p in pallets)

    container.pallet_count += len(pallets)
    container.total_cartons += added_cartons
    container.gross_weight_kg = (container.gross_weight_kg or 0) + added_weight if added_weight else container.gross_weight_kg

    if container.status == "open":
        container.status = "loading"

    await db.flush()

    await log_activity(
        db, user,
        action="updated",
        entity_type="container",
        entity_id=container.id,
        entity_code=container.container_number,
        summary=f"Loaded {len(pallets)} pallet(s) into {container.container_number}",
        details={"pallets_added": len(pallets), "total_pallets": container.pallet_count},
    )

    return _container_summary(container)


# ── PATCH /api/containers/{id} ────────────────────────────────

@router.patch("/{container_id}", response_model=ContainerSummary)
async def update_container(
    container_id: str,
    body: ContainerUpdate,
    db: AsyncSession = Depends(get_tenant_db),
    user: User = Depends(require_permission("batch.write")),
    packhouse_scope: list[str] | None = Depends(get_packhouse_scope),
):
    """Update container details (type, customer, destination, etc.)."""
    result = await db.execute(
        select(Container).where(
            Container.id == container_id,
            Container.is_deleted == False,  # noqa: E712
        )
    )
    container = result.scalar_one_or_none()
    if not container:
        raise HTTPException(status_code=404, detail="Container not found")
    if packhouse_scope is not None and container.packhouse_id and container.packhouse_id not in packhouse_scope:
        raise HTTPException(status_code=404, detail="Container not found")

    # ── Downstream lock check ─────────────────────────────────
    lock_info = await get_container_locks(db, container)
    if lock_info.is_locked:
        updating = set(body.model_dump(exclude_unset=True).keys())
        conflict = lock_info.check_update(updating)
        if conflict:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail=f"{conflict.reason}. {conflict.unlock_hint}",
            )

    updates = body.model_dump(exclude_unset=True)

    # Resolve client if changed
    if "client_id" in updates:
        client_id, customer_name = await _resolve_client(db, updates["client_id"])
        container.client_id = client_id
        if customer_name:
            container.customer_name = customer_name
        updates.pop("client_id")
        updates.pop("customer_name", None)

    for field, value in updates.items():
        if hasattr(container, field):
            setattr(container, field, value)

    container.updated_at = datetime.utcnow()
    await db.flush()

    await log_activity(
        db, user,
        action="updated",
        entity_type="container",
        entity_id=container.id,
        entity_code=container.container_number,
        summary=f"Updated container {container.container_number}",
    )

    return _container_summary(container)


# ── GET /api/containers/ ─────────────────────────────────────

@router.get("/", response_model=PaginatedResponse[ContainerSummary])
async def list_containers(
    status: str | None = None,
    customer: str | None = None,
    client_id: str | None = None,
    search: str | None = Query(None),
    limit: int = Query(50, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_tenant_db),
    _user: User = Depends(require_permission("batch.read")),
    _onboarded: User = Depends(require_onboarded),
    packhouse_scope: list[str] | None = Depends(get_packhouse_scope),
):
    base = select(Container).where(Container.is_deleted == False)  # noqa: E712

    if packhouse_scope is not None:
        base = base.where(Container.packhouse_id.in_(packhouse_scope))
    if status:
        base = base.where(Container.status == status)
    if client_id:
        base = base.where(Container.client_id == client_id)
    if customer:
        base = base.where(Container.customer_name.ilike(f"%{customer}%"))
    if search:
        q = f"%{search}%"
        matching_ids = (
            select(Container.id)
            .outerjoin(Pallet, (Pallet.container_id == Container.id) & (Pallet.is_deleted == False))  # noqa: E712
            .outerjoin(PalletLot, (PalletLot.pallet_id == Pallet.id) & (PalletLot.is_deleted == False))  # noqa: E712
            .outerjoin(Lot, Lot.id == PalletLot.lot_id)
            .outerjoin(Batch, Batch.id == Lot.batch_id)
            .where(
                Container.is_deleted == False,  # noqa: E712
                or_(
                    Container.container_number.ilike(q),
                    Container.customer_name.ilike(q),
                    Container.destination.ilike(q),
                    Container.shipping_container_number.ilike(q),
                    Pallet.pallet_number.ilike(q),
                    Lot.lot_code.ilike(q),
                    Batch.batch_code.ilike(q),
                ),
            )
            .distinct()
        )
        if packhouse_scope is not None:
            matching_ids = matching_ids.where(Container.packhouse_id.in_(packhouse_scope))
        if status:
            matching_ids = matching_ids.where(Container.status == status)
        if customer:
            matching_ids = matching_ids.where(Container.customer_name.ilike(f"%{customer}%"))
        base = select(Container).where(Container.id.in_(matching_ids))

    count_result = await db.execute(
        select(func.count()).select_from(base.subquery())
    )
    total = count_result.scalar() or 0

    items_result = await db.execute(
        base.order_by(Container.created_at.desc()).limit(limit).offset(offset)
    )
    items = list(items_result.scalars().all())

    # Populate pallet_numbers, lot_codes, batch_codes only when searching
    # (avoids extra JOINs on every default page load)
    if items and search:
        container_ids = [c.id for c in items]
        trace_result = await db.execute(
            select(
                Pallet.container_id,
                Pallet.pallet_number,
                Lot.lot_code,
                Batch.batch_code,
            )
            .outerjoin(PalletLot, (PalletLot.pallet_id == Pallet.id) & (PalletLot.is_deleted == False))  # noqa: E712
            .outerjoin(Lot, Lot.id == PalletLot.lot_id)
            .outerjoin(Batch, Batch.id == Lot.batch_id)
            .where(
                Pallet.container_id.in_(container_ids),
                Pallet.is_deleted == False,  # noqa: E712
            )
        )
        pallet_map: dict[str, set[str]] = {}
        lot_map: dict[str, set[str]] = {}
        batch_map: dict[str, set[str]] = {}
        for cid, pnum, lcode, bcode in trace_result.all():
            pallet_map.setdefault(cid, set()).add(pnum)
            if lcode:
                lot_map.setdefault(cid, set()).add(lcode)
            if bcode:
                batch_map.setdefault(cid, set()).add(bcode)

        summaries = []
        for c in items:
            s = _container_summary(c)
            s.pallet_numbers = sorted(pallet_map.get(c.id, set()))
            s.lot_codes = sorted(lot_map.get(c.id, set()))
            s.batch_codes = sorted(batch_map.get(c.id, set()))
            summaries.append(s)
    else:
        summaries = [_container_summary(c) for c in items]

    return PaginatedResponse(
        items=summaries,
        total=total,
        limit=limit,
        offset=offset,
    )


# ── GET /api/containers/{container_id} ───────────────────────

@router.get("/{container_id}", response_model=ContainerDetail)
async def get_container(
    container_id: str,
    db: AsyncSession = Depends(get_tenant_db),
    _user: User = Depends(require_permission("batch.read")),
    _onboarded: User = Depends(require_onboarded),
    packhouse_scope: list[str] | None = Depends(get_packhouse_scope),
):
    result = await db.execute(
        select(Container)
        .where(Container.id == container_id, Container.is_deleted == False)  # noqa: E712
        .options(
            selectinload(Container.pallets)
            .selectinload(Pallet.pallet_lots)
            .selectinload(PalletLot.lot)
            .selectinload(Lot.box_size),
            selectinload(Container.pallets)
            .selectinload(Pallet.pallet_lots)
            .selectinload(PalletLot.lot)
            .selectinload(Lot.batch)
            .selectinload(Batch.grower),
        )
    )
    container = result.scalar_one_or_none()
    if not container:
        raise HTTPException(status_code=404, detail="Container not found")
    if packhouse_scope is not None and container.packhouse_id and container.packhouse_id not in packhouse_scope:
        raise HTTPException(status_code=404, detail="Container not found")

    detail = ContainerDetail.model_validate(container)
    if container.transporter:
        detail.transporter_name = container.transporter.name
    if container.shipping_agent:
        detail.shipping_agent_name = container.shipping_agent.name
    if container.shipping_line:
        detail.shipping_line_name = container.shipping_line.name
    detail.is_overdue = (
        container.status in ("dispatched", "in_transit")
        and container.eta is not None
        and container.eta < date.today()
    )

    # Build traceability: container → pallets → lots → batches → growers
    trace_pallets: list[TracePallet] = []
    for p in container.pallets:
        tp = TracePallet(
            pallet_number=p.pallet_number,
            current_boxes=p.current_boxes,
        )
        seen_batches: set[str] = set()
        for pl in p.pallet_lots:
            if pl.lot:
                tp.lots.append(TraceLot(
                    lot_code=pl.lot.lot_code,
                    grade=pl.lot.grade,
                    size=pl.lot.size,
                    box_count=pl.box_count,
                    box_size_name=(
                        pl.lot.box_size.name if pl.lot.box_size else None
                    ),
                ))
                # Walk up to batch → grower
                batch = pl.lot.batch if hasattr(pl.lot, "batch") and pl.lot.batch else None
                if batch and batch.id not in seen_batches:
                    seen_batches.add(batch.id)
                    grower = batch.grower if hasattr(batch, "grower") and batch.grower else None
                    tp.batches.append(TraceBatch(
                        batch_code=batch.batch_code,
                        grower_name=grower.name if grower else None,
                        grower_code=grower.grower_code if grower else None,
                        fruit_type=batch.fruit_type,
                        intake_date=batch.intake_date.isoformat() if batch.intake_date else None,
                    ))
        trace_pallets.append(tp)

    detail.traceability = trace_pallets

    lock_info = await get_container_locks(db, container)
    detail.locked_fields = lock_info.locked_field_names()

    return detail


# ── GET /api/containers/{container_id}/qr ────────────────────

@router.get("/{container_id}/qr")
async def get_container_qr(
    container_id: str,
    db: AsyncSession = Depends(get_tenant_db),
    _user: User = Depends(require_permission("batch.read")),
    _onboarded: User = Depends(require_onboarded),
):
    """Return an SVG QR code encoding key container information."""
    result = await db.execute(
        select(Container)
        .where(Container.id == container_id, Container.is_deleted == False)  # noqa: E712
        .options(selectinload(Container.pallets))
    )
    container = result.scalar_one_or_none()
    if not container:
        raise HTTPException(status_code=404, detail="Container not found")

    pallet_numbers = [p.pallet_number for p in container.pallets]
    qr_data = json.dumps({
        "type": "container",
        "container_id": container.id,
        "number": container.container_number,
        "container_type": container.container_type,
        "customer": container.customer_name,
        "destination": container.destination,
        "pallets": pallet_numbers[:20],
        "total_cartons": container.total_cartons,
    }, separators=(",", ":"))

    qr = segno.make(qr_data)
    buf = io.BytesIO()
    qr.save(buf, kind="svg", scale=4, dark="#15803d")
    return Response(content=buf.getvalue(), media_type="image/svg+xml")


# ── DELETE /api/containers/{container_id} ─────────────────────

@router.delete("/{container_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_container(
    container_id: str,
    db: AsyncSession = Depends(get_tenant_db),
    user: User = Depends(require_permission("pallet.delete")),
    _onboarded: User = Depends(require_onboarded),
    packhouse_scope: list[str] | None = Depends(get_packhouse_scope),
):
    """Soft-delete a container.

    Only allowed when status is 'open' or 'loading' with 0 pallets.
    Containers that are 'sealed', 'dispatched', or 'delivered' cannot be deleted.
    """
    result = await db.execute(
        select(Container).where(
            Container.id == container_id,
            Container.is_deleted == False,  # noqa: E712
        )
    )
    container = result.scalar_one_or_none()
    if not container:
        raise HTTPException(status_code=404, detail="Container not found")
    if packhouse_scope is not None and container.packhouse_id and container.packhouse_id not in packhouse_scope:
        raise HTTPException(status_code=404, detail="Container not found")

    # Block delete for containers past loading stage
    if container.status in ("loaded", "sealed", "dispatched", "in_transit", "arrived", "delivered"):
        raise HTTPException(
            status_code=400,
            detail=f"Cannot delete container with status '{container.status}'. "
                   "Only open or empty loading containers can be deleted.",
        )

    # Block delete for loading containers that still have pallets
    if container.status == "loading" and container.pallet_count > 0:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot delete container with {container.pallet_count} loaded pallet(s). "
                   "Unload all pallets first.",
        )

    container.is_deleted = True
    container.updated_at = datetime.utcnow()
    await db.flush()

    await log_activity(
        db, user,
        action="deleted",
        entity_type="container",
        entity_id=container.id,
        entity_code=container.container_number,
        summary=f"Deleted container {container.container_number}",
    )


# ══════════════════════════════════════════════════════════════
# STATUS TRANSITION ENDPOINTS
# ══════════════════════════════════════════════════════════════

# Allowed forward transitions: current_status → next_status
_FORWARD_TRANSITIONS: dict[str, str] = {
    "loading": "loaded",
    "loaded": "sealed",
    "sealed": "dispatched",
    "dispatched": "in_transit",
    "in_transit": "arrived",
    "arrived": "delivered",
}

# Allowed backward transitions for revert
_BACKWARD_TRANSITIONS: dict[str, str] = {
    "loaded": "loading",
    "sealed": "loaded",
    "dispatched": "sealed",
    "in_transit": "dispatched",
    "arrived": "in_transit",
}


@router.post("/{container_id}/mark-loaded", response_model=ContainerSummary)
async def mark_container_loaded(
    container_id: str,
    db: AsyncSession = Depends(get_tenant_db),
    user: User = Depends(require_permission("batch.write")),
    packhouse_scope: list[str] | None = Depends(get_packhouse_scope),
):
    """Transition loading → loaded. Container must have at least 1 pallet."""
    container = await _load_container(db, container_id, packhouse_scope)
    if container.status != "loading":
        raise HTTPException(
            status_code=422,
            detail=f"Cannot mark as loaded — container is '{container.status}', expected 'loading'",
        )
    if container.pallet_count < 1:
        raise HTTPException(
            status_code=422, detail="Cannot mark as loaded — container has no pallets",
        )

    container.status = "loaded"
    container.updated_at = datetime.utcnow()
    await db.flush()

    await log_activity(
        db, user, action="status_change", entity_type="container",
        entity_id=container.id, entity_code=container.container_number,
        summary=f"Marked {container.container_number} as loaded ({container.pallet_count} pallets)",
    )
    return _container_summary(container)


@router.post("/{container_id}/seal", response_model=ContainerSummary)
async def seal_container(
    container_id: str,
    body: SealContainerRequest,
    db: AsyncSession = Depends(get_tenant_db),
    user: User = Depends(require_permission("batch.write")),
    packhouse_scope: list[str] | None = Depends(get_packhouse_scope),
):
    """Transition loaded → sealed. Requires seal number."""
    container = await _load_container(db, container_id, packhouse_scope)
    if container.status != "loaded":
        raise HTTPException(
            status_code=422,
            detail=f"Cannot seal — container is '{container.status}', expected 'loaded'",
        )

    container.status = "sealed"
    container.seal_number = body.seal_number
    container.sealed_at = datetime.utcnow()
    container.sealed_by = user.full_name
    if body.temp_setpoint_c is not None:
        container.temp_setpoint_c = body.temp_setpoint_c
    container.updated_at = datetime.utcnow()
    await db.flush()

    await log_activity(
        db, user, action="status_change", entity_type="container",
        entity_id=container.id, entity_code=container.container_number,
        summary=f"Sealed {container.container_number} (seal: {body.seal_number})",
        details={"seal_number": body.seal_number},
    )
    return _container_summary(container)


@router.post("/{container_id}/dispatch", response_model=ContainerSummary)
async def dispatch_container(
    container_id: str,
    db: AsyncSession = Depends(get_tenant_db),
    user: User = Depends(require_permission("batch.write")),
    packhouse_scope: list[str] | None = Depends(get_packhouse_scope),
):
    """Transition sealed → dispatched. Records dispatch timestamp."""
    container = await _load_container(db, container_id, packhouse_scope)
    if container.status != "sealed":
        raise HTTPException(
            status_code=422,
            detail=f"Cannot dispatch — container is '{container.status}', expected 'sealed'",
        )

    container.status = "dispatched"
    container.dispatched_at = datetime.utcnow()
    container.updated_at = datetime.utcnow()
    await db.flush()

    await log_activity(
        db, user, action="status_change", entity_type="container",
        entity_id=container.id, entity_code=container.container_number,
        summary=f"Dispatched {container.container_number}",
    )
    return _container_summary(container)


@router.post("/{container_id}/export", response_model=ContainerSummary)
async def export_container(
    container_id: str,
    body: ExportContainerRequest,
    db: AsyncSession = Depends(get_tenant_db),
    user: User = Depends(require_permission("batch.write")),
    packhouse_scope: list[str] | None = Depends(get_packhouse_scope),
):
    """Transition dispatched → in_transit. Optionally sets vessel/shipping line/ETA."""
    container = await _load_container(db, container_id, packhouse_scope)
    if container.status != "dispatched":
        raise HTTPException(
            status_code=422,
            detail=f"Cannot mark exported — container is '{container.status}', expected 'dispatched'",
        )

    container.status = "in_transit"
    if body.vessel_name is not None:
        container.vessel_name = body.vessel_name
    if body.voyage_number is not None:
        container.voyage_number = body.voyage_number
    if body.shipping_line_id is not None:
        container.shipping_line_id = body.shipping_line_id
    if body.etd is not None:
        container.etd = body.etd
    if body.eta is not None:
        container.eta = body.eta
    container.updated_at = datetime.utcnow()
    await db.flush()

    await log_activity(
        db, user, action="status_change", entity_type="container",
        entity_id=container.id, entity_code=container.container_number,
        summary=f"Marked {container.container_number} as exported / in transit",
        details={"vessel_name": container.vessel_name, "voyage_number": container.voyage_number},
    )
    return _container_summary(container)


@router.post("/{container_id}/arrive", response_model=ContainerSummary)
async def arrive_container(
    container_id: str,
    db: AsyncSession = Depends(get_tenant_db),
    user: User = Depends(require_permission("batch.write")),
    packhouse_scope: list[str] | None = Depends(get_packhouse_scope),
):
    """Transition in_transit → arrived. Records arrival timestamp."""
    container = await _load_container(db, container_id, packhouse_scope)
    if container.status != "in_transit":
        raise HTTPException(
            status_code=422,
            detail=f"Cannot mark arrived — container is '{container.status}', expected 'in_transit'",
        )

    container.status = "arrived"
    container.arrived_at = datetime.utcnow()
    container.updated_at = datetime.utcnow()
    await db.flush()

    await log_activity(
        db, user, action="status_change", entity_type="container",
        entity_id=container.id, entity_code=container.container_number,
        summary=f"Container {container.container_number} arrived at destination",
    )
    return _container_summary(container)


@router.post("/{container_id}/deliver", response_model=ContainerSummary)
async def deliver_container(
    container_id: str,
    db: AsyncSession = Depends(get_tenant_db),
    user: User = Depends(require_permission("batch.write")),
    packhouse_scope: list[str] | None = Depends(get_packhouse_scope),
):
    """Transition arrived → delivered. Confirms client received the container."""
    container = await _load_container(db, container_id, packhouse_scope)
    if container.status != "arrived":
        raise HTTPException(
            status_code=422,
            detail=f"Cannot confirm delivery — container is '{container.status}', expected 'arrived'",
        )

    container.status = "delivered"
    container.delivered_at = datetime.utcnow()
    container.updated_at = datetime.utcnow()
    await db.flush()

    await log_activity(
        db, user, action="status_change", entity_type="container",
        entity_id=container.id, entity_code=container.container_number,
        summary=f"Container {container.container_number} delivered to client",
    )
    return _container_summary(container)


@router.post("/{container_id}/revert", response_model=ContainerSummary)
async def revert_container_status(
    container_id: str,
    db: AsyncSession = Depends(get_tenant_db),
    user: User = Depends(require_permission("batch.write")),
    packhouse_scope: list[str] | None = Depends(get_packhouse_scope),
):
    """Step container back one status for corrections."""
    container = await _load_container(db, container_id, packhouse_scope)

    prev_status = _BACKWARD_TRANSITIONS.get(container.status)
    if not prev_status:
        raise HTTPException(
            status_code=422,
            detail=f"Cannot revert — container status '{container.status}' has no previous step",
        )

    lock_info = await get_container_locks(db, container)
    if lock_info.is_locked:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cannot revert: container is locked by a downstream export",
        )

    old_status = container.status
    container.status = prev_status
    # Clear timestamps for the reverted status
    if old_status == "sealed":
        container.seal_number = None
        container.sealed_at = None
        container.sealed_by = None
    elif old_status == "dispatched":
        container.dispatched_at = None
    elif old_status == "arrived":
        container.arrived_at = None
    container.updated_at = datetime.utcnow()
    await db.flush()

    await log_activity(
        db, user, action="status_change", entity_type="container",
        entity_id=container.id, entity_code=container.container_number,
        summary=f"Reverted {container.container_number} from '{old_status}' to '{prev_status}'",
    )
    return _container_summary(container)
