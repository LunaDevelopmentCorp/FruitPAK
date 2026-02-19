"""Admin-only router for system administration.

Endpoints:
    GET    /api/admin/overview                                     System overview metrics
    GET    /api/admin/activity                                     Activity log
    GET    /api/admin/users                                        List enterprise users
    PATCH  /api/admin/users/{user_id}                              Update user
    POST   /api/admin/users/{user_id}/deactivate                   Deactivate user
    POST   /api/admin/users/{user_id}/activate                     Reactivate user
    GET    /api/admin/deleted-items                                 List deleted items
    POST   /api/admin/deleted-items/{item_type}/{item_id}/restore   Restore a deleted item
    DELETE /api/admin/deleted-items/{item_type}/{item_id}/purge     Permanently delete
"""

from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import delete as sa_delete, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth.deps import require_onboarded, require_role
from app.auth.revocation import TokenRevocation
from app.database import get_db, get_tenant_db
from app.models.public.user import User, UserRole
from app.models.tenant.activity_log import ActivityLog
from app.models.tenant.batch import Batch
from app.models.tenant.batch_history import BatchHistory
from app.models.tenant.container import Container
from app.models.tenant.lot import Lot
from app.models.tenant.pallet import Pallet, PalletLot
from app.models.tenant.reconciliation_alert import ReconciliationAlert
from app.schemas.admin import (
    ActivityEntry,
    ActivityListResponse,
    AdminOverview,
    PipelineCounts,
    StaleItem,
    UserSummary,
    UserUpdate,
)
from app.schemas.deleted_items import (
    DeletedItemSummary,
    DeletedItemsResponse,
    PurgeResult,
    RestoreResult,
)
from app.utils.activity import log_activity
from app.utils.cache import invalidate_cache

router = APIRouter()

VALID_TYPES = {"batch", "lot", "pallet", "container"}
VALID_ROLES = {"administrator", "supervisor", "operator"}


def _validate_item_type(item_type: str) -> None:
    if item_type not in VALID_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid item_type '{item_type}'. Must be one of: {', '.join(sorted(VALID_TYPES))}",
        )


# ── Helpers: build summary labels ────────────────────────────

def _batch_summary(b: Batch) -> DeletedItemSummary:
    grower_name = b.grower.name if b.grower else "Unknown grower"
    lot_count = len([l for l in (b.lots or []) if l.is_deleted])
    label = f"{b.fruit_type or '?'} · {grower_name}"
    if lot_count:
        label += f" · {lot_count} lot(s)"
    return DeletedItemSummary(
        id=b.id,
        item_type="batch",
        code=b.batch_code,
        label=label,
        status=b.status,
        deleted_at=b.updated_at,
        created_at=b.created_at,
    )


def _lot_summary(lot: Lot) -> DeletedItemSummary:
    batch_code = lot.batch.batch_code if lot.batch else "?"
    label = f"Grade {lot.grade or '?'} · {batch_code}"
    if lot.carton_count:
        label += f" · {lot.carton_count} cartons"
    return DeletedItemSummary(
        id=lot.id,
        item_type="lot",
        code=lot.lot_code,
        label=label,
        status=lot.status,
        deleted_at=lot.updated_at,
        created_at=lot.created_at,
    )


def _pallet_summary(p: Pallet) -> DeletedItemSummary:
    parts = []
    if p.fruit_type:
        parts.append(p.fruit_type)
    if p.pallet_type_name:
        parts.append(p.pallet_type_name)
    parts.append(f"{p.current_boxes}/{p.capacity_boxes} boxes")
    return DeletedItemSummary(
        id=p.id,
        item_type="pallet",
        code=p.pallet_number,
        label=" · ".join(parts),
        status=p.status,
        deleted_at=p.updated_at,
        created_at=p.created_at,
    )


