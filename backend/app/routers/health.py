"""Health check endpoints for load balancers and monitoring."""

import os
from datetime import datetime

from fastapi import APIRouter, status
from sqlalchemy import text

from app.database import engine

router = APIRouter(tags=["health"])


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
    except Exception as e:
        checks["database"] = f"error: {str(e)[:100]}"
        overall_healthy = False

    # Check Redis connection
    try:
        import redis.asyncio as redis
        from app.config import settings

        redis_client = redis.from_url(settings.redis_url, decode_responses=True)
        await redis_client.ping()
        await redis_client.close()
        checks["redis"] = "ok"
    except Exception as e:
        checks["redis"] = f"error: {str(e)[:100]}"
        overall_healthy = False

    return_status = status.HTTP_200_OK if overall_healthy else status.HTTP_503_SERVICE_UNAVAILABLE

    return {
        "status": "healthy" if overall_healthy else "unhealthy",
        "service": "FruitPAK",
        "checks": checks,
        "timestamp": datetime.utcnow().isoformat(),
    }, return_status
