"""Health check endpoints for load balancers and monitoring."""

import logging
import os
import time
from datetime import datetime

from fastapi import APIRouter, status
from sqlalchemy import text

from app.database import engine

logger = logging.getLogger("fruitpak.health")

router = APIRouter(tags=["health"])

_start_time = time.monotonic()


@router.get("/health")
async def health_check():
    """Lightweight health check for load balancer (no DB/Redis check).

    Returns 200 OK if the service is running.
    Use this for frequent health checks to avoid overloading dependencies.
    """
    return {
        "status": "ok",
        "service": "FruitPAK",
        "timestamp": datetime.utcnow().isoformat(),
        "environment": os.getenv("ENVIRONMENT", "development"),
    }


@router.get("/health/ready")
async def readiness_check():
    """Comprehensive readiness check (includes DB and Redis).

    Returns 200 OK only if all dependencies are healthy.
    Use this for initial deployment readiness checks.
    """
    checks = {
        "service": "ok",
        "database": "unknown",
        "redis": "unknown",
    }
    overall_healthy = True

    # Check database connection
    try:
        async with engine.connect() as conn:
            await conn.execute(text("SELECT 1"))
        checks["database"] = "ok"
    except Exception:
        logger.exception("Health check: database connection failed")
        checks["database"] = "error"
        overall_healthy = False

    # Check Redis connection
    try:
        import redis.asyncio as redis
        from app.config import settings

        redis_client = redis.from_url(settings.redis_url, decode_responses=True)
        await redis_client.ping()
        await redis_client.close()
        checks["redis"] = "ok"
    except Exception:
        logger.exception("Health check: Redis connection failed")
        checks["redis"] = "error"
        overall_healthy = False

    return_status = status.HTTP_200_OK if overall_healthy else status.HTTP_503_SERVICE_UNAVAILABLE

    return {
        "status": "healthy" if overall_healthy else "unhealthy",
        "service": "FruitPAK",
        "checks": checks,
        "timestamp": datetime.utcnow().isoformat(),
    }, return_status


@router.get("/metrics")
async def metrics():
    """Application metrics for monitoring dashboards.

    Exposes DB pool stats, Redis health, and uptime.
    Protected in production by disabling docs — access via internal network only.
    """
    pool = engine.pool.status()  # type: ignore[union-attr]
    pool_size = engine.pool.size()  # type: ignore[union-attr]
    pool_overflow = engine.pool.overflow()  # type: ignore[union-attr]
    pool_checkedin = engine.pool.checkedin()  # type: ignore[union-attr]
    pool_checkedout = engine.pool.checkedout()  # type: ignore[union-attr]

    redis_ok = False
    try:
        from app.utils.cache import get_redis
        r = await get_redis()
        await r.ping()
        redis_ok = True
    except Exception:
        pass

    # Cache hit/miss metrics
    from app.utils.cache import get_cache_metrics
    cache_stats = get_cache_metrics()

    return {
        "uptime_seconds": round(time.monotonic() - _start_time, 1),
        "database": {
            "pool_size": pool_size,
            "pool_overflow": pool_overflow,
            "connections_in_use": pool_checkedout,
            "connections_idle": pool_checkedin,
            "pool_status": pool,
        },
        "redis": {
            "connected": redis_ok,
        },
        "cache": cache_stats,
        "timestamp": datetime.utcnow().isoformat(),
    }
