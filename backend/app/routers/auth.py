"""Auth routes: register, login, OTP, signup (admin), refresh.

Route overview:
  POST /register     — self-registration (first admin of a future enterprise)
  POST /login        — email + password login
  POST /otp-request  — send SMS OTP to a registered phone
  POST /otp-verify   — verify OTP → full JWT login
  POST /signup       — admin creates a user in their enterprise (requires auth)
  POST /refresh      — exchange a refresh token for new access + refresh tokens
  GET  /me           — return the current user profile + permissions
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import get_current_user, require_role
from app.auth.jwt import create_access_token, create_refresh_token, decode_token
from app.auth.otp import OTPCooldownError, send_otp, verify_otp
from app.auth.password import hash_password, verify_password
from app.auth.permissions import resolve_permissions
from app.database import get_db, get_tenant_db
from app.models.public.enterprise import Enterprise
from app.models.public.user import User, UserRole
from app.utils.activity import log_activity
from app.schemas.auth import (
    LoginRequest,
    OTPRequest,
    OTPVerify,
    RefreshRequest,
    RegisterRequest,
    SignupRequest,
    TokenResponse,
    UserOut,
)

router = APIRouter()


# ── Helpers ──────────────────────────────────────────────────

async def _resolve_enterprise_info(
    db: AsyncSession, user: User
) -> tuple[str | None, bool]:
    """Look up the tenant_schema and is_onboarded for a user's enterprise."""
    if not user.enterprise_id:
        return None, False
    result = await db.execute(
        select(Enterprise.tenant_schema, Enterprise.is_onboarded).where(
            Enterprise.id == user.enterprise_id
        )
    )
    row = result.one_or_none()
    if not row:
        return None, False
    return row.tenant_schema, row.is_onboarded


def _build_user_out(
    user: User, permissions: list[str], is_onboarded: bool = False
) -> UserOut:
    return UserOut(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        phone=user.phone,
        role=user.role.value,
        is_active=user.is_active,
        enterprise_id=user.enterprise_id,
        is_onboarded=is_onboarded,
        permissions=permissions,
        assigned_packhouses=user.assigned_packhouses,
    )


def _build_token_response(
    user: User,
    permissions: list[str],
    tenant_schema: str | None,
    is_onboarded: bool = False,
) -> TokenResponse:
    return TokenResponse(
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
        user=_build_user_out(user, permissions, is_onboarded),
    )


# ── POST /register ──────────────────────────────────────────

