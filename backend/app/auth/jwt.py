"""JWT token creation and decoding.

Token claims:
  - sub:            user ID
  - role:           user role string
  - permissions:    list of effective permission strings
  - tenant_schema:  PostgreSQL schema name (if user belongs to an enterprise)
  - type:           "access" | "refresh"
  - exp:            expiry timestamp
"""

from datetime import datetime, timedelta, timezone

from jose import JWTError, jwt

from app.config import settings

ALGORITHM = settings.jwt_algorithm


def create_access_token(
    user_id: str,
    role: str,
    permissions: list[str],
    tenant_schema: str | None = None,
    expires_delta: timedelta | None = None,
) -> str:
    expire = datetime.now(timezone.utc) + (
        expires_delta or timedelta(minutes=settings.access_token_expire_minutes)
    )
    payload = {
        "sub": user_id,
        "role": role,
        "permissions": permissions,
        "type": "access",
        "exp": expire,
    }
    if tenant_schema:
        payload["tenant_schema"] = tenant_schema
    return jwt.encode(payload, settings.secret_key, algorithm=ALGORITHM)


def create_refresh_token(
    user_id: str,
    role: str,
    tenant_schema: str | None = None,
) -> str:
    expire = datetime.now(timezone.utc) + timedelta(days=settings.refresh_token_expire_days)
    payload = {
        "sub": user_id,
        "role": role,
        "type": "refresh",
        "exp": expire,
    }
    if tenant_schema:
        payload["tenant_schema"] = tenant_schema
    return jwt.encode(payload, settings.secret_key, algorithm=ALGORITHM)


def decode_token(token: str) -> dict:
    """Decode and validate a JWT. Returns empty dict on failure."""
    try:
        return jwt.decode(token, settings.secret_key, algorithms=[ALGORITHM])
    except JWTError:
        return {}
