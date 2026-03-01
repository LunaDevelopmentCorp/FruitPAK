"""Shipping line management router.

Endpoints:
    GET    /api/shipping-lines/          List all shipping lines
    POST   /api/shipping-lines/          Create shipping line
    PATCH  /api/shipping-lines/{id}      Update shipping line
    DELETE /api/shipping-lines/{id}      Toggle active/inactive
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import require_onboarded, require_permission
from app.database import get_tenant_db
from app.models.public.user import User
from app.models.tenant.shipping_line import ShippingLine
from app.schemas.shipping_line import ShippingLineCreate, ShippingLineOut, ShippingLineUpdate

router = APIRouter()


@router.get("/", response_model=list[ShippingLineOut])
async def list_shipping_lines(
    include_inactive: bool = False,
    db: AsyncSession = Depends(get_tenant_db),
    _user: User = Depends(require_onboarded),
):
    """List all shipping lines (active by default)."""
    query = select(ShippingLine)
    if not include_inactive:
        query = query.where(ShippingLine.is_active == True)  # noqa: E712
    query = query.order_by(ShippingLine.name)
    result = await db.execute(query)
    return [ShippingLineOut.model_validate(s) for s in result.scalars().all()]


@router.post("/", response_model=ShippingLineOut, status_code=201)
async def create_shipping_line(
    body: ShippingLineCreate,
    db: AsyncSession = Depends(get_tenant_db),
    _user: User = Depends(require_permission("export.write")),
):
    """Create a new shipping line."""
    existing = await db.execute(
        select(ShippingLine).where(
            (ShippingLine.name == body.name) | (ShippingLine.code == body.code)
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Shipping line with this name or code already exists")

    line = ShippingLine(id=str(uuid.uuid4()), **body.model_dump())
    db.add(line)
    await db.flush()
    return ShippingLineOut.model_validate(line)


@router.patch("/{line_id}", response_model=ShippingLineOut)
async def update_shipping_line(
    line_id: str,
    body: ShippingLineUpdate,
    db: AsyncSession = Depends(get_tenant_db),
    _user: User = Depends(require_permission("export.write")),
):
    """Update a shipping line."""
    result = await db.execute(select(ShippingLine).where(ShippingLine.id == line_id))
    line = result.scalar_one_or_none()
    if not line:
        raise HTTPException(status_code=404, detail="Shipping line not found")

    updates = body.model_dump(exclude_unset=True)
    for key, value in updates.items():
        setattr(line, key, value)
    await db.flush()
    return ShippingLineOut.model_validate(line)


@router.delete("/{line_id}", response_model=ShippingLineOut)
async def toggle_shipping_line(
    line_id: str,
    db: AsyncSession = Depends(get_tenant_db),
    _user: User = Depends(require_permission("export.write")),
):
    """Toggle active/inactive for a shipping line."""
    result = await db.execute(select(ShippingLine).where(ShippingLine.id == line_id))
    line = result.scalar_one_or_none()
    if not line:
        raise HTTPException(status_code=404, detail="Shipping line not found")

    line.is_active = not line.is_active
    await db.flush()
    return ShippingLineOut.model_validate(line)
