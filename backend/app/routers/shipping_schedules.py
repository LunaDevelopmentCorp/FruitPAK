"""Shipping schedule management router.

Endpoints:
    POST   /api/shipping-schedules/                Create schedule
    GET    /api/shipping-schedules/                List (with filters)
    GET    /api/shipping-schedules/{id}            Detail
    PATCH  /api/shipping-schedules/{id}            Update
    DELETE /api/shipping-schedules/{id}            Soft-delete
"""

import uuid
from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import require_onboarded, require_permission
from app.database import get_tenant_db
from app.models.public.user import User
from app.models.tenant.shipping_schedule import ShippingSchedule
from app.schemas.common import PaginatedResponse
from app.schemas.shipping_schedule import (
    ShippingScheduleCreate,
    ShippingScheduleDetail,
    ShippingScheduleSummary,
    ShippingScheduleUpdate,
)
from app.utils.activity import log_activity

router = APIRouter()


# ── POST /api/shipping-schedules/ ────────────────────────────

@router.post("/", response_model=ShippingScheduleSummary, status_code=201)
async def create_shipping_schedule(
    body: ShippingScheduleCreate,
    db: AsyncSession = Depends(get_tenant_db),
    user: User = Depends(require_permission("export.write")),
):
    """Create a new shipping schedule entry."""
    schedule = ShippingSchedule(
        id=str(uuid.uuid4()),
        shipping_line=body.shipping_line,
        vessel_name=body.vessel_name,
        voyage_number=body.voyage_number,
        port_of_loading=body.port_of_loading,
        port_of_discharge=body.port_of_discharge,
        etd=body.etd,
        eta=body.eta,
        booking_cutoff=body.booking_cutoff,
        cargo_cutoff=body.cargo_cutoff,
        status=body.status,
        source="manual",
        notes=body.notes,
    )
    db.add(schedule)
    await db.flush()

    await log_activity(
        db, user,
        action="created",
        entity_type="shipping_schedule",
        entity_id=schedule.id,
        entity_code=f"{schedule.vessel_name} {schedule.voyage_number}",
        summary=(
            f"Created shipping schedule: {schedule.vessel_name} V.{schedule.voyage_number} "
            f"({schedule.port_of_loading} → {schedule.port_of_discharge})"
        ),
    )

    return ShippingScheduleSummary.model_validate(schedule)


# ── GET /api/shipping-schedules/ ─────────────────────────────

@router.get("/", response_model=PaginatedResponse[ShippingScheduleSummary])
async def list_shipping_schedules(
    shipping_line: str | None = None,
    port_of_loading: str | None = None,
    port_of_discharge: str | None = None,
    status: str | None = None,
    etd_from: date | None = None,
    etd_to: date | None = None,
    limit: int = Query(50, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_tenant_db),
    _user: User = Depends(require_permission("export.read")),
    _onboarded: User = Depends(require_onboarded),
):
    """List shipping schedules with optional filters, sorted by ETD ascending."""
    base = select(ShippingSchedule).where(
        ShippingSchedule.is_deleted == False  # noqa: E712
    )

    if shipping_line:
        base = base.where(ShippingSchedule.shipping_line.ilike(f"%{shipping_line}%"))
    if port_of_loading:
        base = base.where(ShippingSchedule.port_of_loading.ilike(f"%{port_of_loading}%"))
    if port_of_discharge:
        base = base.where(ShippingSchedule.port_of_discharge.ilike(f"%{port_of_discharge}%"))
    if status:
        base = base.where(ShippingSchedule.status == status)
    if etd_from:
        base = base.where(ShippingSchedule.etd >= etd_from)
    if etd_to:
        base = base.where(ShippingSchedule.etd <= etd_to)

    count_result = await db.execute(
        select(func.count()).select_from(base.subquery())
    )
    total = count_result.scalar() or 0

    items_result = await db.execute(
        base.order_by(ShippingSchedule.etd.asc()).limit(limit).offset(offset)
    )
    items = items_result.scalars().all()

    return PaginatedResponse(
        items=[ShippingScheduleSummary.model_validate(s) for s in items],
        total=total,
        limit=limit,
        offset=offset,
    )


# ── GET /api/shipping-schedules/{id} ─────────────────────────

@router.get("/{schedule_id}", response_model=ShippingScheduleDetail)
async def get_shipping_schedule(
    schedule_id: str,
    db: AsyncSession = Depends(get_tenant_db),
    _user: User = Depends(require_permission("export.read")),
    _onboarded: User = Depends(require_onboarded),
):
    """Get a single shipping schedule by ID."""
    result = await db.execute(
        select(ShippingSchedule).where(
            ShippingSchedule.id == schedule_id,
            ShippingSchedule.is_deleted == False,  # noqa: E712
        )
    )
    schedule = result.scalar_one_or_none()
    if not schedule:
        raise HTTPException(status_code=404, detail="Shipping schedule not found")
    return ShippingScheduleDetail.model_validate(schedule)


# ── PATCH /api/shipping-schedules/{id} ───────────────────────

@router.patch("/{schedule_id}", response_model=ShippingScheduleSummary)
async def update_shipping_schedule(
    schedule_id: str,
    body: ShippingScheduleUpdate,
    db: AsyncSession = Depends(get_tenant_db),
    user: User = Depends(require_permission("export.write")),
):
    """Update a shipping schedule (partial update)."""
    result = await db.execute(
        select(ShippingSchedule).where(
            ShippingSchedule.id == schedule_id,
            ShippingSchedule.is_deleted == False,  # noqa: E712
        )
    )
    schedule = result.scalar_one_or_none()
    if not schedule:
        raise HTTPException(status_code=404, detail="Shipping schedule not found")

    updates = body.model_dump(exclude_unset=True)
    for field, value in updates.items():
        if hasattr(schedule, field):
            setattr(schedule, field, value)

    schedule.updated_at = datetime.utcnow()
    await db.flush()

    await log_activity(
        db, user,
        action="updated",
        entity_type="shipping_schedule",
        entity_id=schedule.id,
        entity_code=f"{schedule.vessel_name} {schedule.voyage_number}",
        summary=f"Updated shipping schedule: {schedule.vessel_name} V.{schedule.voyage_number}",
    )

    return ShippingScheduleSummary.model_validate(schedule)


# ── DELETE /api/shipping-schedules/{id} ──────────────────────

@router.delete("/{schedule_id}", status_code=204)
async def delete_shipping_schedule(
    schedule_id: str,
    db: AsyncSession = Depends(get_tenant_db),
    user: User = Depends(require_permission("export.write")),
):
    """Soft-delete a shipping schedule."""
    result = await db.execute(
        select(ShippingSchedule).where(
            ShippingSchedule.id == schedule_id,
            ShippingSchedule.is_deleted == False,  # noqa: E712
        )
    )
    schedule = result.scalar_one_or_none()
    if not schedule:
        raise HTTPException(status_code=404, detail="Shipping schedule not found")

    schedule.is_deleted = True
    schedule.updated_at = datetime.utcnow()
    await db.flush()

    await log_activity(
        db, user,
        action="deleted",
        entity_type="shipping_schedule",
        entity_id=schedule.id,
        entity_code=f"{schedule.vessel_name} {schedule.voyage_number}",
        summary=f"Deleted shipping schedule: {schedule.vessel_name} V.{schedule.voyage_number}",
    )
