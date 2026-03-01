"""Transporter management router.

Endpoints:
    GET    /api/transporters/          List all transporters
    POST   /api/transporters/          Create transporter
    PATCH  /api/transporters/{id}      Update transporter
    DELETE /api/transporters/{id}      Toggle active/inactive
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import require_onboarded, require_permission
from app.database import get_tenant_db
from app.models.public.user import User
from app.models.tenant.transporter import Transporter
from app.schemas.transporter import TransporterCreate, TransporterOut, TransporterUpdate

router = APIRouter()


@router.get("/", response_model=list[TransporterOut])
async def list_transporters(
    include_inactive: bool = False,
    db: AsyncSession = Depends(get_tenant_db),
    _user: User = Depends(require_onboarded),
):
    """List all transporters (active by default)."""
    query = select(Transporter)
    if not include_inactive:
        query = query.where(Transporter.is_active == True)  # noqa: E712
    query = query.order_by(Transporter.name)
    result = await db.execute(query)
    return [TransporterOut.model_validate(t) for t in result.scalars().all()]


@router.post("/", response_model=TransporterOut, status_code=201)
async def create_transporter(
    body: TransporterCreate,
    db: AsyncSession = Depends(get_tenant_db),
    _user: User = Depends(require_permission("export.write")),
):
    """Create a new transporter."""
    existing = await db.execute(
        select(Transporter).where(
            (Transporter.name == body.name) | (Transporter.code == body.code)
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Transporter with this name or code already exists")

    transporter = Transporter(id=str(uuid.uuid4()), **body.model_dump())
    db.add(transporter)
    await db.flush()
    return TransporterOut.model_validate(transporter)


@router.patch("/{transporter_id}", response_model=TransporterOut)
async def update_transporter(
    transporter_id: str,
    body: TransporterUpdate,
    db: AsyncSession = Depends(get_tenant_db),
    _user: User = Depends(require_permission("export.write")),
):
    """Update a transporter."""
    result = await db.execute(select(Transporter).where(Transporter.id == transporter_id))
    transporter = result.scalar_one_or_none()
    if not transporter:
        raise HTTPException(status_code=404, detail="Transporter not found")

    updates = body.model_dump(exclude_unset=True)
    for key, value in updates.items():
        setattr(transporter, key, value)
    await db.flush()
    return TransporterOut.model_validate(transporter)


@router.delete("/{transporter_id}", response_model=TransporterOut)
async def toggle_transporter(
    transporter_id: str,
    db: AsyncSession = Depends(get_tenant_db),
    _user: User = Depends(require_permission("export.write")),
):
    """Toggle active/inactive for a transporter."""
    result = await db.execute(select(Transporter).where(Transporter.id == transporter_id))
    transporter = result.scalar_one_or_none()
    if not transporter:
        raise HTTPException(status_code=404, detail="Transporter not found")

    transporter.is_active = not transporter.is_active
    await db.flush()
    return TransporterOut.model_validate(transporter)
