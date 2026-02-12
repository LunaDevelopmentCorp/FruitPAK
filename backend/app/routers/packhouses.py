"""Tenant-scoped packhouse routes — demonstrates permission-based RBAC.

Every endpoint uses:
  - get_tenant_db   → pins DB session to the tenant's schema
  - require_permission → checks granular permissions from JWT (zero-DB-hit)
"""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import require_onboarded, require_permission
from app.database import get_tenant_db
from app.models.public.user import User
from app.models.tenant.packhouse import Packhouse
from app.schemas.common import PaginatedResponse
from app.utils.cache import cached, invalidate_cache

from pydantic import BaseModel


# ── Schemas ──────────────────────────────────────────────────

class PackhouseCreate(BaseModel):
    name: str
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

    # Invalidate cache when creating new packhouse
    await invalidate_cache("packhouses:*")

    return packhouse


@router.get("/", response_model=PaginatedResponse[PackhouseOut])
@cached(ttl=300, prefix="packhouses")  # Cache for 5 minutes
async def list_packhouses(
    limit: int = Query(50, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_tenant_db),
    user: User = Depends(require_permission("packhouse.read")),
    _onboarded: User = Depends(require_onboarded),
):
    """List packhouses with caching (TTL: 5 minutes).

    Cache is automatically invalidated when packhouses are created/updated.
    """
    # Count total packhouses
    count_stmt = select(func.count(Packhouse.id))
    total = await db.scalar(count_stmt) or 0

    # Get paginated items
    items_stmt = select(Packhouse).order_by(Packhouse.name).limit(limit).offset(offset)
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
):
    result = await db.execute(
        select(Packhouse).where(Packhouse.id == packhouse_id)
    )
    packhouse = result.scalar_one_or_none()
    if not packhouse:
        raise HTTPException(status_code=404, detail="Packhouse not found")
    return packhouse
