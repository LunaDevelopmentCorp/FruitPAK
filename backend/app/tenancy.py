"""Multi-tenancy: schema-per-tenant isolation.

Key components:
  - _tenant_ctx      ContextVar holding the schema name for the current request
  - set / get / clear helpers for the ContextVar
  - validate_schema_name()   prevents SQL injection via schema names
  - create_tenant_schema()   provisions a new schema + all TenantBase tables
  - drop_tenant_schema()     destroys a tenant schema (admin-only, irreversible)
"""

import re
from contextvars import ContextVar

from fastapi import HTTPException, status
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

# ── Request-scoped tenant context ───────────────────────────

_tenant_ctx: ContextVar[str | None] = ContextVar("_tenant_ctx", default=None)


def set_current_tenant_schema(schema: str) -> None:
    _tenant_ctx.set(schema)


def get_current_tenant_schema() -> str:
    """Return the current tenant schema or raise if unset."""
    schema = _tenant_ctx.get()
    if schema is None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No tenant context — this endpoint requires an enterprise-scoped user",
        )
    return schema


def clear_tenant_context() -> None:
    _tenant_ctx.set(None)


# ── Validation ──────────────────────────────────────────────

_SCHEMA_RE = re.compile(r"^tenant_[a-z0-9]{6,36}$")


def validate_schema_name(schema: str) -> str:
    """Ensure schema names are safe for SQL interpolation.

    Only allows the pattern `tenant_<lowercase-alphanum>`.
    """
    if not _SCHEMA_RE.match(schema):
        raise ValueError(f"Invalid tenant schema name: {schema!r}")
    return schema


# ── Schema provisioning ────────────────────────────────────

async def create_tenant_schema(db: AsyncSession, schema: str) -> None:
    """Create a new schema and provision all TenantBase tables inside it.

    Call this once when an enterprise signs up.
    The `schema` arg is the full name, e.g. `tenant_a1b2c3d4e5f6`.
    """
    validate_schema_name(schema)

    # 1. Create the schema
    await db.execute(text(f'CREATE SCHEMA IF NOT EXISTS "{schema}"'))

    # 2. Create all TenantBase tables inside the new schema.
    from app.database import TenantBase

    def _create_tables(sync_conn):
        for table in TenantBase.metadata.tables.values():
            table.schema = schema
        TenantBase.metadata.create_all(bind=sync_conn)
        # Reset schema to None so the MetaData stays neutral
        for table in TenantBase.metadata.tables.values():
            table.schema = None

    conn = await db.connection()
    await conn.run_sync(lambda sync_conn: _create_tables(sync_conn))
    await db.commit()


async def drop_tenant_schema(db: AsyncSession, schema: str) -> None:
    """Drop a tenant schema and all its contents. IRREVERSIBLE."""
    validate_schema_name(schema)
    await db.execute(text(f'DROP SCHEMA IF EXISTS "{schema}" CASCADE'))
    await db.commit()
