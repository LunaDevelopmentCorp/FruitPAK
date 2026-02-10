"""Tenant middleware — resolves tenant context from the JWT on every request.

Flow:
  1. Extract Bearer token from Authorization header
  2. Decode JWT → get `tenant_schema` claim
  3. Validate the schema name
  4. Set ContextVar so downstream code (get_tenant_db, etc.) can read it
  5. After the response, clear the ContextVar

Routes that don't require tenant scope (login, register, health) simply
won't call get_tenant_db(), so having no tenant context is fine for them.
"""

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse, Response

from app.auth.jwt import decode_token
from app.tenancy import (
    clear_tenant_context,
    set_current_tenant_schema,
    validate_schema_name,
)

# Routes that never require auth — don't reject expired tokens here
_PUBLIC_PREFIXES = ("/api/auth/login", "/api/auth/register", "/api/auth/otp", "/docs", "/openapi.json", "/health")


class TenantMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        auth_header = request.headers.get("authorization", "")
        path = request.url.path

        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
            payload = decode_token(token)

            if not payload:
                # Token present but expired/malformed.
                # For protected routes, return 401 immediately so the
                # frontend can redirect to login (instead of a confusing
                # 400 "No tenant context" from get_tenant_db).
                clear_tenant_context()
                if not any(path.startswith(p) for p in _PUBLIC_PREFIXES):
                    return JSONResponse(
                        status_code=401,
                        content={"detail": "Token expired or invalid"},
                        headers={"WWW-Authenticate": "Bearer"},
                    )
            else:
                tenant_schema = payload.get("tenant_schema")
                if tenant_schema:
                    try:
                        validate_schema_name(tenant_schema)
                        set_current_tenant_schema(tenant_schema)
                    except ValueError:
                        clear_tenant_context()
                else:
                    clear_tenant_context()
        else:
            clear_tenant_context()

        try:
            response = await call_next(request)
        finally:
            clear_tenant_context()

        return response
