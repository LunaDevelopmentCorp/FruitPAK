"""Grower and harvest team payment recording.

Endpoints:
    POST /api/payments/grower         Record a grower payment
    GET  /api/payments/grower         List grower payments
    POST /api/payments/team           Record a harvest team payment/advance
    GET  /api/payments/team           List team payments
    GET  /api/payments/team/summary   Team-level reconciliation summary
"""

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import case, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import require_onboarded, require_permission
from app.database import get_tenant_db
from app.models.public.user import User
from app.models.tenant.batch import Batch
from app.models.tenant.grower import Grower
from app.models.tenant.grower_payment import GrowerPayment
from app.models.tenant.harvest_team import HarvestTeam
from app.models.tenant.harvest_team_payment import HarvestTeamPayment
from app.schemas.common import PaginatedResponse
from app.schemas.payment import (
    GrowerPaymentCreate,
    GrowerPaymentOut,
    TeamPaymentCreate,
    TeamPaymentOut,
    TeamSummary,
)
from app.services.reconciliation import run_full_reconciliation
from app.utils.activity import log_activity

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

    await log_activity(
        db, user,
        action="created",
        entity_type="payment",
        entity_id=str(payment.id),
        entity_code=payment.payment_ref,
        summary=f"Recorded {payment.currency} {payment.gross_amount:.2f} payment ({payment.payment_ref}) to {grower.name}",
        details={"grower_id": grower.id, "amount": float(payment.gross_amount)},
    )

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


# ══════════════════════════════════════════════════════════════
# Harvest Teams (listing for payment forms)
# ══════════════════════════════════════════════════════════════


class HarvestTeamItem(BaseModel):
    id: str
    name: str
    team_leader: str | None
    team_size: int | None

    model_config = {"from_attributes": True}


@router.get("/harvest-teams", response_model=list[HarvestTeamItem])
async def list_harvest_teams(
    db: AsyncSession = Depends(get_tenant_db),
    _user: User = Depends(require_onboarded),
):
    """List all harvest teams (for payment form dropdowns)."""
    result = await db.execute(select(HarvestTeam).order_by(HarvestTeam.name))
    return [HarvestTeamItem.model_validate(t) for t in result.scalars().all()]


# ══════════════════════════════════════════════════════════════
# Harvest Team Payments
# ══════════════════════════════════════════════════════════════


async def _generate_team_payment_ref(db: AsyncSession) -> str:
    """Generate HTP-YYYYMMDD-NNN where NNN resets daily."""
    today = datetime.utcnow().strftime("%Y%m%d")
    prefix = f"HTP-{today}-"
    result = await db.execute(
        select(func.count(HarvestTeamPayment.id)).where(
            HarvestTeamPayment.payment_ref.like(f"{prefix}%")
        )
    )
    count = result.scalar() or 0
    return f"{prefix}{count + 1:03d}"


# ── POST /api/payments/team ──────────────────────────────────

@router.post("/team", response_model=TeamPaymentOut, status_code=status.HTTP_201_CREATED)
async def create_team_payment(
    body: TeamPaymentCreate,
    db: AsyncSession = Depends(get_tenant_db),
    user: User = Depends(require_permission("financials.write")),
    _onboarded: User = Depends(require_onboarded),
):
    """Record a payment or advance to a harvest team."""

    # Validate team exists
    result = await db.execute(
        select(HarvestTeam).where(HarvestTeam.id == body.harvest_team_id)
    )
    team = result.scalar_one_or_none()
    if not team:
        raise HTTPException(status_code=404, detail="Harvest team not found")

    # Resolve batch IDs
    batch_ids = body.batch_ids
    if batch_ids:
        result = await db.execute(
            select(Batch).where(
                Batch.id.in_(batch_ids),
                Batch.harvest_team_id == body.harvest_team_id,
                Batch.is_deleted == False,  # noqa: E712
            )
        )
        found = result.scalars().all()
        found_ids = {b.id for b in found}
        missing = set(batch_ids) - found_ids
        if missing:
            raise HTTPException(
                status_code=422,
                detail=f"Batches not found or don't belong to this team: {', '.join(list(missing)[:3])}",
            )
        batches = found
    else:
        # Auto-cover all non-rejected batches for this team
        result = await db.execute(
            select(Batch).where(
                Batch.harvest_team_id == body.harvest_team_id,
                Batch.is_deleted == False,  # noqa: E712
                Batch.status != "rejected",
            )
        )
        batches = result.scalars().all()
        batch_ids = [b.id for b in batches]

    total_kg = sum(
        (b.net_weight_kg if b.net_weight_kg is not None else b.gross_weight_kg) or 0
        for b in batches
    )
    total_bins = sum(b.bin_count or 0 for b in batches)

    payment_ref = await _generate_team_payment_ref(db)

    payment = HarvestTeamPayment(
        payment_ref=payment_ref,
        harvest_team_id=body.harvest_team_id,
        batch_ids=batch_ids,
        currency=body.currency,
        amount=body.amount,
        total_kg=total_kg if total_kg > 0 else None,
        total_bins=total_bins if total_bins > 0 else None,
        payment_type=body.payment_type,
        payment_date=body.payment_date,
        status="paid",
        notes=body.notes,
    )
    db.add(payment)
    await db.flush()

    await log_activity(
        db, user,
        action="created",
        entity_type="team_payment",
        entity_id=str(payment.id),
        entity_code=payment.payment_ref,
        summary=f"Recorded {payment.currency} {payment.amount:.2f} {payment.payment_type} ({payment.payment_ref}) to {team.name}",
        details={"team_id": team.id, "amount": float(payment.amount)},
    )

    return TeamPaymentOut(
        id=payment.id,
        payment_ref=payment.payment_ref,
        harvest_team_id=payment.harvest_team_id,
        team_name=team.name,
        team_leader=team.team_leader,
        batch_ids=payment.batch_ids or [],
        currency=payment.currency,
        amount=payment.amount,
        total_kg=payment.total_kg,
        total_bins=payment.total_bins,
        payment_type=payment.payment_type,
        payment_date=payment.payment_date,
        status=payment.status,
        notes=payment.notes,
        created_at=payment.created_at,
    )


