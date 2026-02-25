"""Platform admin endpoints — cross-tenant management for the platform owner.

All endpoints require PLATFORM_ADMIN role.

Endpoints:
    GET  /api/platform/stats                          Platform-wide statistics
    GET  /api/platform/enterprises                    List all enterprises
    GET  /api/platform/enterprises/{id}               Enterprise detail with users
    PATCH /api/platform/enterprises/{id}              Update enterprise (activate/deactivate)
    GET  /api/platform/users                          List all users across enterprises
    POST /api/platform/users/{id}/reset-password      Reset a user's password
    POST /api/platform/users/{id}/activate            Activate a user
    POST /api/platform/users/{id}/deactivate          Deactivate a user
    POST /api/platform/impersonate/{user_id}          Get JWT for any user (troubleshooting)
"""

import secrets

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import require_platform_admin
from app.auth.jwt import create_access_token, create_refresh_token
from app.auth.password import hash_password
from app.auth.permissions import resolve_permissions
from app.database import get_db
from app.models.public.enterprise import Enterprise
from app.models.public.user import User, UserRole

router = APIRouter()


# ── Schemas ──────────────────────────────────────────────────

class PlatformStats(BaseModel):
    total_enterprises: int
    active_enterprises: int
    onboarded_enterprises: int
    total_users: int
    active_users: int


class EnterpriseListItem(BaseModel):
    id: str
    name: str
    country: str
    tenant_schema: str
    is_active: bool
    is_onboarded: bool
    created_at: str
    user_count: int

    model_config = {"from_attributes": True}


class EnterpriseDetail(EnterpriseListItem):
    users: list["PlatformUserItem"]


class PlatformUserItem(BaseModel):
    id: str
    email: str
    full_name: str
    phone: str | None
    role: str
    is_active: bool
    enterprise_id: str | None
    enterprise_name: str | None = None
    created_at: str

    model_config = {"from_attributes": True}


class EnterpriseUpdate(BaseModel):
    is_active: bool | None = None
    name: str | None = None


class PasswordResetResponse(BaseModel):
    user_id: str
    email: str
    temporary_password: str


class ImpersonateResponse(BaseModel):
    access_token: str
    refresh_token: str
    user_email: str
    enterprise_name: str | None


# ── Stats ────────────────────────────────────────────────────

@router.get("/stats", response_model=PlatformStats)
async def get_platform_stats(
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_platform_admin),
):
    ent_result = await db.execute(
        select(
            func.count(Enterprise.id),
            func.count(Enterprise.id).filter(Enterprise.is_active == True),
            func.count(Enterprise.id).filter(Enterprise.is_onboarded == True),
        )
    )
    total_ent, active_ent, onboarded_ent = ent_result.one()

    user_result = await db.execute(
        select(
            func.count(User.id),
            func.count(User.id).filter(User.is_active == True),
        )
    )
    total_users, active_users = user_result.one()

    return PlatformStats(
        total_enterprises=total_ent,
        active_enterprises=active_ent,
        onboarded_enterprises=onboarded_ent,
        total_users=total_users,
        active_users=active_users,
    )


# ── Enterprises ──────────────────────────────────────────────

@router.get("/enterprises", response_model=list[EnterpriseListItem])
async def list_enterprises(
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_platform_admin),
):
    result = await db.execute(
        select(
            Enterprise,
            func.count(User.id).label("user_count"),
        )
        .outerjoin(User, User.enterprise_id == Enterprise.id)
        .group_by(Enterprise.id)
        .order_by(Enterprise.created_at.desc())
    )
    items = []
    for row in result.all():
        ent = row[0]
        items.append(EnterpriseListItem(
            id=ent.id,
            name=ent.name,
            country=ent.country,
            tenant_schema=ent.tenant_schema,
            is_active=ent.is_active,
            is_onboarded=ent.is_onboarded,
            created_at=ent.created_at.isoformat(),
            user_count=row[1],
        ))
    return items


@router.get("/enterprises/{enterprise_id}", response_model=EnterpriseDetail)
async def get_enterprise(
    enterprise_id: str,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_platform_admin),
):
    result = await db.execute(
        select(Enterprise).where(Enterprise.id == enterprise_id)
    )
    ent = result.scalar_one_or_none()
    if not ent:
        raise HTTPException(status_code=404, detail="Enterprise not found")

    users_result = await db.execute(
        select(User).where(User.enterprise_id == enterprise_id).order_by(User.created_at)
    )
    users = [
        PlatformUserItem(
            id=u.id, email=u.email, full_name=u.full_name, phone=u.phone,
            role=u.role.value, is_active=u.is_active, enterprise_id=u.enterprise_id,
            created_at=u.created_at.isoformat(),
        )
        for u in users_result.scalars().all()
    ]

    user_count_result = await db.execute(
        select(func.count(User.id)).where(User.enterprise_id == enterprise_id)
    )

    return EnterpriseDetail(
        id=ent.id, name=ent.name, country=ent.country,
        tenant_schema=ent.tenant_schema, is_active=ent.is_active,
        is_onboarded=ent.is_onboarded, created_at=ent.created_at.isoformat(),
        user_count=user_count_result.scalar() or 0,
        users=users,
    )


