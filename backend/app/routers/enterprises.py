import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import get_current_user
from app.auth.jwt import create_access_token, create_refresh_token
from app.auth.permissions import resolve_permissions
from app.database import get_db
from app.models.public.enterprise import Enterprise
from app.models.public.user import User, UserRole
from app.schemas.auth import TokenResponse, UserOut
from app.schemas.enterprise import EnterpriseCreate, EnterpriseOut
from app.tenancy import create_tenant_schema

router = APIRouter()


def _build_user_out(user: User, permissions: list[str]) -> UserOut:
    return UserOut(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        phone=user.phone,
        role=user.role.value,
        is_active=user.is_active,
        enterprise_id=user.enterprise_id,
        permissions=permissions,
        assigned_packhouses=user.assigned_packhouses,
    )


@router.post("/", response_model=EnterpriseOut, status_code=status.HTTP_201_CREATED)
async def onboard_enterprise(
    body: EnterpriseCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Sign up a new enterprise: create public record + provision tenant schema."""
    if user.enterprise_id:
        raise HTTPException(status_code=400, detail="User already belongs to an enterprise")

    tenant_id = uuid.uuid4().hex[:12]
    schema_name = f"tenant_{tenant_id}"

    enterprise = Enterprise(
        name=body.name,
        country=body.country,
        tenant_schema=schema_name,
    )
    db.add(enterprise)
    await db.flush()

    user.enterprise_id = enterprise.id
    user.role = UserRole.ADMINISTRATOR
    await db.flush()

    await create_tenant_schema(db, schema_name)

    return enterprise


@router.post("/reissue-token", response_model=TokenResponse)
async def reissue_token(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """After enterprise creation, get a JWT that includes the tenant_schema claim."""
    if not user.enterprise_id:
        raise HTTPException(status_code=400, detail="User has no enterprise")

    result = await db.execute(
        select(Enterprise).where(Enterprise.id == user.enterprise_id)
    )
    enterprise = result.scalar_one_or_none()
    if not enterprise:
        raise HTTPException(status_code=404, detail="Enterprise not found")

    permissions = resolve_permissions(user.role.value, user.custom_permissions)

    return TokenResponse(
        access_token=create_access_token(
            user_id=user.id,
            role=user.role.value,
            permissions=permissions,
            tenant_schema=enterprise.tenant_schema,
        ),
        refresh_token=create_refresh_token(
            user_id=user.id,
            role=user.role.value,
            tenant_schema=enterprise.tenant_schema,
        ),
        user=_build_user_out(user, permissions),
    )
