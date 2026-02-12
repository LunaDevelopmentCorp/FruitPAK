"""Grower payment recording — create and list payments.

Endpoints:
    POST /api/payments/grower    Record a grower payment
    GET  /api/payments/grower    List grower payments
"""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import require_onboarded, require_permission
from app.database import get_tenant_db
from app.models.public.user import User
from app.models.tenant.batch import Batch
from app.models.tenant.grower import Grower
from app.models.tenant.grower_payment import GrowerPayment
from app.schemas.common import PaginatedResponse
from app.schemas.payment import GrowerPaymentCreate, GrowerPaymentOut
from app.services.reconciliation import run_full_reconciliation

router = APIRouter()


# ── Helpers ──────────────────────────────────────────────────

async def _generate_payment_ref(db: AsyncSession) -> str:
    """Generate PAY-YYYYMMDD-NNN where NNN resets daily."""
    today = datetime.utcnow().strftime("%Y%m%d")
    prefix = f"PAY-{today}-"
    result = await db.execute(
        select(func.count(GrowerPayment.id)).where(
            GrowerPayment.payment_ref.like(f"{prefix}%")
        )
    )
    count = result.scalar() or 0
    return f"{prefix}{count + 1:03d}"


# ── POST /api/payments/grower ────────────────────────────────

@router.post("/grower", response_model=GrowerPaymentOut, status_code=status.HTTP_201_CREATED)
async def create_grower_payment(
    body: GrowerPaymentCreate,
    db: AsyncSession = Depends(get_tenant_db),
    user: User = Depends(require_permission("financials.write")),
    _onboarded: User = Depends(require_onboarded),
):
    """Record a grower payment and auto-run reconciliation."""

    # Validate grower exists
    result = await db.execute(select(Grower).where(Grower.id == body.grower_id))
    grower = result.scalar_one_or_none()
    if not grower:
        raise HTTPException(status_code=404, detail="Grower not found")

    # Resolve batch IDs
    batch_ids = body.batch_ids
    if batch_ids:
        # Validate all batch_ids belong to this grower
        result = await db.execute(
            select(Batch).where(
                Batch.id.in_(batch_ids),
                Batch.grower_id == body.grower_id,
                Batch.is_deleted == False,  # noqa: E712
            )
        )
        found = result.scalars().all()
        found_ids = {b.id for b in found}
        missing = set(batch_ids) - found_ids
        if missing:
            raise HTTPException(
                status_code=422,
                detail=f"Batches not found or don't belong to this grower: {', '.join(missing)}",
            )
        batches = found
    else:
        # Cover all non-rejected batches for this grower
        result = await db.execute(
            select(Batch).where(
                Batch.grower_id == body.grower_id,
                Batch.is_deleted == False,  # noqa: E712
                Batch.status != "rejected",
            )
        )
        batches = result.scalars().all()
        batch_ids = [b.id for b in batches]

    # Compute total_kg from selected batches
    total_kg = sum(
        (b.net_weight_kg if b.net_weight_kg is not None else b.gross_weight_kg) or 0
        for b in batches
    )

    # Generate payment reference
    payment_ref = await _generate_payment_ref(db)

    # Create payment record — status="paid" for MVP (no approval workflow)
    payment = GrowerPayment(
        payment_ref=payment_ref,
        grower_id=body.grower_id,
        batch_ids=batch_ids,
        currency=body.currency,
        gross_amount=body.amount,
        net_amount=body.amount,  # No deductions in MVP
        total_deductions=0.0,
        total_kg=total_kg if total_kg > 0 else None,
        rate_per_kg=(body.amount / total_kg) if total_kg > 0 else None,
        payment_type=body.payment_type,
        paid_date=body.payment_date,
        status="paid",
        notes=body.notes,
    )
    db.add(payment)
    await db.flush()

    # Auto-run reconciliation to resolve GRN-vs-payment alerts
    await run_full_reconciliation(db)

    return GrowerPaymentOut(
        id=payment.id,
        payment_ref=payment.payment_ref,
        grower_id=payment.grower_id,
        grower_name=grower.name,
        batch_ids=payment.batch_ids,
        currency=payment.currency,
        gross_amount=payment.gross_amount,
        net_amount=payment.net_amount,
        total_kg=payment.total_kg,
        payment_type=payment.payment_type,
        paid_date=payment.paid_date,
        status=payment.status,
        notes=payment.notes,
        created_at=payment.created_at,
    )


# ── GET /api/payments/grower ─────────────────────────────────

@router.get("/grower", response_model=PaginatedResponse[GrowerPaymentOut])
async def list_grower_payments(
    grower_id: str | None = Query(None),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_tenant_db),
    _user: User = Depends(require_permission("financials.read")),
    _onboarded: User = Depends(require_onboarded),
):
    """List grower payments, optionally filtered by grower_id."""
    # Build base query
    base_stmt = select(GrowerPayment).where(GrowerPayment.is_deleted == False)  # noqa: E712
    if grower_id:
        base_stmt = base_stmt.where(GrowerPayment.grower_id == grower_id)

    # Count total matching records
    count_stmt = select(func.count()).select_from(base_stmt.subquery())
    total = await db.scalar(count_stmt) or 0

    # Get paginated items
    items_stmt = base_stmt.order_by(GrowerPayment.created_at.desc()).limit(limit).offset(offset)
    result = await db.execute(items_stmt)
    payments = result.scalars().all()

    items = [
        GrowerPaymentOut(
            id=p.id,
            payment_ref=p.payment_ref,
            grower_id=p.grower_id,
            grower_name=p.grower.name if p.grower else None,
            batch_ids=p.batch_ids or [],
            currency=p.currency,
            gross_amount=p.gross_amount,
            net_amount=p.net_amount,
            total_kg=p.total_kg,
            payment_type=p.payment_type,
            paid_date=p.paid_date,
            status=p.status,
            notes=p.notes,
            created_at=p.created_at,
        )
        for p in payments
    ]

    return PaginatedResponse(
        items=items,
        total=total,
        limit=limit,
        offset=offset,
    )
