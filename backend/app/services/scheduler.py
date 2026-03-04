"""Background task scheduler — runs daily reconciliation for all tenants.

Uses FastAPI's lifespan context to start/stop an asyncio background loop.
Uses Redis distributed lock to ensure only one instance runs reconciliation
in multi-worker deployments.

Usage:
    In main.py, replace `app = FastAPI(...)` with:

        from app.services.scheduler import lifespan
        app = FastAPI(lifespan=lifespan, ...)

Configuration:
    RECONCILIATION_HOUR=2   (run at 02:00 UTC daily, via .env)
"""

import asyncio
import logging
from contextlib import asynccontextmanager
from datetime import datetime, timezone

from fastapi import FastAPI
from sqlalchemy import select, text

from app.config import settings
from app.database import async_session
from app.models.public.enterprise import Enterprise

logger = logging.getLogger("fruitpak.scheduler")


async def _run_reconciliation_for_tenant(tenant_schema: str) -> dict | None:
    """Run reconciliation for a single tenant schema."""
    from app.services.reconciliation import run_full_reconciliation

    try:
        async with async_session() as db:
            await db.execute(
                text(f'SET search_path TO "{tenant_schema}", pg_catalog')
            )
            try:
                summary = await run_full_reconciliation(db)
                await db.commit()
                return summary
            except Exception:
                await db.rollback()
                raise
            finally:
                await db.execute(text("SET search_path TO public"))
    except Exception:
        logger.exception("Reconciliation failed for tenant %s", tenant_schema)
        return None


async def run_daily_reconciliation() -> None:
    """Iterate over all active tenants and run reconciliation for each."""
    logger.info("Starting daily reconciliation run")

    async with async_session() as db:
        await db.execute(text("SET search_path TO public"))
        result = await db.execute(
            select(Enterprise.tenant_schema).where(
                Enterprise.is_active == True  # noqa: E712
            )
        )
        schemas = [row[0] for row in result.all()]

    logger.info("Found %d active tenants", len(schemas))

    for schema in schemas:
        logger.info("Running reconciliation for %s", schema)
        summary = await _run_reconciliation_for_tenant(schema)
        if summary:
            logger.info(
                "Tenant %s: %d alerts (critical=%d, high=%d)",
                schema,
                summary["total_alerts"],
                summary["by_severity"].get("critical", 0),
                summary["by_severity"].get("high", 0),
            )

    logger.info("Daily reconciliation complete for %d tenants", len(schemas))


async def _scheduler_loop() -> None:
    """Sleep loop that fires reconciliation once per day.

    Calculates seconds until the next target hour (default 02:00 UTC)
    and sleeps until then.  After running, sleeps for ~24h again.
    """
    target_hour = getattr(settings, "reconciliation_hour", 2)

    while True:
        now = datetime.now(timezone.utc)
        # Next run: today or tomorrow at target_hour:00 UTC
        next_run = now.replace(hour=target_hour, minute=0, second=0, microsecond=0)
        if next_run <= now:
            # Already past today's target, schedule for tomorrow
            next_run = next_run.replace(day=next_run.day + 1)

        wait_seconds = (next_run - now).total_seconds()
        logger.info(
            "Next reconciliation run at %s (in %.0f seconds)",
            next_run.isoformat(),
            wait_seconds,
        )

        await asyncio.sleep(wait_seconds)

        # Distributed lock: only one instance runs reconciliation
        try:
            from app.utils.cache import get_redis
            redis_client = await get_redis()
            lock_key = f"fruitpak:reconciliation:lock:{now.strftime('%Y-%m-%d')}"
            acquired = await redis_client.set(
                lock_key, "1", nx=True, ex=7200  # 2h TTL
            )
            if not acquired:
                logger.info("Another instance holds the reconciliation lock, skipping")
                await asyncio.sleep(60)
                continue
        except Exception:
            logger.warning("Redis unavailable for distributed lock, proceeding anyway")

        try:
            await run_daily_reconciliation()
        except Exception:
            logger.exception("Unhandled error in daily reconciliation")

        # Small buffer to avoid running twice in the same minute
        await asyncio.sleep(60)


async def _ensure_tenant_tables():
    """Create any missing TenantBase tables in all existing tenant schemas.

    Runs once at startup so that new models (e.g. box_sizes, pallet_types)
    are provisioned for tenants created before those models existed.
    """
    from app.database import TenantBase, engine
    from sqlalchemy import text

    async with engine.begin() as conn:
        result = await conn.execute(
            text("SELECT schema_name FROM information_schema.schemata WHERE schema_name LIKE 'tenant_%'")
        )
        schemas = [row[0] for row in result.fetchall()]

    for schema in schemas:
        async with engine.begin() as conn:
            def _sync_create(sync_conn):
                for table in TenantBase.metadata.tables.values():
                    table.schema = schema
                TenantBase.metadata.create_all(bind=sync_conn, checkfirst=True)
                for table in TenantBase.metadata.tables.values():
                    table.schema = None
            await conn.run_sync(_sync_create)
        logger.info("Ensured tables for schema %s", schema)


async def _warm_caches():
    """Pre-populate Redis cache for config/reference endpoints on startup.

    Iterates all active tenant schemas and calls the cached list functions
    so the first real request hits warm cache instead of cold DB.
    """
    from app.tenancy import set_current_tenant_schema, clear_tenant_context

    # Import cached list functions
    from app.routers.config import list_bin_types, list_product_configs, list_fruit_types, list_box_sizes
    from app.routers.shipping_lines import list_shipping_lines
    from app.routers.transporters import list_transporters
    from app.routers.shipping_agents import list_shipping_agents

    async with async_session() as db:
        await db.execute(text("SET search_path TO public"))
        result = await db.execute(
            select(Enterprise.tenant_schema).where(Enterprise.is_active == True)  # noqa: E712
        )
        schemas = [row[0] for row in result.all()]

    for schema in schemas:
        set_current_tenant_schema(schema)
        try:
            async with async_session() as db:
                await db.execute(
                    text(f'SET search_path TO "{schema}", pg_catalog')
                )
                # Warm config endpoints
                for fn in [list_bin_types, list_product_configs, list_fruit_types, list_box_sizes]:
                    try:
                        await fn(db=db, _user=None)
                    except Exception:
                        pass  # non-critical — skip on error
                # Warm shipping/transporter/agent endpoints
                for fn in [list_shipping_lines, list_transporters, list_shipping_agents]:
                    try:
                        await fn(db=db, _user=None)
                    except Exception:
                        pass
            logger.info("Cache warmed for %s", schema)
        finally:
            clear_tenant_context()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """FastAPI lifespan: start the scheduler on startup, cancel on shutdown."""
    await _ensure_tenant_tables()
    await _warm_caches()
    task = asyncio.create_task(_scheduler_loop())
    logger.info("Reconciliation scheduler started")
    try:
        yield
    finally:
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass
        logger.info("Reconciliation scheduler stopped")
