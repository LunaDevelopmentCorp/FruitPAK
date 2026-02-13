"""Background task scheduler — runs daily reconciliation for all tenants.

Uses FastAPI's lifespan context to start/stop an asyncio background loop.
No external dependencies (no Celery, no APScheduler) — just a simple
asyncio.sleep loop that fires once per day at the configured hour.

Usage:
    In main.py, replace `app = FastAPI(...)` with:

        from app.services.scheduler import lifespan
        app = FastAPI(lifespan=lifespan, ...)

Configuration:
    RECONCILIATION_HOUR=2   (run at 02:00 UTC daily, via .env)

For production, consider replacing this with:
    - APScheduler + Redis job store (for multi-worker deduplication)
    - Celery Beat (if you already use Celery)
    - pg_cron (if you want the DB to own the schedule)
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
                text(f'SET search_path TO "{tenant_schema}", public')
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


@asynccontextmanager
async def lifespan(app: FastAPI):
    """FastAPI lifespan: start the scheduler on startup, cancel on shutdown."""
    await _ensure_tenant_tables()
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
