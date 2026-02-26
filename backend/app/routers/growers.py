"""Tenant-scoped grower routes — lightweight list for dropdowns + CRUD."""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import require_onboarded, require_permission
from app.database import get_tenant_db
from app.models.public.user import User
from app.models.tenant.grower import Grower
from app.schemas.common import PaginatedResponse
from app.utils.cache import cached, invalidate_cache

from pydantic import BaseModel


# ── Schemas ──────────────────────────────────────────────────

class GrowerOut(BaseModel):
    id: str
    name: str
    grower_code: str | None
    contact_person: str | None
    email: str | None
    phone: str | None
    region: str | None
    total_hectares: float | None
    estimated_volume_tons: float | None
    globalg_ap_certified: bool = False
    globalg_ap_number: str | None
    fields: list[dict] | None = None
    notes: str | None

    model_config = {"from_attributes": True}


class GrowerUpdate(BaseModel):
    name: str | None = None
    grower_code: str | None = None
    contact_person: str | None = None
    email: str | None = None
    phone: str | None = None
    region: str | None = None
    total_hectares: float | None = None
    estimated_volume_tons: float | None = None
    globalg_ap_certified: bool | None = None
    globalg_ap_number: str | None = None
    fields: list[dict] | None = None
    notes: str | None = None


# ── Routes ───────────────────────────────────────────────────

router = APIRouter()


@router.get("/", response_model=PaginatedResponse[GrowerOut])
@cached(ttl=300, prefix="growers")  # Cache for 5 minutes
async def list_growers(
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_tenant_db),
    _user: User = Depends(require_permission("grower.read")),
    _onboarded: User = Depends(require_onboarded),
):
    """List growers with caching (TTL: 5 minutes).

    Cache is automatically managed and invalidated when needed.
    """
    # Count total growers
    count_stmt = select(func.count(Grower.id))
    total = await db.scalar(count_stmt) or 0

    # Get paginated items
    items_stmt = select(Grower).order_by(Grower.name).limit(limit).offset(offset)
    result = await db.execute(items_stmt)
    items = result.scalars().all()

    # Convert to Pydantic models for caching
    items_out = [GrowerOut.model_validate(item) for item in items]

    return PaginatedResponse(
        items=items_out,
        total=total,
        limit=limit,
        offset=offset,
    )


@router.get("/{grower_id}", response_model=GrowerOut)
@cached(ttl=300, prefix="grower")  # Cache for 5 minutes
async def get_grower(
    grower_id: str,
    db: AsyncSession = Depends(get_tenant_db),
    _user: User = Depends(require_permission("grower.read")),
    _onboarded: User = Depends(require_onboarded),
):
    result = await db.execute(select(Grower).where(Grower.id == grower_id))
    grower = result.scalar_one_or_none()
    if not grower:
        raise HTTPException(status_code=404, detail="Grower not found")
    return GrowerOut.model_validate(grower)


@router.patch("/{grower_id}", response_model=GrowerOut)
async def update_grower(
    grower_id: str,
    body: GrowerUpdate,
    db: AsyncSession = Depends(get_tenant_db),
    _user: User = Depends(require_permission("grower.write")),
    _onboarded: User = Depends(require_onboarded),
):
    result = await db.execute(select(Grower).where(Grower.id == grower_id))
    grower = result.scalar_one_or_none()
    if not grower:
        raise HTTPException(status_code=404, detail="Grower not found")

    updates = body.model_dump(exclude_unset=True)
    for key, value in updates.items():
        setattr(grower, key, value)

    await db.flush()
    await db.refresh(grower)
    await invalidate_cache("growers:*")
    return GrowerOut.model_validate(grower)


@router.delete("/{grower_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_grower(
    grower_id: str,
    db: AsyncSession = Depends(get_tenant_db),
    _user: User = Depends(require_permission("grower.write")),
    _onboarded: User = Depends(require_onboarded),
):
    result = await db.execute(select(Grower).where(Grower.id == grower_id))
    grower = result.scalar_one_or_none()
    if not grower:
        raise HTTPException(status_code=404, detail="Grower not found")
    await db.delete(grower)
    await db.flush()
    await invalidate_cache("growers:*")