def _container_summary(c: Container) -> DeletedItemSummary:
    parts = [c.container_type or "?"]
    if c.customer_name:
        parts.append(c.customer_name)
    if c.destination:
        parts.append(c.destination)
    return DeletedItemSummary(
        id=c.id,
        item_type="container",
        code=c.container_number,
        label=" · ".join(parts),
        status=c.status,
        deleted_at=c.updated_at,
        created_at=c.created_at,
    )


# ══════════════════════════════════════════════════════════════
# OVERVIEW
# ══════════════════════════════════════════════════════════════

async def _pipeline_counts(db: AsyncSession, model, status_col) -> list[PipelineCounts]:
    """Count active (non-deleted) items grouped by status."""
    result = await db.execute(
        select(status_col, func.count())
        .where(model.is_deleted == False)  # noqa: E712
        .group_by(status_col)
    )
    return [PipelineCounts(status=row[0] or "unknown", count=row[1]) for row in result.all()]


async def _stale_items(db: AsyncSession, now: datetime) -> list[StaleItem]:
    """Find items that haven't progressed as expected."""
    stale: list[StaleItem] = []

    # Batches stuck in "received" > 3 days
    cutoff_3d = now - timedelta(days=3)
    result = await db.execute(
        select(Batch.id, Batch.batch_code, Batch.status, Batch.created_at)
        .where(
            Batch.is_deleted == False,  # noqa: E712
            Batch.status == "received",
            Batch.created_at < cutoff_3d,
        )
        .limit(20)
    )
    for row in result.all():
        age = (now - row[3]).total_seconds() / 3600
        stale.append(StaleItem(id=row[0], code=row[1], entity_type="batch", status=row[2], age_hours=round(age, 1)))

    # Open pallets > 2 days
    cutoff_2d = now - timedelta(days=2)
    result = await db.execute(
        select(Pallet.id, Pallet.pallet_number, Pallet.status, Pallet.created_at)
        .where(
            Pallet.is_deleted == False,  # noqa: E712
            Pallet.status == "open",
            Pallet.created_at < cutoff_2d,
        )
        .limit(20)
    )
    for row in result.all():
        age = (now - row[3]).total_seconds() / 3600
        stale.append(StaleItem(id=row[0], code=row[1], entity_type="pallet", status=row[2], age_hours=round(age, 1)))

    # Containers in "loading" > 1 day
    cutoff_1d = now - timedelta(days=1)
    result = await db.execute(
        select(Container.id, Container.container_number, Container.status, Container.created_at)
        .where(
            Container.is_deleted == False,  # noqa: E712
            Container.status == "loading",
            Container.created_at < cutoff_1d,
        )
        .limit(20)
    )
    for row in result.all():
        age = (now - row[3]).total_seconds() / 3600
        stale.append(StaleItem(id=row[0], code=row[1], entity_type="container", status=row[2], age_hours=round(age, 1)))

    return stale