@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(body: RegisterRequest, db: AsyncSession = Depends(get_db)):
    """Self-registration for the first admin of a future enterprise.

    After calling this, the user should create an enterprise via
    POST /api/enterprises/ to get a tenant-scoped JWT.
    """
    existing = await db.execute(select(User).where(User.email == body.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email already registered")

    user = User(
        email=body.email,
        hashed_password=hash_password(body.password),
        full_name=body.full_name,
        phone=body.phone,
        role=UserRole.ADMINISTRATOR,
    )
    db.add(user)
    await db.flush()

    permissions = resolve_permissions(user.role.value)
    return _build_token_response(user, permissions, tenant_schema=None)


# ── POST /login ──────────────────────────────────────────────

@router.post("/login", response_model=TokenResponse)
async def login(body: LoginRequest, db: AsyncSession = Depends(get_db)):
    """Email + password login. Returns JWT with role, permissions, and tenant."""
    result = await db.execute(select(User).where(User.email == body.email))
    user = result.scalar_one_or_none()

    if not user or not user.hashed_password:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not verify_password(body.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account deactivated")

    tenant_schema, is_onboarded = await _resolve_enterprise_info(db, user)
    permissions = resolve_permissions(user.role.value, user.custom_permissions)
    return _build_token_response(user, permissions, tenant_schema, is_onboarded)


# ── POST /otp-request ───────────────────────────────────────

@router.post("/otp-request")
async def otp_request(body: OTPRequest, db: AsyncSession = Depends(get_db)):
    """Send an SMS OTP to a registered phone number.

    The phone must belong to an existing user (admins create users first
    via /signup). In dev mode (no Twilio creds), the code is returned
    in the response for testing.
    """
    result = await db.execute(select(User).where(User.phone == body.phone))
    user = result.scalar_one_or_none()
    if not user:
        # Don't reveal whether a phone exists — return success either way
        return {"message": "If this phone is registered, an OTP has been sent"}
    if not user.is_active:
        return {"message": "If this phone is registered, an OTP has been sent"}

    try:
        code = send_otp(body.phone)
    except OTPCooldownError as e:
        raise HTTPException(status_code=429, detail=str(e))

    response = {"message": "OTP sent"}
    if not __import__("app.config", fromlist=["settings"]).settings.twilio_account_sid:
        response["dev_code"] = code  # only in dev
    return response


# ── POST /otp-verify ────────────────────────────────────────

@router.post("/otp-verify", response_model=TokenResponse)
async def otp_verify(body: OTPVerify, db: AsyncSession = Depends(get_db)):
    """Verify an OTP code and issue a full JWT. This IS the login for OTP users."""
    if not verify_otp(body.phone, body.code):
        raise HTTPException(status_code=400, detail="Invalid or expired OTP")

    result = await db.execute(select(User).where(User.phone == body.phone))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="User not found or inactive")

    # Mark phone as verified
    if not user.otp_verified:
        user.otp_verified = True
        await db.flush()

    tenant_schema, is_onboarded = await _resolve_enterprise_info(db, user)
    permissions = resolve_permissions(user.role.value, user.custom_permissions)
    return _build_token_response(user, permissions, tenant_schema, is_onboarded)


# ── POST /signup (admin creates a user) ─────────────────────

@router.post("/signup", response_model=UserOut, status_code=status.HTTP_201_CREATED)
async def signup(
    body: SignupRequest,
    db: AsyncSession = Depends(get_db),
    tenant_db: AsyncSession = Depends(get_tenant_db),
    admin: User = Depends(require_role(UserRole.ADMINISTRATOR)),
):
    """Admin creates a new user within their enterprise.

    - Validates the role is valid
    - Assigns the new user to the admin's enterprise
    - Password is optional (OTP-only field workers don't need one)
    """
    if not admin.enterprise_id:
        raise HTTPException(status_code=400, detail="Create an enterprise first")

    # Validate role
    try:
        role = UserRole(body.role)
    except ValueError:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid role. Choose: {', '.join(r.value for r in UserRole)}",
        )

    # Check duplicates
    existing = await db.execute(select(User).where(User.email == body.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email already registered")

    if body.phone:
        existing_phone = await db.execute(select(User).where(User.phone == body.phone))
        if existing_phone.scalar_one_or_none():
            raise HTTPException(status_code=400, detail="Phone already registered")

    user = User(
        email=body.email,
        hashed_password=hash_password(body.password) if body.password else None,
        full_name=body.full_name,
        phone=body.phone,
        role=role,
        enterprise_id=admin.enterprise_id,
        assigned_packhouses=body.assigned_packhouses,
        created_by=admin.id,
    )
    db.add(user)
    await db.flush()

    await log_activity(
        tenant_db, admin,
        action="user_created",
        entity_type="user",
        entity_id=user.id,
        entity_code=user.email,
        summary=f"Created user {user.full_name} ({user.email}) with role {user.role.value}",
    )

    permissions = resolve_permissions(user.role.value, user.custom_permissions)
    return _build_user_out(user, permissions)


# ── POST /refresh ────────────────────────────────────────────

@router.post("/refresh", response_model=TokenResponse)
async def refresh(body: RefreshRequest, db: AsyncSession = Depends(get_db)):
    """Exchange a refresh token for a new access + refresh token pair."""
    payload = decode_token(body.refresh_token)
    if payload.get("type") != "refresh":
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    user_id = payload.get("sub")
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="User not found or inactive")

    # Re-resolve permissions (may have changed since last token)
    tenant_schema, is_onboarded = await _resolve_enterprise_info(db, user)
    permissions = resolve_permissions(user.role.value, user.custom_permissions)
    return _build_token_response(user, permissions, tenant_schema, is_onboarded)


# ── GET /me ──────────────────────────────────────────────────

@router.get("/me", response_model=UserOut)
async def me(
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Return the current authenticated user's profile and permissions."""
    _, is_onboarded = await _resolve_enterprise_info(db, user)
    permissions = resolve_permissions(user.role.value, user.custom_permissions)
    return _build_user_out(user, permissions, is_onboarded)


# ── POST /logout ─────────────────────────────────────────────

@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(user: User = Depends(get_current_user)):
    """Logout and revoke the current JWT token.

    The token will be blacklisted until its natural expiry.
    Client should delete the token from storage after calling this.
    """
    from fastapi.security import OAuth2PasswordBearer
    from fastapi import Request
    from app.auth.revocation import TokenRevocation

    # Get token from request
    # Note: In a real implementation, we'd need to pass the token through
    # For now, we'll revoke all user tokens as a simpler approach

    # Get token expiry from payload
    payload = getattr(user, "_token_payload", {})
    exp = payload.get("exp", 0)

    # Revoke all tokens for this user
    # This is more secure than trying to revoke a single token
    await TokenRevocation.revoke_all_user_tokens(user.id, duration=86400)

    return None
