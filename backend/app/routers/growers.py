"""Tenant-scoped grower routes — lightweight list for dropdowns + CRUD."""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import require_onboarded, require_permission
from app.database import get_tenant_db
from app.models.public.user import User
from app.models.tenant.grower import Grower

from pydantic import BaseModel


# ── Schemas ──────────────────────────────────────────────────

class GrowerOut(BaseModel):
    id: str
    name: str
    grower_code: str | None
    email: str | None
    phone: str | None
    region: str | None
    total_hectares: float | None

    model_config = {"from_attributes": True}


# ── Routes ───────────────────────────────────────────────────

router = APIRouter()


@router.get("/", response_model=list[GrowerOut])
async def list_growers(
    db: AsyncSession = Depends(get_tenant_db),
    _user: User = Depends(require_permission("grower.read")),
    _onboarded: User = Depends(require_onboarded),
):
    result = await db.execute(select(Grower))
    return result.scalars().all()


@router.get("/{grower_id}", response_model=GrowerOut)
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
    return grower