@router.get("/overview", response_model=AdminOverview)
async def get_admin_overview(
    db: AsyncSession = Depends(get_tenant_db),
    public_db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role(UserRole.ADMINISTRATOR)),
    _onboarded: User = Depends(require_onboarded),
):
    """System overview dashboard for administrators."""
    now = datetime.utcnow()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_start = today_start - timedelta(days=today_start.weekday())

    # Pipeline counts
    batch_pipeline = await _pipeline_counts(db, Batch, Batch.status)
    lot_pipeline = await _pipeline_counts(db, Lot, Lot.status)
    pallet_pipeline = await _pipeline_counts(db, Pallet, Pallet.status)
    container_pipeline = await _pipeline_counts(db, Container, Container.status)

    # Today's throughput
    today_batches_r = await db.execute(
        select(func.count()).select_from(Batch).where(
            Batch.is_deleted == False, Batch.created_at >= today_start  # noqa: E712
        )
    )
    today_batches = today_batches_r.scalar() or 0

    today_pallets_r = await db.execute(
        select(func.count()).select_from(Pallet).where(
            Pallet.is_deleted == False, Pallet.created_at >= today_start  # noqa: E712
        )
    )
    today_pallets = today_pallets_r.scalar() or 0

    today_containers_r = await db.execute(
        select(func.count()).select_from(Container).where(
            Container.is_deleted == False, Container.created_at >= today_start  # noqa: E712
        )
    )
    today_containers = today_containers_r.scalar() or 0

    # Waste
    waste_today_r = await db.execute(
        select(func.coalesce(func.sum(Batch.waste_kg), 0)).where(
            Batch.is_deleted == False, Batch.created_at >= today_start  # noqa: E712
        )
    )
    waste_kg_today = float(waste_today_r.scalar() or 0)

    waste_week_r = await db.execute(
        select(func.coalesce(func.sum(Batch.waste_kg), 0)).where(
            Batch.is_deleted == False, Batch.created_at >= week_start  # noqa: E712
        )
    )
    waste_kg_week = float(waste_week_r.scalar() or 0)

    # Unpalletized boxes
    unpal_r = await db.execute(
        select(func.coalesce(func.sum(Lot.carton_count), 0))
        .where(Lot.is_deleted == False)  # noqa: E712
    )
    total_cartons = int(unpal_r.scalar() or 0)

    palletized_r = await db.execute(
        select(func.coalesce(func.sum(PalletLot.box_count), 0))
        .where(PalletLot.is_deleted == False)  # noqa: E712
    )
    palletized_boxes = int(palletized_r.scalar() or 0)
    unpalletized_boxes = max(0, total_cartons - palletized_boxes)

    # Stale items
    stale_items = await _stale_items(db, now)

    # Reconciliation alerts
    alerts_r = await db.execute(
        select(
            func.count().filter(ReconciliationAlert.status.in_(["open", "acknowledged"])),
            func.count().filter(
                ReconciliationAlert.status.in_(["open", "acknowledged"]),
                ReconciliationAlert.severity == "critical",
            ),
        ).where(ReconciliationAlert.is_deleted == False)  # noqa: E712
    )
    alert_row = alerts_r.one()
    open_alerts = alert_row[0] or 0
    critical_alerts = alert_row[1] or 0

    # Active users (public schema)
    users_r = await public_db.execute(
        select(func.count()).select_from(User).where(
            User.enterprise_id == user.enterprise_id,
            User.is_active == True,  # noqa: E712
        )
    )
    active_users = users_r.scalar() or 0

    # Recent activity
    activity_r = await db.execute(
        select(ActivityLog)
        .order_by(ActivityLog.created_at.desc())
        .limit(20)
    )
    recent_activity = [
        ActivityEntry.model_validate(a) for a in activity_r.scalars().all()
    ]

    return AdminOverview(
        batch_pipeline=batch_pipeline,
        lot_pipeline=lot_pipeline,
        pallet_pipeline=pallet_pipeline,
        container_pipeline=container_pipeline,
        today_batches=today_batches,
        today_pallets=today_pallets,
        today_containers=today_containers,
        waste_kg_today=waste_kg_today,
        waste_kg_week=waste_kg_week,
        unpalletized_boxes=unpalletized_boxes,
        stale_items=stale_items,
        open_alerts=open_alerts,
        critical_alerts=critical_alerts,
        active_users=active_users,
        recent_activity=recent_activity,
    )


# ══════════════════════════════════════════════════════════════
# ACTIVITY LOG
# ══════════════════════════════════════════════════════════════

