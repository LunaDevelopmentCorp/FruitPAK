"""Shipping agent management router.

Endpoints:
    GET    /api/shipping-agents/          List all shipping agents
    POST   /api/shipping-agents/          Create shipping agent
    PATCH  /api/shipping-agents/{id}      Update shipping agent
    DELETE /api/shipping-agents/{id}      Toggle active/inactive
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import require_onboarded, require_permission
from app.database import get_tenant_db
from app.models.public.user import User
from app.models.tenant.shipping_agent import ShippingAgent
from app.schemas.shipping_agent import ShippingAgentCreate, ShippingAgentOut, ShippingAgentUpdate

router = APIRouter()


@router.get("/", response_model=list[ShippingAgentOut])
async def list_shipping_agents(
    include_inactive: bool = False,
    db: AsyncSession = Depends(get_tenant_db),
    _user: User = Depends(require_onboarded),
):
    """List all shipping agents (active by default)."""
    query = select(ShippingAgent)
    if not include_inactive:
        query = query.where(ShippingAgent.is_active == True)  # noqa: E712
    query = query.order_by(ShippingAgent.name)
    result = await db.execute(query)
    return [ShippingAgentOut.model_validate(a) for a in result.scalars().all()]


@router.post("/", response_model=ShippingAgentOut, status_code=201)
async def create_shipping_agent(
    body: ShippingAgentCreate,
    db: AsyncSession = Depends(get_tenant_db),
    _user: User = Depends(require_permission("export.write")),
):
    """Create a new shipping agent."""
    existing = await db.execute(
        select(ShippingAgent).where(
            (ShippingAgent.name == body.name) | (ShippingAgent.code == body.code)
        )
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Shipping agent with this name or code already exists")

    agent = ShippingAgent(id=str(uuid.uuid4()), **body.model_dump())
    db.add(agent)
    await db.flush()
    return ShippingAgentOut.model_validate(agent)


@router.patch("/{agent_id}", response_model=ShippingAgentOut)
async def update_shipping_agent(
    agent_id: str,
    body: ShippingAgentUpdate,
    db: AsyncSession = Depends(get_tenant_db),
    _user: User = Depends(require_permission("export.write")),
):
    """Update a shipping agent."""
    result = await db.execute(select(ShippingAgent).where(ShippingAgent.id == agent_id))
    agent = result.scalar_one_or_none()
    if not agent:
        raise HTTPException(status_code=404, detail="Shipping agent not found")

    updates = body.model_dump(exclude_unset=True)
    for key, value in updates.items():
        setattr(agent, key, value)
    await db.flush()
    return ShippingAgentOut.model_validate(agent)


@router.delete("/{agent_id}", response_model=ShippingAgentOut)
async def toggle_shipping_agent(
    agent_id: str,
    db: AsyncSession = Depends(get_tenant_db),
    _user: User = Depends(require_permission("export.write")),
):
    """Toggle active/inactive for a shipping agent."""
    result = await db.execute(select(ShippingAgent).where(ShippingAgent.id == agent_id))
    agent = result.scalar_one_or_none()
    if not agent:
        raise HTTPException(status_code=404, detail="Shipping agent not found")

    agent.is_active = not agent.is_active
    await db.flush()
    return ShippingAgentOut.model_validate(agent)
