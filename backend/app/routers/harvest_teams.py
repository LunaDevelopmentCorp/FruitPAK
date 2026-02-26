"""Tenant-scoped harvest team routes — list, get, update, delete."""

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import require_onboarded, require_permission
from app.database import get_tenant_db
from app.models.public.user import User
from app.models.tenant.harvest_team import HarvestTeam
from app.schemas.common import PaginatedResponse


# ── Schemas ──────────────────────────────────────────────────

class HarvestTeamOut(BaseModel):
    id: str
    name: str
    team_leader: str | None
    team_size: int | None
    grower_id: str | None
    supplier_id: str | None
    estimated_volume_kg: float | None
    fruit_types: list[str] | None = None
    assigned_fields: list[str] | None = None
    notes: str | None

    model_config = {"from_attributes": True}


class HarvestTeamUpdate(BaseModel):
    name: str | None = None
    team_leader: str | None = None
    team_size: int | None = None
    grower_id: str | None = None
    supplier_id: str | None = None
    estimated_volume_kg: float | None = None
    fruit_types: list[str] | None = None
    assigned_fields: list[str] | None = None
    notes: str | None = None


# ── Routes ───────────────────────────────────────────────────

router = APIRouter()


@router.get("/", response_model=PaginatedResponse[HarvestTeamOut])
async def list_harvest_teams(
    limit: int = Query(200, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_tenant_db),
    _user: User = Depends(require_onboarded),
):
    count_stmt = select(func.count(HarvestTeam.id))
    total = await db.scalar(count_stmt) or 0

    items_stmt = select(HarvestTeam).order_by(HarvestTeam.name).limit(limit).offset(offset)
    result = await db.execute(items_stmt)
    items = [HarvestTeamOut.model_validate(t) for t in result.scalars().all()]

    return PaginatedResponse(items=items, total=total, limit=limit, offset=offset)


@router.get("/{team_id}", response_model=HarvestTeamOut)
async def get_harvest_team(
    team_id: str,
    db: AsyncSession = Depends(get_tenant_db),
    _user: User = Depends(require_onboarded),
):
    result = await db.execute(select(HarvestTeam).where(HarvestTeam.id == team_id))
    team = result.scalar_one_or_none()
    if not team:
        raise HTTPException(status_code=404, detail="Harvest team not found")
    return HarvestTeamOut.model_validate(team)


@router.patch("/{team_id}", response_model=HarvestTeamOut)
async def update_harvest_team(
    team_id: str,
    body: HarvestTeamUpdate,
    db: AsyncSession = Depends(get_tenant_db),
    _user: User = Depends(require_permission("batch.write")),
    _onboarded: User = Depends(require_onboarded),
):
    result = await db.execute(select(HarvestTeam).where(HarvestTeam.id == team_id))
    team = result.scalar_one_or_none()
    if not team:
        raise HTTPException(status_code=404, detail="Harvest team not found")

    updates = body.model_dump(exclude_unset=True)
    for key, value in updates.items():
        setattr(team, key, value)

    await db.flush()
    await db.refresh(team)
    return HarvestTeamOut.model_validate(team)


@router.delete("/{team_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_harvest_team(
    team_id: str,
    db: AsyncSession = Depends(get_tenant_db),
    _user: User = Depends(require_permission("batch.write")),
    _onboarded: User = Depends(require_onboarded),
):
    result = await db.execute(select(HarvestTeam).where(HarvestTeam.id == team_id))
    team = result.scalar_one_or_none()
    if not team:
        raise HTTPException(status_code=404, detail="Harvest team not found")
    await db.delete(team)
    await db.flush()
