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
from app.schemas.batch import (
    BatchDetailOut,
    BatchOut,
    BatchSummary,
    BatchUpdate,
    GRNRequest,
    GRNResponse,
)
from app.schemas.common import PaginatedResponse
from app.services.grn import create_grn

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

    return GRNResponse(
        batch=BatchOut.model_validate(batch),
        qr_code_url=qr_url,
        advance_payment_linked=result["advance_payment_linked"],
        advance_payment_ref=result["advance_payment_ref"],
    )


# ── List batches ─────────────────────────────────────────────

@router.get("/", response_model=PaginatedResponse[BatchSummary])
async def list_batches(
    grower_id: str | None = Query(None),
    batch_status: str | None = Query(None, alias="status"),
    fruit_type: str | None = Query(None),
    date_from: date | None = Query(None),
    date_to: date | None = Query(None),
    limit: int = Query(50, ge=1, le=500),
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
        items=items,
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
        select(Batch).where(Batch.id == batch_id, Batch.is_deleted == False)  # noqa: E712
    )
    batch = result.scalar_one_or_none()
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")
    return batch


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
    return batch