@router.get("/activity", response_model=ActivityListResponse)
async def list_activity(
    entity_type: str | None = Query(None),
    action: str | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_tenant_db),
    _user: User = Depends(require_role(UserRole.ADMINISTRATOR)),
    _onboarded: User = Depends(require_onboarded),
):
    """List activity log entries with optional filters."""
    query = select(ActivityLog)
    count_query = select(func.count()).select_from(ActivityLog)

    if entity_type:
        query = query.where(ActivityLog.entity_type == entity_type)
        count_query = count_query.where(ActivityLog.entity_type == entity_type)
    if action:
        query = query.where(ActivityLog.action == action)
        count_query = count_query.where(ActivityLog.action == action)

    total_r = await db.execute(count_query)
    total = total_r.scalar() or 0

    result = await db.execute(
        query.order_by(ActivityLog.created_at.desc())
        .offset(offset)
        .limit(limit)
    )
    items = [ActivityEntry.model_validate(a) for a in result.scalars().all()]

    return ActivityListResponse(items=items, total=total)


# ══════════════════════════════════════════════════════════════
# USER MANAGEMENT
# ══════════════════════════════════════════════════════════════

@router.get("/users", response_model=list[UserSummary])
async def list_users(
    public_db: AsyncSession = Depends(get_db),
    user: User = Depends(require_role(UserRole.ADMINISTRATOR)),
    _onboarded: User = Depends(require_onboarded),
):
    """List all users belonging to the admin's enterprise."""
    result = await public_db.execute(
        select(User)
        .where(User.enterprise_id == user.enterprise_id)
        .order_by(User.created_at.desc())
    )
    return [UserSummary.model_validate(u) for u in result.scalars().all()]


@router.patch("/users/{user_id}", response_model=UserSummary)
async def update_user(
    user_id: str,
    payload: UserUpdate,
    public_db: AsyncSession = Depends(get_db),
    tenant_db: AsyncSession = Depends(get_tenant_db),
    admin: User = Depends(require_role(UserRole.ADMINISTRATOR)),
    _onboarded: User = Depends(require_onboarded),
):
    """Update a user's role, name, phone, or packhouse assignments."""
    result = await public_db.execute(
        select(User).where(
            User.id == user_id,
            User.enterprise_id == admin.enterprise_id,
        )
    )
    target = result.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    # Safety: admins cannot change their own role
    if payload.role and user_id == admin.id:
        raise HTTPException(status_code=400, detail="Cannot change your own role")

    changes: dict = {}

    if payload.role is not None:
        if payload.role not in VALID_ROLES:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid role. Must be one of: {', '.join(sorted(VALID_ROLES))}",
            )
        old_role = target.role.value if hasattr(target.role, "value") else str(target.role)
        changes["role"] = {"from": old_role, "to": payload.role}
        target.role = UserRole(payload.role)

    if payload.full_name is not None:
        changes["full_name"] = {"from": target.full_name, "to": payload.full_name}
        target.full_name = payload.full_name

    if payload.phone is not None:
        changes["phone"] = {"from": target.phone, "to": payload.phone}
        target.phone = payload.phone

    if payload.assigned_packhouses is not None:
        changes["assigned_packhouses"] = {"from": target.assigned_packhouses, "to": payload.assigned_packhouses}
        target.assigned_packhouses = payload.assigned_packhouses

    await public_db.flush()

    # Log to tenant activity log
    await log_activity(
        tenant_db, admin,
        action="user_updated",
        entity_type="user",
        entity_id=target.id,
        entity_code=target.email,
        summary=f"Updated user {target.full_name}",
        details=changes,
    )

    return UserSummary.model_validate(target)


@router.post("/users/{user_id}/deactivate", response_model=UserSummary)
async def deactivate_user(
    user_id: str,
    public_db: AsyncSession = Depends(get_db),
    tenant_db: AsyncSession = Depends(get_tenant_db),
    admin: User = Depends(require_role(UserRole.ADMINISTRATOR)),
    _onboarded: User = Depends(require_onboarded),
):
    """Deactivate a user and revoke their tokens."""
    if user_id == admin.id:
        raise HTTPException(status_code=400, detail="Cannot deactivate yourself")

    result = await public_db.execute(
        select(User).where(
            User.id == user_id,
            User.enterprise_id == admin.enterprise_id,
        )
    )
    target = result.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    target.is_active = False
    await public_db.flush()

    # Revoke all tokens so the user is logged out immediately
    await TokenRevocation.revoke_all_user_tokens(user_id)

    await log_activity(
        tenant_db, admin,
        action="user_deactivated",
        entity_type="user",
        entity_id=target.id,
        entity_code=target.email,
        summary=f"Deactivated user {target.full_name}",
    )

    return UserSummary.model_validate(target)


