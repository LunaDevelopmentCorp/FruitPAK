"""Container management router.

Endpoints:
    POST  /api/containers/from-pallets      Create container and assign pallets
    GET   /api/containers/                   List containers (with filters)
    GET   /api/containers/{container_id}     Detail with pallets + traceability
    GET   /api/containers/{container_id}/qr  QR code SVG for container
"""

import io
import json
import uuid
from datetime import date, datetime

import segno
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth.deps import require_onboarded, require_permission
from app.database import get_tenant_db
from app.models.public.user import User
from app.models.tenant.container import Container
from app.models.tenant.pallet import Pallet, PalletLot
from app.schemas.common import PaginatedResponse
from app.schemas.container import (
    ContainerDetail,
    ContainerFromPalletsRequest,
    ContainerPalletOut,
    ContainerSummary,
    TraceBatch,
    TraceLot,
    TracePallet,
)

router = APIRouter()


# ── Helpers ──────────────────────────────────────────────────

def _generate_container_number(index: int) -> str:
    today = date.today().strftime("%Y%m%d")
    return f"CONT-{today}-{index:03d}"


async def _next_container_index(db: AsyncSession) -> int:
    today_prefix = f"CONT-{date.today().strftime('%Y%m%d')}-"
    result = await db.execute(
        select(func.count()).where(
            Container.container_number.like(f"{today_prefix}%"),
            Container.is_deleted == False,  # noqa: E712
        )
    )
    return (result.scalar() or 0) + 1


# ── POST /api/containers/from-pallets ────────────────────────

@router.post("/from-pallets", response_model=ContainerSummary, status_code=201)
async def create_container_from_pallets(
    body: ContainerFromPalletsRequest,
    db: AsyncSession = Depends(get_tenant_db),
    user: User = Depends(require_permission("batch.write")),
):
    """Create a container and assign pallets to it."""
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

    # Check pallets aren't already in a container
    already_loaded = [p.pallet_number for p in pallets if p.container_id]
    if already_loaded:
        raise HTTPException(
            status_code=422,
            detail=f"Already in a container: {', '.join(already_loaded[:3])}",
        )

    # Create container
    idx = await _next_container_index(db)
    total_cartons = sum(p.current_boxes for p in pallets)
    total_weight = sum(p.gross_weight_kg or p.net_weight_kg or 0.0 for p in pallets)

    container = Container(
        id=str(uuid.uuid4()),
        container_number=_generate_container_number(idx),
        container_type=body.container_type,
        capacity_pallets=body.capacity_pallets,
        customer_name=body.customer_name,
        destination=body.destination,
        export_date=body.export_date,
        seal_number=body.seal_number,
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
    return ContainerSummary.model_validate(container)


# ── GET /api/containers/ ─────────────────────────────────────

@router.get("/", response_model=PaginatedResponse[ContainerSummary])
async def list_containers(
    status: str | None = None,
    customer: str | None = None,
    limit: int = Query(50, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_tenant_db),
    _user: User = Depends(require_permission("batch.read")),
    _onboarded: User = Depends(require_onboarded),
):
    base = select(Container).where(Container.is_deleted == False)  # noqa: E712
    if status:
        base = base.where(Container.status == status)
    if customer:
        base = base.where(Container.customer_name.ilike(f"%{customer}%"))

    count_result = await db.execute(
        select(func.count()).select_from(base.subquery())
    )
    total = count_result.scalar() or 0

    items_result = await db.execute(
        base.order_by(Container.created_at.desc()).limit(limit).offset(offset)
    )
    items = items_result.scalars().all()

    return PaginatedResponse(
        items=[ContainerSummary.model_validate(c) for c in items],
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
):
    result = await db.execute(
        select(Container)
        .where(Container.id == container_id, Container.is_deleted == False)  # noqa: E712
        .options(
            selectinload(Container.pallets)
            .selectinload(Pallet.pallet_lots)
            .selectinload(PalletLot.lot),
        )
    )
    container = result.scalar_one_or_none()
    if not container:
        raise HTTPException(status_code=404, detail="Container not found")

    detail = ContainerDetail.model_validate(container)

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
                ))
                # Walk up to batch → grower
                batch = pl.lot.batch if hasattr(pl.lot, "batch") and pl.lot.batch else None
                if batch and batch.id not in seen_batches:
                    seen_batches.add(batch.id)
                    grower = batch.grower if hasattr(batch, "grower") and batch.grower else None
                    tp.batches.append(TraceBatch(
                        batch_code=batch.batch_code,
                        grower_name=grower.name if grower else None,
                        fruit_type=batch.fruit_type,
                        intake_date=batch.intake_date.isoformat() if batch.intake_date else None,
                    ))
        trace_pallets.append(tp)

    detail.traceability = trace_pallets
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
