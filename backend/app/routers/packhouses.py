"""Tenant-scoped packhouse routes — demonstrates permission-based RBAC.

Every endpoint uses:
  - get_tenant_db   → pins DB session to the tenant's schema
  - require_permission → checks granular permissions from JWT (zero-DB-hit)
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import require_permission
from app.database import get_tenant_db
from app.models.public.user import User
from app.models.tenant.packhouse import Packhouse

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
):
    packhouse = Packhouse(
        name=body.name,
        location=body.location,
        capacity_tons_per_day=body.capacity_tons_per_day,
        cold_rooms=body.cold_rooms,
    )
    db.add(packhouse)
    await db.flush()
    return packhouse


@router.get("/", response_model=list[PackhouseOut])
async def list_packhouses(
    db: AsyncSession = Depends(get_tenant_db),
    user: User = Depends(require_permission("packhouse.read")),
):
    result = await db.execute(select(Packhouse))
    return result.scalars().all()


@router.get("/{packhouse_id}", response_model=PackhouseOut)
async def get_packhouse(
    packhouse_id: str,
    db: AsyncSession = Depends(get_tenant_db),
    user: User = Depends(require_permission("packhouse.read")),
):
    result = await db.execute(
        select(Packhouse).where(Packhouse.id == packhouse_id)
    )
    packhouse = result.scalar_one_or_none()
    if not packhouse:
        raise HTTPException(status_code=404, detail="Packhouse not found")
    return packhouse