@router.post("/users/{user_id}/activate", response_model=UserSummary)
async def activate_user(
    user_id: str,
    public_db: AsyncSession = Depends(get_db),
    tenant_db: AsyncSession = Depends(get_tenant_db),
    admin: User = Depends(require_role(UserRole.ADMINISTRATOR)),
    _onboarded: User = Depends(require_onboarded),
):
    """Reactivate a previously deactivated user."""
    result = await public_db.execute(
        select(User).where(
            User.id == user_id,
            User.enterprise_id == admin.enterprise_id,
        )
    )
    target = result.scalar_one_or_none()
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    target.is_active = True
    await public_db.flush()

    await log_activity(
        tenant_db, admin,
        action="user_activated",
        entity_type="user",
        entity_id=target.id,
        entity_code=target.email,
        summary=f"Reactivated user {target.full_name}",
    )

    return UserSummary.model_validate(target)


# ══════════════════════════════════════════════════════════════
# DELETED ITEMS
# ══════════════════════════════════════════════════════════════

@router.get("/deleted-items", response_model=DeletedItemsResponse)
async def list_deleted_items(
    item_type: str | None = Query(None),
    db: AsyncSession = Depends(get_tenant_db),
    _user: User = Depends(require_role(UserRole.ADMINISTRATOR)),
    _onboarded: User = Depends(require_onboarded),
):
    """List all soft-deleted items, grouped by type."""
    if item_type:
        _validate_item_type(item_type)

    batches: list[DeletedItemSummary] = []
    lots: list[DeletedItemSummary] = []
    pallets: list[DeletedItemSummary] = []
    containers: list[DeletedItemSummary] = []

    if not item_type or item_type == "batch":
        result = await db.execute(
            select(Batch)
            .where(Batch.is_deleted == True)  # noqa: E712
            .options(selectinload(Batch.grower), selectinload(Batch.lots))
            .order_by(Batch.updated_at.desc())
            .limit(200)
        )
        batches = [_batch_summary(b) for b in result.scalars().all()]

    if not item_type or item_type == "lot":
        result = await db.execute(
            select(Lot)
            .where(Lot.is_deleted == True)  # noqa: E712
            .options(selectinload(Lot.batch))
            .order_by(Lot.updated_at.desc())
            .limit(200)
        )
        lots = [_lot_summary(l) for l in result.scalars().all()]

    if not item_type or item_type == "pallet":
        result = await db.execute(
            select(Pallet)
            .where(Pallet.is_deleted == True)  # noqa: E712
            .order_by(Pallet.updated_at.desc())
            .limit(200)
        )
        pallets = [_pallet_summary(p) for p in result.scalars().all()]

    if not item_type or item_type == "container":
        result = await db.execute(
            select(Container)
            .where(Container.is_deleted == True)  # noqa: E712
            .order_by(Container.updated_at.desc())
            .limit(200)
        )
        containers = [_container_summary(c) for c in result.scalars().all()]

    return DeletedItemsResponse(
        batches=batches,
        lots=lots,
        pallets=pallets,
        containers=containers,
        total_count=len(batches) + len(lots) + len(pallets) + len(containers),
    )


# ── POST /api/admin/deleted-items/{item_type}/{item_id}/restore