# ── GET /api/payments/team ───────────────────────────────────

@router.get("/team", response_model=PaginatedResponse[TeamPaymentOut])
async def list_team_payments(
    harvest_team_id: str | None = Query(None),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_tenant_db),
    _user: User = Depends(require_permission("financials.read")),
    _onboarded: User = Depends(require_onboarded),
):
    """List harvest team payments, optionally filtered by team."""
    base = select(HarvestTeamPayment).where(
        HarvestTeamPayment.is_deleted == False  # noqa: E712
    )
    if harvest_team_id:
        base = base.where(HarvestTeamPayment.harvest_team_id == harvest_team_id)

    count_stmt = select(func.count()).select_from(base.subquery())
    total = await db.scalar(count_stmt) or 0

    items_stmt = base.order_by(HarvestTeamPayment.created_at.desc()).limit(limit).offset(offset)
    result = await db.execute(items_stmt)
    payments = result.scalars().all()

    items = [
        TeamPaymentOut(
            id=p.id,
            payment_ref=p.payment_ref,
            harvest_team_id=p.harvest_team_id,
            team_name=p.harvest_team.name if p.harvest_team else None,
            team_leader=p.harvest_team.team_leader if p.harvest_team else None,
            batch_ids=p.batch_ids or [],
            currency=p.currency,
            amount=p.amount,
            total_kg=p.total_kg,
            total_bins=p.total_bins,
            payment_type=p.payment_type,
            payment_date=p.payment_date,
            status=p.status,
            notes=p.notes,
            created_at=p.created_at,
        )
        for p in payments
    ]

    return PaginatedResponse(items=items, total=total, limit=limit, offset=offset)


# ── GET /api/payments/team/summary ───────────────────────────

@router.get("/team/summary", response_model=list[TeamSummary])
async def team_payment_summary(
    db: AsyncSession = Depends(get_tenant_db),
    _user: User = Depends(require_permission("financials.read")),
    _onboarded: User = Depends(require_onboarded),
):
    """Per-team reconciliation: batches delivered vs payments made."""

    # Get all harvest teams
    result = await db.execute(select(HarvestTeam))
    teams = result.scalars().all()

    summaries: list[TeamSummary] = []

    for team in teams:
        # Batches for this team
        batch_result = await db.execute(
            select(Batch).where(
                Batch.harvest_team_id == team.id,
                Batch.is_deleted == False,  # noqa: E712
                Batch.status != "rejected",
            )
        )
        batches = batch_result.scalars().all()
        total_kg = sum(
            (b.net_weight_kg if b.net_weight_kg is not None else b.gross_weight_kg) or 0
            for b in batches
        )
        total_bins = sum(b.bin_count or 0 for b in batches)

        # Payments for this team
        pay_result = await db.execute(
            select(HarvestTeamPayment).where(
                HarvestTeamPayment.harvest_team_id == team.id,
                HarvestTeamPayment.is_deleted == False,  # noqa: E712
                HarvestTeamPayment.status == "paid",
            )
        )
        payments = pay_result.scalars().all()

        total_advances = sum(p.amount for p in payments if p.payment_type == "advance")
        total_finals = sum(p.amount for p in payments if p.payment_type == "final")
        total_paid = total_advances + total_finals

        summaries.append(TeamSummary(
            harvest_team_id=team.id,
            team_name=team.name,
            team_leader=team.team_leader,
            total_batches=len(batches),
            total_kg=round(total_kg, 2),
            total_bins=total_bins,
            total_advances=round(total_advances, 2),
            total_finals=round(total_finals, 2),
            total_paid=round(total_paid, 2),
            balance=round(total_paid, 2),  # No "expected" amount yet — just shows total paid
        ))

    return summaries
