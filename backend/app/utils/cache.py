"""Redis caching utilities for FruitPAK.

Provides decorators and functions for caching expensive database queries.
Uses Redis for distributed caching across multiple backend instances.
"""

import functools
import hashlib
import json
import logging
from datetime import date, datetime
from typing import Any, Callable, Optional

import redis.asyncio as redis
from app.config import settings
from app.tenancy import _tenant_ctx

logger = logging.getLogger(__name__)

# Global Redis connection pool
_redis_client: Optional[redis.Redis] = None


async def get_redis() -> redis.Redis:
    """Get or create Redis client connection."""
    global _redis_client
    if _redis_client is None:
        _redis_client = redis.from_url(
            settings.redis_url,
            encoding="utf-8",
            decode_responses=True,
            max_connections=50,
        )
    return _redis_client


async def close_redis():
    """Close Redis connection (call on app shutdown)."""
    global _redis_client
    if _redis_client:
        await _redis_client.close()
        _redis_client = None


def cache_key(*args, **kwargs) -> str:
    """Generate a cache key from function arguments.

    Creates a deterministic hash from function name and arguments.
    """
    # Handle empty args/kwargs
    if not args and not kwargs:
        return "default"

    key_data = json.dumps({"args": args, "kwargs": kwargs}, sort_keys=True)
    key_hash = hashlib.md5(key_data.encode()).hexdigest()
    return key_hash


def cached(
    ttl: int = 300,
    prefix: str = "cache",
    key_builder: Optional[Callable] = None,
):
    """Decorator to cache function results in Redis.

    Args:
        ttl: Time-to-live in seconds (default: 300 = 5 minutes)
        prefix: Cache key prefix for namespacing
        key_builder: Custom function to build cache key from args/kwargs

    Example:
        @cached(ttl=300, prefix="growers")
        async def list_growers(db: AsyncSession, limit: int = 50):
            # ... expensive query ...
            return results

    Cache keys: {prefix}:{function_name}:{args_hash}
    """

    def decorator(func: Callable) -> Callable:
        @functools.wraps(func)
        async def wrapper(*args, **kwargs):
            # Build cache key — always include tenant schema for isolation
            tenant = _tenant_ctx.get()  # None when outside tenant context
            if key_builder:
                key = key_builder(*args, **kwargs)
                if tenant:
                    key = f"t:{tenant}:{key}"
            else:
                # Filter kwargs to only include simple types for cache key
                # Exclude dependency-injected objects (User, AsyncSession, etc.)
                cache_kwargs = {}
                for k, v in kwargs.items():
                    if k.startswith("_"):
                        continue
                    if isinstance(v, (int, str, bool, float, type(None))):
                        cache_kwargs[k] = v
                    elif isinstance(v, (date, datetime)):
                        cache_kwargs[k] = v.isoformat()
                # Skip all args (they're usually injected dependencies)
                key_hash = cache_key(**cache_kwargs)
                if tenant:
                    key = f"t:{tenant}:{prefix}:{func.__name__}:{key_hash}"
                else:
                    key = f"{prefix}:{func.__name__}:{key_hash}"

            try:
                # Try to get from cache
                redis_client = await get_redis()
                cached_value = await redis_client.get(key)

                if cached_value:
                    logger.debug(f"Cache HIT: {key}")
                    return json.loads(cached_value)

                logger.debug(f"Cache MISS: {key}")

                # Execute function and cache result
                result = await func(*args, **kwargs)

                # Serialize result (handle Pydantic models)
                if hasattr(result, "model_dump"):
                    # Single Pydantic model
                    serialized = result.model_dump(mode="json")
                elif isinstance(result, list) and len(result) > 0:
                    # List of Pydantic models or dicts
                    if hasattr(result[0], "model_dump"):
                        serialized = [item.model_dump(mode="json") for item in result]
                    else:
                        serialized = result
                elif isinstance(result, dict):
                    # Already a dict
                    serialized = result
                else:
                    # Primitive type
                    serialized = result

                # Store in cache with TTL
                await redis_client.setex(
                    key,
                    ttl,
                    json.dumps(serialized),
                )

                return result

            except redis.RedisError as e:
                # If Redis fails, log and continue without caching
                logger.warning(f"Redis error (falling back to uncached): {e}")
                return await func(*args, **kwargs)

        return wrapper

    return decorator


async def invalidate_cache(pattern: str):
    """Invalidate cache keys matching a pattern, scoped to the current tenant.

    Automatically prepends the tenant prefix so callers don't need to know
    about the key structure.  If no tenant context is active, the pattern
    is used as-is (for public-scope invalidation).

    Args:
        pattern: Redis key pattern (e.g., "growers:*")

    Example:
        await invalidate_cache("growers:*")  # Clears current tenant's grower caches
    """
    try:
        tenant = _tenant_ctx.get()
        scoped_pattern = f"t:{tenant}:{pattern}" if tenant else pattern

        redis_client = await get_redis()
        keys = []
        async for key in redis_client.scan_iter(match=scoped_pattern):
            keys.append(key)

        if keys:
            await redis_client.delete(*keys)
            logger.info(f"Invalidated {len(keys)} cache keys matching {scoped_pattern}")
    except redis.RedisError as e:
        logger.warning(f"Failed to invalidate cache: {e}")


async def clear_all_cache():
    """Clear ALL cache keys (use with caution)."""
    try:
        redis_client = await get_redis()
        await redis_client.flushdb()
        logger.info("Cleared all cache")
    except redis.RedisError as e:
        logger.warning(f"Failed to clear cache: {e}")


# ── Cache warming utilities ─────────────────────────────────────

async def warm_cache(func: Callable, *args, **kwargs):
    """Pre-populate cache by calling a cached function.

    Useful for warming frequently accessed data after deployment.
    """
    try:
        await func(*args, **kwargs)
        logger.info(f"Cache warmed for {func.__name__}")
    except Exception as e:
        logger.error(f"Failed to warm cache for {func.__name__}: {e}")
