from pydantic import BaseModel, EmailStr


# ── Signup (admin creates a user) ───────────────────────────

class SignupRequest(BaseModel):
    """Admin creates a new user within their enterprise."""
    email: EmailStr
    password: str | None = None   # optional: OTP-only users skip password
    full_name: str
    phone: str | None = None
    role: str = "operator"        # administrator | supervisor | operator
    assigned_packhouses: list[str] | None = None


class UserOut(BaseModel):
    id: str
    email: str
    full_name: str
    phone: str | None
    role: str
    is_active: bool
    enterprise_id: str | None
    is_onboarded: bool = False
    permissions: list[str]
    assigned_packhouses: list[str] | None
    preferred_language: str = "en"

    model_config = {"from_attributes": True}


# ── Self-registration (first admin of a new enterprise) ─────

class RegisterRequest(BaseModel):
    """First user registers themselves (becomes admin on enterprise creation)."""
    email: EmailStr
    password: str
    full_name: str
    phone: str | None = None


# ── Login ────────────────────────────────────────────────────

class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: UserOut


# ── OTP ──────────────────────────────────────────────────────

class OTPRequest(BaseModel):
    """Request an OTP code sent to a phone number."""
    phone: str


class OTPVerify(BaseModel):
    """Submit the OTP code to log in via phone."""
    phone: str
    code: str


# ── Token refresh ────────────────────────────────────────────

class RefreshRequest(BaseModel):
    refresh_token: str
