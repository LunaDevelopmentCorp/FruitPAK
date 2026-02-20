"""Database engine, session factories, and base classes.

Two separate DeclarativeBase classes:
  - PublicBase  → tables in the `public` schema (enterprises, users)
  - TenantBase  → tables duplicated into every tenant schema (packhouses, growers, …)

Two session dependencies for FastAPI:
  - get_db()         → public schema (auth, enterprise lookup)
  - get_tenant_db()  → sets search_path to the current tenant schema
"""

from sqlalchemy import text
from sqlalchemy.ext.asyncio import (
    AsyncSession,
    create_async_engine,
    async_sessionmaker,
)
from sqlalchemy.orm import DeclarativeBase

from app.config import settings

engine = create_async_engine(
    settings.database_url,
    echo=settings.debug,
    pool_size=20,
    max_overflow=10,
)

async_session = async_sessionmaker(
    engine, class_=AsyncSession, expire_on_commit=False
)


# ── Base classes ────────────────────────────────────────────

class PublicBase(DeclarativeBase):
    """Models that live in the `public` schema only."""
    pass


class TenantBase(DeclarativeBase):
    """Models duplicated per tenant schema."""
    pass


# Keep backward compat alias — existing Alembic env.py imports Base
Base = PublicBase


# ── Session dependencies ────────────────────────────────────

async def get_db() -> AsyncSession:
    """Yield a session pinned to the public schema."""
    async with async_session() as session:
        # Explicitly pin to public so a stale search_path can't leak
        await session.execute(text("SET search_path TO public"))
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def get_tenant_db() -> AsyncSession:
    """Yield a session pinned to the current tenant's schema.

    Reads the tenant schema name from the request-scoped ContextVar.
    Raises 400 if no tenant context is set (i.e. the route requires
    tenant scope but no valid tenant was resolved from the JWT).
    """
    from app.tenancy import get_current_tenant_schema  # deferred to avoid circular

    schema = get_current_tenant_schema()  # raises if missing

    async with async_session() as session:
        await session.execute(
            text(f'SET search_path TO "{schema}", pg_catalog')
        )
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            # Reset to public so the pooled connection doesn't leak tenant scope
            await session.execute(text("SET search_path TO public"))
