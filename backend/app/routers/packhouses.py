"""Tenant-scoped packhouse routes — demonstrates permission-based RBAC.

Every endpoint uses:
  - get_tenant_db   → pins DB session to the tenant's schema
  - require_permission → checks granular permissions from JWT (zero-DB-hit)
"""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import require_onboarded, require_permission
from app.auth.packhouse_scope import get_packhouse_scope
from app.database import get_tenant_db
from app.models.public.user import User
from app.models.tenant.batch import Batch
from app.models.tenant.packhouse import Packhouse
from app.schemas.common import PaginatedResponse
from app.utils.cache import invalidate_cache

from pydantic import BaseModel


# ── Schemas ──────────────────────────────────────────────────

class PackhouseCreate(BaseModel):
    name: str
    location: str | None = None
    capacity_tons_per_day: int | None = None
    cold_rooms: int | None = None


class PackhouseUpdate(BaseModel):
    name: str | None = None
    location: str | None = None
    capacity_tons_per_day: int | None = None
    cold_rooms: int | None = None


class PackhouseOut(BaseModel):
    id: str
    name: str
    location: str | None
    capacity_tons_per_day: int | None
    cold_rooms: int | None

    model_config = {"from_attributes": True}


# ── Routes ───────────────────────────────────────────────────

router = APIRouter()


@router.post("/", response_model=PackhouseOut, status_code=status.HTTP_201_CREATED)
async def create_packhouse(
    body: PackhouseCreate,
    db: AsyncSession = Depends(get_tenant_db),
    user: User = Depends(require_permission("packhouse.write")),
    _onboarded: User = Depends(require_onboarded),
):
    packhouse = Packhouse(
        name=body.name,
        location=body.location,
        capacity_tons_per_day=body.capacity_tons_per_day,
        cold_rooms=body.cold_rooms,
    )
    db.add(packhouse)
    await db.flush()

    # Invalidate list and single-item caches
    await invalidate_cache("packhouses:*")
    await invalidate_cache("packhouse:*")

    return packhouse


@router.get("/", response_model=PaginatedResponse[PackhouseOut])
async def list_packhouses(
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_tenant_db),
    user: User = Depends(require_permission("packhouse.read")),
    _onboarded: User = Depends(require_onboarded),
    packhouse_scope: list[str] | None = Depends(get_packhouse_scope),
):
    """List packhouses filtered by packhouse scope."""
    # Build base query with scope filter
    base_stmt = select(Packhouse)
    if packhouse_scope is not None:
        base_stmt = base_stmt.where(Packhouse.id.in_(packhouse_scope))

    # Count total packhouses
    count_stmt = select(func.count()).select_from(base_stmt.subquery())
    total = await db.scalar(count_stmt) or 0

    # Get paginated items
    items_stmt = base_stmt.order_by(Packhouse.name).limit(limit).offset(offset)
    result = await db.execute(items_stmt)
    items = result.scalars().all()

    # Convert to Pydantic models for caching
    items_out = [PackhouseOut.model_validate(item) for item in items]

    return PaginatedResponse(
        items=items_out,
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get("/{packhouse_id}", response_model=PackhouseOut)
async def get_packhouse(
    packhouse_id: str,
    db: AsyncSession = Depends(get_tenant_db),
    user: User = Depends(require_permission("packhouse.read")),
    _onboarded: User = Depends(require_onboarded),
    packhouse_scope: list[str] | None = Depends(get_packhouse_scope),
):
    result = await db.execute(
        select(Packhouse).where(Packhouse.id == packhouse_id)
    )
    packhouse = result.scalar_one_or_none()
    if not packhouse:
        raise HTTPException(status_code=404, detail="Packhouse not found")
    if packhouse_scope is not None and packhouse.id not in packhouse_scope:
        raise HTTPException(status_code=404, detail="Packhouse not found")
    return PackhouseOut.model_validate(packhouse)


@router.patch("/{packhouse_id}", response_model=PackhouseOut)
async def update_packhouse(
    packhouse_id: str,
    body: PackhouseUpdate,
    db: AsyncSession = Depends(get_tenant_db),
    user: User = Depends(require_permission("packhouse.write")),
    _onboarded: User = Depends(require_onboarded),
):
    """Update packhouse details (name, location, capacity, cold rooms)."""
    result = await db.execute(
        select(Packhouse).where(Packhouse.id == packhouse_id)
    )
    packhouse = result.scalar_one_or_none()
    if not packhouse:
        raise HTTPException(status_code=404, detail="Packhouse not found")

    updates = body.model_dump(exclude_unset=True)
    for field, value in updates.items():
        setattr(packhouse, field, value)

    await db.flush()

    # Invalidate caches
    await invalidate_cache("packhouses:*")
    await invalidate_cache("packhouse:*")

    return PackhouseOut.model_validate(packhouse)


@router.delete("/{packhouse_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_packhouse(
    packhouse_id: str,
    db: AsyncSession = Depends(get_tenant_db),
    user: User = Depends(require_permission("packhouse.delete")),
    _onboarded: User = Depends(require_onboarded),
):
    """Delete a packhouse.

    Only allowed if no batches reference this packhouse.
    """
    result = await db.execute(
        select(Packhouse).where(Packhouse.id == packhouse_id)
    )
    packhouse = result.scalar_one_or_none()
    if not packhouse:
        raise HTTPException(status_code=404, detail="Packhouse not found")

    # Check for batches referencing this packhouse
    batch_count_result = await db.execute(
        select(func.count()).where(
            Batch.packhouse_id == packhouse_id,
            Batch.is_deleted == False,  # noqa: E712
        )
    )
    batch_count = batch_count_result.scalar() or 0
    if batch_count > 0:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot delete packhouse with {batch_count} associated batch(es). "
                   "Delete or reassign the batches first.",
        )

    await db.delete(packhouse)
    await db.flush()

    # Invalidate caches
    await invalidate_cache("packhouses:*")
    await invalidate_cache("packhouse:*")
