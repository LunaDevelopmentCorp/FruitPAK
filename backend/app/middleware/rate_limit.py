"""Rate limiting middleware using Redis.

Protects endpoints from abuse with configurable per-user and per-IP limits.
Uses sliding window algorithm for accurate rate limiting.
"""

import time
from typing import Callable, Optional

from fastapi import HTTPException, Request, Response, status
from starlette.middleware.base import BaseHTTPMiddleware

from app.utils.cache import get_redis


class RateLimitMiddleware(BaseHTTPMiddleware):
    """Rate limiting middleware with Redis backend.

    Features:
    - Per-user rate limits (authenticated requests)
    - Per-IP rate limits (unauthenticated requests)
    - Sliding window algorithm
    - Configurable limits per endpoint pattern
    """

    def __init__(
        self,
        app,
        default_limit: int = 100,  # requests
        default_window: int = 60,  # seconds
        exempt_paths: Optional[list[str]] = None,
    ):
        super().__init__(app)
        self.default_limit = default_limit
        self.default_window = default_window
        self.exempt_paths = exempt_paths or ["/health", "/docs", "/openapi.json"]

        # Custom limits for specific endpoint patterns
        self.custom_limits = {
            "/api/auth/login": (5, 60),  # 5 requests per minute
            "/api/auth/register": (3, 300),  # 3 requests per 5 minutes
            "/api/auth/password/reset": (3, 300),
        }

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        """Check rate limit before processing request."""

        # Skip exempt paths
        if any(request.url.path.startswith(path) for path in self.exempt_paths):
            return await call_next(request)

        # Get rate limit for this endpoint
        limit, window = self._get_limit_for_path(request.url.path)

        # Determine rate limit key (user ID or IP)
        key = await self._get_rate_limit_key(request)

        # Check rate limit
        allowed, remaining, reset_time = await self._check_rate_limit(
            key, limit, window
        )

        if not allowed:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Rate limit exceeded. Try again in {int(reset_time - time.time())} seconds.",
                headers={
                    "X-RateLimit-Limit": str(limit),
                    "X-RateLimit-Remaining": "0",
                    "X-RateLimit-Reset": str(int(reset_time)),
                    "Retry-After": str(int(reset_time - time.time())),
                },
            )

        # Process request
        response = await call_next(request)

        # Add rate limit headers
        response.headers["X-RateLimit-Limit"] = str(limit)
        response.headers["X-RateLimit-Remaining"] = str(remaining)
        response.headers["X-RateLimit-Reset"] = str(int(reset_time))

        return response

    def _get_limit_for_path(self, path: str) -> tuple[int, int]:
        """Get rate limit and window for specific path."""
        for pattern, (limit, window) in self.custom_limits.items():
            if path.startswith(pattern):
                return limit, window
        return self.default_limit, self.default_window

    async def _get_rate_limit_key(self, request: Request) -> str:
        """Get rate limit key (user ID or IP address)."""
        # Try to get user ID from token
        auth_header = request.headers.get("authorization", "")
        if auth_header.startswith("Bearer "):
            token = auth_header[7:]
            try:
                from app.auth.jwt import decode_token
                payload = decode_token(token)
                user_id = payload.get("sub")
                if user_id:
                    return f"user:{user_id}"
            except Exception:
                pass  # Fall back to IP

        # Fall back to IP address
        # Check for X-Forwarded-For (load balancer)
        forwarded = request.headers.get("x-forwarded-for")
        if forwarded:
            ip = forwarded.split(",")[0].strip()
        else:
            ip = request.client.host if request.client else "unknown"

        return f"ip:{ip}"

    async def _check_rate_limit(
        self, key: str, limit: int, window: int
    ) -> tuple[bool, int, float]:
        """Check rate limit using sliding window algorithm.

        Returns:
            (allowed, remaining, reset_time)
        """
        redis_client = await get_redis()
        current_time = time.time()
        window_start = current_time - window

        # Redis key for this rate limit
        redis_key = f"ratelimit:{key}"

        try:
            # Remove old entries outside the window
            await redis_client.zremrangebyscore(redis_key, 0, window_start)

            # Count requests in current window
            count = await redis_client.zcard(redis_key)

            if count >= limit:
                # Get oldest entry to calculate reset time
                oldest = await redis_client.zrange(redis_key, 0, 0, withscores=True)
                if oldest:
                    reset_time = oldest[0][1] + window
                else:
                    reset_time = current_time + window
                return False, 0, reset_time

            # Add current request
            await redis_client.zadd(redis_key, {str(current_time): current_time})

            # Set expiry on the key (cleanup)
            await redis_client.expire(redis_key, window)

            remaining = limit - count - 1
            reset_time = current_time + window

            return True, remaining, reset_time

        except Exception as e:
            # If Redis fails, allow request (fail open)
            import logging
            logging.error(f"Rate limit check failed: {e}")
            return True, limit, current_time + window


class RateLimiter:
    """Helper class for manual rate limit checks in specific endpoints."""

    @staticmethod
    async def check(
        key: str,
        limit: int = 10,
        window: int = 60,
    ) -> bool:
        """Check if rate limit is exceeded.

        Args:
            key: Unique identifier (e.g., "user:123" or "ip:1.2.3.4")
            limit: Maximum requests allowed
            window: Time window in seconds

        Returns:
            True if allowed, False if rate limit exceeded
        """
        redis_client = await get_redis()
        current_time = time.time()
        window_start = current_time - window
        redis_key = f"ratelimit:{key}"

        try:
            await redis_client.zremrangebyscore(redis_key, 0, window_start)
            count = await redis_client.zcard(redis_key)

            if count >= limit:
                return False

            await redis_client.zadd(redis_key, {str(current_time): current_time})
            await redis_client.expire(redis_key, window)

            return True

        except Exception:
            # Fail open
            return True
