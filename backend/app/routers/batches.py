"""Batch router — GRN intake and batch management.

Endpoints:
    POST /api/batches/grn           Create batch via GRN intake
    GET  /api/batches/              List batches (with filters)
    GET  /api/batches/{batch_id}    Single batch detail
    PATCH /api/batches/{batch_id}   Update batch fields
"""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import require_onboarded, require_permission
from app.database import get_tenant_db
from app.models.public.user import User
from app.models.tenant.batch import Batch
from app.schemas.batch import (
    BatchOut,
    BatchSummary,
    BatchUpdate,
    GRNRequest,
    GRNResponse,
)
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

@router.get("/", response_model=list[BatchSummary])
async def list_batches(
    grower_id: str | None = Query(None),
    batch_status: str | None = Query(None, alias="status"),
    fruit_type: str | None = Query(None),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_tenant_db),
    _user: User = Depends(require_permission("batch.read")),
    _onboarded: User = Depends(require_onboarded),
):
    stmt = select(Batch).where(Batch.is_deleted == False)  # noqa: E712

    if grower_id:
        stmt = stmt.where(Batch.grower_id == grower_id)
    if batch_status:
        stmt = stmt.where(Batch.status == batch_status)
    if fruit_type:
        stmt = stmt.where(Batch.fruit_type == fruit_type)

    stmt = stmt.order_by(Batch.created_at.desc()).limit(limit).offset(offset)
    result = await db.execute(stmt)
    return result.scalars().all()


# ── Single batch detail ──────────────────────────────────────

@router.get("/{batch_id}", response_model=BatchOut)
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

    # Recompute net weight if gross or tare changed
    if body.gross_weight_kg is not None or body.tare_weight_kg is not None:
        batch.net_weight_kg = batch.gross_weight_kg - batch.tare_weight_kg

    await db.flush()
    return batch