@router.post(
    "/deleted-items/{item_type}/{item_id}/restore",
    response_model=RestoreResult,
)
async def restore_deleted_item(
    item_type: str,
    item_id: str,
    db: AsyncSession = Depends(get_tenant_db),
    user: User = Depends(require_role(UserRole.ADMINISTRATOR)),
    _onboarded: User = Depends(require_onboarded),
):
    """Restore a soft-deleted item (set is_deleted=False)."""
    _validate_item_type(item_type)

    if item_type == "batch":
        result = await db.execute(
            select(Batch)
            .where(Batch.id == item_id, Batch.is_deleted == True)  # noqa: E712
            .options(selectinload(Batch.lots))
        )
        batch = result.scalar_one_or_none()
        if not batch:
            raise HTTPException(status_code=404, detail="Deleted batch not found")
        batch.is_deleted = False
        cascade_ids: list[str] = []
        for lot in (batch.lots or []):
            if lot.is_deleted:
                lot.is_deleted = False
                cascade_ids.append(lot.id)
        await db.flush()
        await invalidate_cache("batches:*")
        await log_activity(
            db, user, action="restored", entity_type="batch",
            entity_id=batch.id, entity_code=batch.batch_code,
            summary=f"Restored batch {batch.batch_code}" + (f" with {len(cascade_ids)} lots" if cascade_ids else ""),
        )
        return RestoreResult(
            id=batch.id,
            item_type="batch",
            code=batch.batch_code,
            cascade_restored=cascade_ids,
        )

    if item_type == "lot":
        result = await db.execute(
            select(Lot)
            .where(Lot.id == item_id, Lot.is_deleted == True)  # noqa: E712
            .options(selectinload(Lot.batch))
        )
        lot = result.scalar_one_or_none()
        if not lot:
            raise HTTPException(status_code=404, detail="Deleted lot not found")
        if lot.batch and lot.batch.is_deleted:
            raise HTTPException(
                status_code=400,
                detail=f"Cannot restore lot — parent batch {lot.batch.batch_code} is also deleted. Restore the batch first.",
            )
        lot.is_deleted = False
        await db.flush()
        await invalidate_cache("batches:*")
        await log_activity(
            db, user, action="restored", entity_type="lot",
            entity_id=lot.id, entity_code=lot.lot_code,
            summary=f"Restored lot {lot.lot_code}",
        )
        return RestoreResult(id=lot.id, item_type="lot", code=lot.lot_code)

    if item_type == "pallet":
        result = await db.execute(
            select(Pallet).where(
                Pallet.id == item_id, Pallet.is_deleted == True  # noqa: E712
            )
        )
        pallet = result.scalar_one_or_none()
        if not pallet:
            raise HTTPException(status_code=404, detail="Deleted pallet not found")
        pallet.is_deleted = False
        await db.flush()
        await log_activity(
            db, user, action="restored", entity_type="pallet",
            entity_id=pallet.id, entity_code=pallet.pallet_number,
            summary=f"Restored pallet {pallet.pallet_number}",
        )
        return RestoreResult(id=pallet.id, item_type="pallet", code=pallet.pallet_number)

    # container
    result = await db.execute(
        select(Container).where(
            Container.id == item_id, Container.is_deleted == True  # noqa: E712
        )
    )
    container = result.scalar_one_or_none()
    if not container:
        raise HTTPException(status_code=404, detail="Deleted container not found")
    container.is_deleted = False
    await db.flush()
    await log_activity(
        db, user, action="restored", entity_type="container",
        entity_id=container.id, entity_code=container.container_number,
        summary=f"Restored container {container.container_number}",
    )
    return RestoreResult(id=container.id, item_type="container", code=container.container_number)


# ── DELETE /api/admin/deleted-items/{item_type}/{item_id}/purge

