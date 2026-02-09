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
from starlette.responses import Response

from app.auth.jwt import decode_token
from app.tenancy import (
    clear_tenant_context,
    set_current_tenant_schema,
    validate_schema_name,
)


class TenantMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next) -> Response:
        # Try to extract tenant from JWT — fail silently for public routes
        tenant_schema = self._extract_tenant(request)
        if tenant_schema:
            try:
                validate_schema_name(tenant_schema)
                set_current_tenant_schema(tenant_schema)
            except ValueError:
                # Malformed schema in token — treat as no tenant
                clear_tenant_context()
        else:
            clear_tenant_context()

        try:
            response = await call_next(request)
        finally:
            clear_tenant_context()

        return response

    @staticmethod
    def _extract_tenant(request: Request) -> str | None:
        auth_header = request.headers.get("authorization", "")
        if not auth_header.startswith("Bearer "):
            return None

        token = auth_header[7:]
        payload = decode_token(token)
        return payload.get("tenant_schema")