@router.patch("/enterprises/{enterprise_id}", response_model=EnterpriseListItem)
async def update_enterprise(
    enterprise_id: str,
    body: EnterpriseUpdate,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_platform_admin),
):
    result = await db.execute(
        select(Enterprise).where(Enterprise.id == enterprise_id)
    )
    ent = result.scalar_one_or_none()
    if not ent:
        raise HTTPException(status_code=404, detail="Enterprise not found")

    if body.is_active is not None:
        ent.is_active = body.is_active
    if body.name is not None:
        ent.name = body.name
    await db.flush()

    user_count_result = await db.execute(
        select(func.count(User.id)).where(User.enterprise_id == enterprise_id)
    )
    return EnterpriseListItem(
        id=ent.id, name=ent.name, country=ent.country,
        tenant_schema=ent.tenant_schema, is_active=ent.is_active,
        is_onboarded=ent.is_onboarded, created_at=ent.created_at.isoformat(),
        user_count=user_count_result.scalar() or 0,
    )


# ── Users ────────────────────────────────────────────────────

@router.get("/users", response_model=list[PlatformUserItem])
async def list_all_users(
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_platform_admin),
):
    result = await db.execute(
        select(User, Enterprise.name.label("ent_name"))
        .outerjoin(Enterprise, Enterprise.id == User.enterprise_id)
        .order_by(User.created_at.desc())
    )
    items = []
    for row in result.all():
        u = row[0]
        items.append(PlatformUserItem(
            id=u.id, email=u.email, full_name=u.full_name, phone=u.phone,
            role=u.role.value, is_active=u.is_active, enterprise_id=u.enterprise_id,
            enterprise_name=row[1],
            created_at=u.created_at.isoformat(),
        ))
    return items


@router.post("/users/{user_id}/reset-password", response_model=PasswordResetResponse)
async def reset_user_password(
    user_id: str,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_platform_admin),
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    temp_password = secrets.token_urlsafe(12)
    user.hashed_password = hash_password(temp_password)
    await db.flush()

    return PasswordResetResponse(
        user_id=user.id,
        email=user.email,
        temporary_password=temp_password,
    )


@router.post("/users/{user_id}/activate", response_model=PlatformUserItem)
async def activate_user(
    user_id: str,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_platform_admin),
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.is_active = True
    await db.flush()
    return PlatformUserItem(
        id=user.id, email=user.email, full_name=user.full_name, phone=user.phone,
        role=user.role.value, is_active=user.is_active, enterprise_id=user.enterprise_id,
        created_at=user.created_at.isoformat(),
    )


@router.post("/users/{user_id}/deactivate", response_model=PlatformUserItem)
async def deactivate_user(
    user_id: str,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_platform_admin),
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    if user.role == UserRole.PLATFORM_ADMIN:
        raise HTTPException(status_code=400, detail="Cannot deactivate platform admin")
    user.is_active = False
    await db.flush()
    return PlatformUserItem(
        id=user.id, email=user.email, full_name=user.full_name, phone=user.phone,
        role=user.role.value, is_active=user.is_active, enterprise_id=user.enterprise_id,
        created_at=user.created_at.isoformat(),
    )


# ── Impersonate ──────────────────────────────────────────────

@router.post("/impersonate/{user_id}", response_model=ImpersonateResponse)
async def impersonate_user(
    user_id: str,
    db: AsyncSession = Depends(get_db),
    _admin: User = Depends(require_platform_admin),
):
    """Generate a JWT for any user — for troubleshooting their account."""
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    # Resolve enterprise context
    tenant_schema = None
    enterprise_name = None
    if user.enterprise_id:
        ent_result = await db.execute(
            select(Enterprise).where(Enterprise.id == user.enterprise_id)
        )
        ent = ent_result.scalar_one_or_none()
        if ent:
            tenant_schema = ent.tenant_schema
            enterprise_name = ent.name

    permissions = resolve_permissions(user.role.value, user.custom_permissions)

    return ImpersonateResponse(
        access_token=create_access_token(
            user_id=user.id,
            role=user.role.value,
            permissions=permissions,
            tenant_schema=tenant_schema,
        ),
        refresh_token=create_refresh_token(
            user_id=user.id,
            role=user.role.value,
            tenant_schema=tenant_schema,
        ),
        user_email=user.email,
        enterprise_name=enterprise_name,
    )