@router.delete(
    "/deleted-items/{item_type}/{item_id}/purge",
    response_model=PurgeResult,
)
async def purge_deleted_item(
    item_type: str,
    item_id: str,
    db: AsyncSession = Depends(get_tenant_db),
    user: User = Depends(require_role(UserRole.ADMINISTRATOR)),
    _onboarded: User = Depends(require_onboarded),
):
    """Permanently delete a soft-deleted item. Cannot be undone."""
    _validate_item_type(item_type)

    if item_type == "batch":
        result = await db.execute(
            select(Batch)
            .where(Batch.id == item_id, Batch.is_deleted == True)  # noqa: E712
            .options(selectinload(Batch.lots))
        )
        batch = result.scalar_one_or_none()
        if not batch:
            raise HTTPException(status_code=404, detail="Deleted batch not found")

        cascade_ids: list[str] = []
        for lot in (batch.lots or []):
            await db.execute(
                sa_delete(PalletLot).where(PalletLot.lot_id == lot.id)
            )
            cascade_ids.append(lot.id)
            await db.delete(lot)

        await db.execute(
            sa_delete(BatchHistory).where(BatchHistory.batch_id == batch.id)
        )
        code = batch.batch_code
        await db.delete(batch)
        await db.flush()
        await invalidate_cache("batches:*")
        await log_activity(
            db, user, action="purged", entity_type="batch",
            entity_id=item_id, entity_code=code,
            summary=f"Permanently deleted batch {code}" + (f" with {len(cascade_ids)} lots" if cascade_ids else ""),
        )
        return PurgeResult(
            id=item_id, item_type="batch", code=code, cascade_purged=cascade_ids
        )

    if item_type == "lot":
        result = await db.execute(
            select(Lot).where(Lot.id == item_id, Lot.is_deleted == True)  # noqa: E712
        )
        lot = result.scalar_one_or_none()
        if not lot:
            raise HTTPException(status_code=404, detail="Deleted lot not found")
        await db.execute(
            sa_delete(PalletLot).where(PalletLot.lot_id == lot.id)
        )
        code = lot.lot_code
        await db.delete(lot)
        await db.flush()
        await invalidate_cache("batches:*")
        await log_activity(
            db, user, action="purged", entity_type="lot",
            entity_id=item_id, entity_code=code,
            summary=f"Permanently deleted lot {code}",
        )
        return PurgeResult(id=item_id, item_type="lot", code=code)

    if item_type == "pallet":
        result = await db.execute(
            select(Pallet).where(
                Pallet.id == item_id, Pallet.is_deleted == True  # noqa: E712
            )
        )
        pallet = result.scalar_one_or_none()
        if not pallet:
            raise HTTPException(status_code=404, detail="Deleted pallet not found")
        await db.execute(
            sa_delete(PalletLot).where(PalletLot.pallet_id == pallet.id)
        )
        code = pallet.pallet_number
        await db.delete(pallet)
        await db.flush()
        await log_activity(
            db, user, action="purged", entity_type="pallet",
            entity_id=item_id, entity_code=code,
            summary=f"Permanently deleted pallet {code}",
        )
        return PurgeResult(id=item_id, item_type="pallet", code=code)

    # container
    result = await db.execute(
        select(Container).where(
            Container.id == item_id, Container.is_deleted == True  # noqa: E712
        )
    )
    container = result.scalar_one_or_none()
    if not container:
        raise HTTPException(status_code=404, detail="Deleted container not found")

    active_pallet_result = await db.execute(
        select(Pallet).where(
            Pallet.container_id == container.id,
            Pallet.is_deleted == False,  # noqa: E712
        ).limit(1)
    )
    if active_pallet_result.scalar_one_or_none():
        raise HTTPException(
            status_code=400,
            detail="Cannot purge container — it still has linked pallets. Remove pallet links first.",
        )

    code = container.container_number
    await db.delete(container)
    await db.flush()
    await log_activity(
        db, user, action="purged", entity_type="container",
        entity_id=item_id, entity_code=code,
        summary=f"Permanently deleted container {code}",
    )
    return PurgeResult(id=item_id, item_type="container", code=code)
