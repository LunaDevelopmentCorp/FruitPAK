"""FastAPI dependencies for authentication and authorization.

Dependencies:
  get_current_user       → decode JWT, load user from DB, return User
  get_current_tenant     → return tenant_schema from JWT (or raise)
  require_role(...)      → restrict to specific roles
  require_permission(...) → restrict to specific granular permissions
"""

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.jwt import decode_token
from app.auth.permissions import has_permission
from app.database import get_db
from app.models.public.enterprise import Enterprise
from app.models.public.user import User, UserRole

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


# ── Core user dependency ────────────────────────────────────

async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Decode the JWT, load the user from the public schema, and return it.

    Also stashes the decoded payload on the user object as `_token_payload`
    so downstream deps can read claims (permissions, tenant) without
    re-decoding.
    """
    payload = decode_token(token)
    user_id: str | None = payload.get("sub")
    if not user_id or payload.get("type") != "access":
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Check if token is revoked
    from app.auth.revocation import TokenRevocation
    if await TokenRevocation.is_revoked(token):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has been revoked",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Check if all user tokens are revoked (password change, etc.)
    if await TokenRevocation.is_user_revoked(user_id):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Session expired. Please log in again.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="User not found or inactive",
        )

    # Stash token payload for downstream deps
    user._token_payload = payload  # type: ignore[attr-defined]
    return user


# ── Tenant context from JWT ─────────────────────────────────

async def get_current_tenant(
    user: User = Depends(get_current_user),
) -> str:
    """Return the tenant_schema from the JWT claims.

    Raises 403 if the user doesn't belong to an enterprise yet.
    """
    payload: dict = getattr(user, "_token_payload", {})
    schema = payload.get("tenant_schema")
    if not schema:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No enterprise context — create or join an enterprise first",
        )
    return schema


# ── Role-based access control ───────────────────────────────

def require_role(*roles: UserRole):
    """Dependency factory — restrict to one or more roles.

    Usage:
        @router.get("/admin-only")
        async def admin_view(user: User = Depends(require_role(UserRole.ADMINISTRATOR))):
            ...
    """
    async def _check(user: User = Depends(get_current_user)) -> User:
        if user.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Requires role: {', '.join(r.value for r in roles)}",
            )
        return user

    return _check


# ── Permission-based access control ─────────────────────────

async def require_onboarded(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> User:
    """Ensure the user's enterprise has completed the onboarding wizard.

    Raises HTTP 403 if enterprise is not yet onboarded.
    """
    if not user.enterprise_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No enterprise context — create or join an enterprise first",
        )
    result = await db.execute(
        select(Enterprise).where(Enterprise.id == user.enterprise_id)
    )
    enterprise = result.scalar_one_or_none()
    if not enterprise or not enterprise.is_onboarded:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Complete onboarding wizard first",
        )
    return user


async def require_platform_admin(
    user: User = Depends(get_current_user),
) -> User:
    """Restrict endpoint to platform admins only."""
    if user.role != UserRole.PLATFORM_ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Platform admin access required",
        )
    return user


def require_permission(*perms: str):
    """Dependency factory — restrict to users who hold ALL listed permissions.

    Reads permissions from the JWT claims (embedded at login), so this is
    a zero-DB-hit check for the hot path.

    Usage:
        @router.post("/lots")
        async def create_lot(user: User = Depends(require_permission("lot.write"))):
            ...

        @router.get("/financials")
        async def view_financials(
            user: User = Depends(require_permission("financials.read")),
        ):
            ...
    """
    async def _check(user: User = Depends(get_current_user)) -> User:
        payload: dict = getattr(user, "_token_payload", {})
        user_perms: list[str] = payload.get("permissions", [])

        missing = [p for p in perms if not has_permission(user_perms, p)]
        if missing:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Missing permissions: {', '.join(missing)}",
            )
        return user

    return _check
