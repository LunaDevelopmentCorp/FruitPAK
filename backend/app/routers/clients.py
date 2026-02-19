"""Client management router.

Endpoints:
    GET   /api/clients/          List all clients
    POST  /api/clients/          Create client
    PATCH /api/clients/{id}      Update client
    DELETE /api/clients/{id}     Soft-delete (deactivate) client
"""

import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import require_onboarded, require_permission
from app.database import get_tenant_db
from app.models.public.user import User
from app.models.tenant.client import Client
from app.schemas.client import ClientCreate, ClientOut, ClientUpdate

router = APIRouter()


@router.get("/", response_model=list[ClientOut])
async def list_clients(
    include_inactive: bool = False,
    db: AsyncSession = Depends(get_tenant_db),
    _user: User = Depends(require_onboarded),
):
    """List all clients (active by default)."""
    query = select(Client)
    if not include_inactive:
        query = query.where(Client.is_active == True)  # noqa: E712
    query = query.order_by(Client.name)
    result = await db.execute(query)
    return [ClientOut.model_validate(c) for c in result.scalars().all()]


@router.post("/", response_model=ClientOut, status_code=201)
async def create_client(
    body: ClientCreate,
    db: AsyncSession = Depends(get_tenant_db),
    _user: User = Depends(require_permission("batch.write")),
):
    """Create a new client."""
    # Check name uniqueness
    existing = await db.execute(
        select(Client).where(Client.name == body.name)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail=f"Client '{body.name}' already exists")

    client = Client(id=str(uuid.uuid4()), **body.model_dump())
    db.add(client)
    await db.flush()
    return ClientOut.model_validate(client)


@router.patch("/{client_id}", response_model=ClientOut)
async def update_client(
    client_id: str,
    body: ClientUpdate,
    db: AsyncSession = Depends(get_tenant_db),
    _user: User = Depends(require_permission("batch.write")),
):
    """Update a client."""
    result = await db.execute(select(Client).where(Client.id == client_id))
    client = result.scalar_one_or_none()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")

    updates = body.model_dump(exclude_unset=True)
    for key, value in updates.items():
        setattr(client, key, value)
    await db.flush()
    return ClientOut.model_validate(client)


@router.delete("/{client_id}", response_model=ClientOut)
async def deactivate_client(
    client_id: str,
    db: AsyncSession = Depends(get_tenant_db),
    _user: User = Depends(require_permission("batch.write")),
):
    """Soft-delete (deactivate) a client."""
    result = await db.execute(select(Client).where(Client.id == client_id))
    client = result.scalar_one_or_none()
    if not client:
        raise HTTPException(status_code=404, detail="Client not found")

    client.is_active = not client.is_active
    await db.flush()
    return ClientOut.model_validate(client)
