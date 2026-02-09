"""Reconciliation router — dashboard data and manual trigger.

Endpoints:
    GET  /                    Dashboard summary + open alerts
    POST /run                 Trigger a reconciliation run (admin only)
    GET  /alerts              List alerts with filters
    GET  /alerts/{alert_id}   Single alert detail
    PATCH /alerts/{alert_id}  Update alert status (acknowledge / resolve / dismiss)

All endpoints are tenant-scoped and require financials.read permission.
Triggering a run requires financials.write.
"""

from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import require_permission
from app.database import get_tenant_db
from app.models.tenant.reconciliation_alert import ReconciliationAlert
from app.models.public.user import User
from app.schemas.reconciliation import (
    AlertOut,
    AlertUpdate,
    DashboardSummary,
    RunSummary,
)
from app.services.reconciliation import run_full_reconciliation

router = APIRouter()


# ── Dashboard summary ────────────────────────────────────────

@router.get("/", response_model=DashboardSummary)
async def get_dashboard(
    db: AsyncSession = Depends(get_tenant_db),
    _user: User = Depends(require_permission("financials.read")),
):
    """Return an aggregated reconciliation dashboard:
    open/acknowledged counts, breakdowns, and the most recent alerts."""

    # Counts by status
    count_q = await db.execute(
        select(
            ReconciliationAlert.status,
            func.count(ReconciliationAlert.id),
        )
        .where(ReconciliationAlert.is_deleted == False)  # noqa: E712
        .group_by(ReconciliationAlert.status)
    )
    status_counts = dict(count_q.all())
    total_open = status_counts.get("open", 0)
    total_ack = status_counts.get("acknowledged", 0)

    # Resolved in last 30 days
    thirty_days_ago = datetime.utcnow() - timedelta(days=30)
    resolved_q = await db.execute(
        select(func.count(ReconciliationAlert.id)).where(
            ReconciliationAlert.is_deleted == False,  # noqa: E712
            ReconciliationAlert.status == "resolved",
            ReconciliationAlert.resolved_at >= thirty_days_ago,
        )
    )
    total_resolved_30d = resolved_q.scalar() or 0

    # Breakdown by type (open + acknowledged only)
    type_q = await db.execute(
        select(
            ReconciliationAlert.alert_type,
            func.count(ReconciliationAlert.id),
        )
        .where(
            ReconciliationAlert.is_deleted == False,  # noqa: E712
            ReconciliationAlert.status.in_(["open", "acknowledged"]),
        )
        .group_by(ReconciliationAlert.alert_type)
    )
    by_type = dict(type_q.all())

    # Breakdown by severity (open + acknowledged only)
    sev_q = await db.execute(
        select(
            ReconciliationAlert.severity,
            func.count(ReconciliationAlert.id),
        )
        .where(
            ReconciliationAlert.is_deleted == False,  # noqa: E712
            ReconciliationAlert.status.in_(["open", "acknowledged"]),
        )
        .group_by(ReconciliationAlert.severity)
    )
    by_severity = dict(sev_q.all())

    # Latest run
    latest_q = await db.execute(
        select(
            ReconciliationAlert.run_id,
            ReconciliationAlert.created_at,
        )
        .where(ReconciliationAlert.is_deleted == False)  # noqa: E712
        .order_by(ReconciliationAlert.created_at.desc())
        .limit(1)
    )
    latest_row = latest_q.first()

    # Most recent open alerts (limit 50 for dashboard)
    alerts_q = await db.execute(
        select(ReconciliationAlert)
        .where(
            ReconciliationAlert.is_deleted == False,  # noqa: E712
            ReconciliationAlert.status.in_(["open", "acknowledged"]),
        )
        .order_by(
            # critical first, then by date
            ReconciliationAlert.severity.asc(),
            ReconciliationAlert.created_at.desc(),
        )
        .limit(50)
    )

    return DashboardSummary(
        total_open=total_open,
        total_acknowledged=total_ack,
        total_resolved_30d=total_resolved_30d,
        by_type=by_type,
        by_severity=by_severity,
        latest_run_id=latest_row.run_id if latest_row else None,
        latest_run_at=latest_row.created_at if latest_row else None,
        alerts=[AlertOut.model_validate(a) for a in alerts_q.scalars().all()],
    )


# ── Trigger a reconciliation run ─────────────────────────────

@router.post("/run", response_model=RunSummary, status_code=status.HTTP_201_CREATED)
async def trigger_run(
    db: AsyncSession = Depends(get_tenant_db),
    _user: User = Depends(require_permission("financials.write")),
):
    """Manually trigger a full reconciliation run.  Returns a summary
    of all mismatches detected.  Previous open alerts that no longer
    appear are auto-resolved."""
    summary = await run_full_reconciliation(db)
    return RunSummary(**summary)


# ── List alerts with filters ─────────────────────────────────

@router.get("/alerts", response_model=list[AlertOut])
async def list_alerts(
    alert_type: str | None = Query(None, description="Filter by alert_type"),
    severity: str | None = Query(None, description="Filter by severity"),
    alert_status: str | None = Query(None, alias="status", description="Filter by status"),
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_tenant_db),
    _user: User = Depends(require_permission("financials.read")),
):
    """List reconciliation alerts with optional filters."""
    stmt = (
        select(ReconciliationAlert)
        .where(ReconciliationAlert.is_deleted == False)  # noqa: E712
    )

    if alert_type:
        stmt = stmt.where(ReconciliationAlert.alert_type == alert_type)
    if severity:
        stmt = stmt.where(ReconciliationAlert.severity == severity)
    if alert_status:
        stmt = stmt.where(ReconciliationAlert.status == alert_status)

    stmt = (
        stmt
        .order_by(ReconciliationAlert.created_at.desc())
        .limit(limit)
        .offset(offset)
    )

    result = await db.execute(stmt)
    return result.scalars().all()


# ── Single alert detail ──────────────────────────────────────

@router.get("/alerts/{alert_id}", response_model=AlertOut)
async def get_alert(
    alert_id: str,
    db: AsyncSession = Depends(get_tenant_db),
    _user: User = Depends(require_permission("financials.read")),
):
    result = await db.execute(
        select(ReconciliationAlert).where(
            ReconciliationAlert.id == alert_id,
            ReconciliationAlert.is_deleted == False,  # noqa: E712
        )
    )
    alert = result.scalar_one_or_none()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")
    return alert


# ── Update alert status ──────────────────────────────────────

@router.patch("/alerts/{alert_id}", response_model=AlertOut)
async def update_alert(
    alert_id: str,
    body: AlertUpdate,
    db: AsyncSession = Depends(get_tenant_db),
    user: User = Depends(require_permission("financials.write")),
):
    """Acknowledge, resolve, or dismiss an alert."""
    valid_statuses = {"acknowledged", "resolved", "dismissed"}
    if body.status not in valid_statuses:
        raise HTTPException(
            status_code=400,
            detail=f"Status must be one of: {', '.join(valid_statuses)}",
        )

    result = await db.execute(
        select(ReconciliationAlert).where(
            ReconciliationAlert.id == alert_id,
            ReconciliationAlert.is_deleted == False,  # noqa: E712
        )
    )
    alert = result.scalar_one_or_none()
    if not alert:
        raise HTTPException(status_code=404, detail="Alert not found")

    alert.status = body.status
    if body.resolution_note:
        alert.resolution_note = body.resolution_note
    if body.status in ("resolved", "dismissed"):
        alert.resolved_at = datetime.utcnow()
        alert.resolved_by = user.id

    await db.flush()
    return alert
