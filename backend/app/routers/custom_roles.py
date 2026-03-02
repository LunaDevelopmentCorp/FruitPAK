"""Custom role template CRUD.

Endpoints:
    GET    /api/roles              List custom roles + user counts
    GET    /api/roles/builtins     Return built-in role defaults
    GET    /api/roles/permissions  Return permission groups for the UI
    POST   /api/roles              Create a custom role
    PATCH  /api/roles/{id}         Update a custom role
    DELETE /api/roles/{id}         Soft-delete a custom role
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import require_permission
from app.auth.permissions import ALL_PERMISSIONS, PERMISSION_GROUPS, ROLE_DEFAULTS
from app.auth.revocation import TokenRevocation
from app.database import get_db, get_tenant_db
from app.models.public.user import User
from app.models.tenant.custom_role import CustomRole
from app.schemas.custom_role import (
    BuiltinRoleOut,
    CustomRoleCreate,
    CustomRoleOut,
    CustomRoleUpdate,
    PermissionGroupOut,
)

router = APIRouter()


# ── GET /api/roles ─────────────────────────────────────────────

@router.get("", response_model=list[CustomRoleOut])
async def list_custom_roles(
    db: AsyncSession = Depends(get_tenant_db),
    public_db: AsyncSession = Depends(get_db),
    _user: User = Depends(require_permission("roles.read")),
):
    """List all custom roles with user counts."""
    result = await db.execute(
        select(CustomRole).order_by(CustomRole.name)
    )
    roles = result.scalars().all()

    # Count users assigned to each custom role
    role_ids = [r.id for r in roles]
    user_counts: dict[str, int] = {}
    if role_ids:
        count_result = await public_db.execute(
            select(User.custom_role_id, func.count())
            .where(
                User.custom_role_id.in_(role_ids),
                User.enterprise_id == _user.enterprise_id,
            )
            .group_by(User.custom_role_id)
        )
        user_counts = {row[0]: row[1] for row in count_result.all()}

    return [
        CustomRoleOut(
            id=r.id,
            name=r.name,
            description=r.description,
            permissions=r.permissions or [],
            is_system=r.is_system,
            is_active=r.is_active,
            user_count=user_counts.get(r.id, 0),
            created_at=r.created_at,
        )
        for r in roles
    ]


# ── GET /api/roles/builtins ───────────────────────────────────

@router.get("/builtins", response_model=list[BuiltinRoleOut])
async def get_builtin_roles(
    _user: User = Depends(require_permission("roles.read")),
):
    """Return the 4 built-in role defaults (for the 'start from' dropdown)."""
    return [
        BuiltinRoleOut(role=role, permissions=sorted(perms))
        for role, perms in ROLE_DEFAULTS.items()
    ]


# ── GET /api/roles/permissions ────────────────────────────────

@router.get("/permissions", response_model=list[PermissionGroupOut])
async def get_permission_groups(
    _user: User = Depends(require_permission("roles.read")),
):
    """Return permission groups for the UI matrix."""
    return [
        PermissionGroupOut(group=group, permissions=perms)
        for group, perms in PERMISSION_GROUPS.items()
    ]


# ── POST /api/roles ───────────────────────────────────────────

@router.post("", response_model=CustomRoleOut, status_code=201)
async def create_custom_role(
    body: CustomRoleCreate,
    db: AsyncSession = Depends(get_tenant_db),
    _user: User = Depends(require_permission("roles.manage")),
):
    """Create a new custom role template."""
    # Validate permissions
    invalid = [p for p in body.permissions if p not in ALL_PERMISSIONS]
    if invalid:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid permissions: {', '.join(invalid)}",
        )

    # Check unique name
    existing = await db.execute(
        select(CustomRole).where(CustomRole.name == body.name)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Role name already exists")

    role = CustomRole(
        name=body.name,
        description=body.description,
        permissions=sorted(body.permissions),
    )
    db.add(role)
    await db.flush()

    return CustomRoleOut(
        id=role.id,
        name=role.name,
        description=role.description,
        permissions=role.permissions or [],
        is_system=role.is_system,
        is_active=role.is_active,
        user_count=0,
        created_at=role.created_at,
    )


# ── PATCH /api/roles/{role_id} ────────────────────────────────

@router.patch("/{role_id}", response_model=CustomRoleOut)
async def update_custom_role(
    role_id: str,
    body: CustomRoleUpdate,
    db: AsyncSession = Depends(get_tenant_db),
    public_db: AsyncSession = Depends(get_db),
    _user: User = Depends(require_permission("roles.manage")),
):
    """Update a custom role. Revokes tokens of assigned users on permission change."""
    result = await db.execute(
        select(CustomRole).where(CustomRole.id == role_id)
    )
    role = result.scalar_one_or_none()
    if not role:
        raise HTTPException(status_code=404, detail="Custom role not found")

    if role.is_system:
        raise HTTPException(status_code=400, detail="Cannot modify system roles")

    permissions_changed = False

    if body.name is not None:
        # Check unique name
        dup = await db.execute(
            select(CustomRole).where(
                CustomRole.name == body.name,
                CustomRole.id != role_id,
            )
        )
        if dup.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="Role name already exists")
        role.name = body.name

    if body.description is not None:
        role.description = body.description

    if body.permissions is not None:
        invalid = [p for p in body.permissions if p not in ALL_PERMISSIONS]
        if invalid:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid permissions: {', '.join(invalid)}",
            )
        if sorted(body.permissions) != sorted(role.permissions or []):
            permissions_changed = True
        role.permissions = sorted(body.permissions)

    if body.is_active is not None:
        role.is_active = body.is_active

    await db.flush()

    # If permissions changed, revoke tokens of all users with this role
    if permissions_changed:
        users_result = await public_db.execute(
            select(User.id).where(
                User.custom_role_id == role_id,
                User.enterprise_id == _user.enterprise_id,
            )
        )
        for (uid,) in users_result.all():
            await TokenRevocation.revoke_all_user_tokens(uid)

    # Count users
    count_result = await public_db.execute(
        select(func.count()).select_from(User).where(
            User.custom_role_id == role_id,
            User.enterprise_id == _user.enterprise_id,
        )
    )
    user_count = count_result.scalar() or 0

    return CustomRoleOut(
        id=role.id,
        name=role.name,
        description=role.description,
        permissions=role.permissions or [],
        is_system=role.is_system,
        is_active=role.is_active,
        user_count=user_count,
        created_at=role.created_at,
    )


# ── DELETE /api/roles/{role_id} ───────────────────────────────

@router.delete("/{role_id}", status_code=204)
async def delete_custom_role(
    role_id: str,
    db: AsyncSession = Depends(get_tenant_db),
    public_db: AsyncSession = Depends(get_db),
    _user: User = Depends(require_permission("roles.manage")),
):
    """Soft-delete a custom role. Blocks if users are still assigned."""
    result = await db.execute(
        select(CustomRole).where(CustomRole.id == role_id)
    )
    role = result.scalar_one_or_none()
    if not role:
        raise HTTPException(status_code=404, detail="Custom role not found")

    if role.is_system:
        raise HTTPException(status_code=400, detail="Cannot delete system roles")

    # Check if any users are assigned
    count_result = await public_db.execute(
        select(func.count()).select_from(User).where(
            User.custom_role_id == role_id,
            User.enterprise_id == _user.enterprise_id,
        )
    )
    user_count = count_result.scalar() or 0
    if user_count > 0:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot delete role — {user_count} user(s) are still assigned to it",
        )

    role.is_active = False
    await db.flush()
    return None
