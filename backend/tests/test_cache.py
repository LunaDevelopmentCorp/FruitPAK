"""Tests for caching functionality."""

import pytest
import redis.asyncio as redis

from app.utils.cache import cached, get_redis, invalidate_cache, cache_key


@pytest.mark.cache
@pytest.mark.asyncio
class TestCacheUtility:
    """Test cache utility functions."""

    async def test_get_redis(self, redis_client):
        """Test Redis connection."""
        client = await get_redis()
        assert client is not None

        # Test ping
        pong = await client.ping()
        assert pong is True

    async def test_cache_key_generation(self):
        """Test cache key generation."""
        key1 = cache_key(limit=50, offset=0)
        key2 = cache_key(limit=50, offset=0)
        key3 = cache_key(limit=100, offset=0)

        # Same args = same key
        assert key1 == key2

        # Different args = different key
        assert key1 != key3

    async def test_cached_decorator(self, redis_client):
        """Test cached decorator."""
        call_count = 0

        @cached(ttl=10, prefix="test")
        async def expensive_function(arg1: int, arg2: str):
            nonlocal call_count
            call_count += 1
            return {"result": arg1 + len(arg2)}

        # First call - cache MISS
        result1 = await expensive_function(10, "hello")
        assert result1 == {"result": 15}
        assert call_count == 1

        # Second call - cache HIT (function not called again)
        result2 = await expensive_function(10, "hello")
        assert result2 == {"result": 15}
        assert call_count == 1  # Still 1!

        # Different args - cache MISS
        result3 = await expensive_function(20, "world")
        assert result3 == {"result": 25}
        assert call_count == 2

    async def test_cache_invalidation(self, redis_client):
        """Test cache invalidation."""
        # Set test cache keys
        await redis_client.set("test:func1:abc123", "value1")
        await redis_client.set("test:func2:def456", "value2")
        await redis_client.set("other:func:xyz789", "value3")

        # Verify keys exist
        keys = []
        async for key in redis_client.scan_iter(match="test:*"):
            keys.append(key)
        assert len(keys) == 2

        # Invalidate test:* keys
        await invalidate_cache("test:*")

        # Verify test:* keys are gone
        keys = []
        async for key in redis_client.scan_iter(match="test:*"):
            keys.append(key)
        assert len(keys) == 0

        # Verify other key still exists
        value = await redis_client.get("other:func:xyz789")
        assert value == "value3"

    async def test_cache_ttl(self, redis_client):
        """Test cache expiration (TTL)."""
        @cached(ttl=1, prefix="test_ttl")
        async def fast_expiring():
            return {"value": "expires soon"}

        # Call function
        result = await fast_expiring()
        assert result == {"value": "expires soon"}

        # Verify key exists
        keys = []
        async for key in redis_client.scan_iter(match="test_ttl:*"):
            keys.append(key)
        assert len(keys) == 1

        # Check TTL
        ttl = await redis_client.ttl(keys[0])
        assert 0 < ttl <= 1  # Should be ≤1 second

    async def test_cache_with_pydantic_models(self, redis_client):
        """Test caching Pydantic models."""
        from pydantic import BaseModel

        class TestModel(BaseModel):
            id: str
            name: str
            count: int

        @cached(ttl=10, prefix="test_pydantic")
        async def get_model():
            return TestModel(id="123", name="Test", count=42)

        # First call
        result1 = await get_model()
        assert isinstance(result1, TestModel)
        assert result1.id == "123"

        # Second call (from cache)
        result2 = await get_model()
        assert isinstance(result2, dict)  # Deserialized from JSON
        assert result2["id"] == "123"
        assert result2["name"] == "Test"


@pytest.mark.integration
@pytest.mark.asyncio
class TestEndpointCaching:
    """Test caching on actual endpoints."""

    async def test_growers_endpoint_caching(self, client, auth_headers, redis_client):
        """Test growers endpoint uses cache."""
        # Clear cache
        await invalidate_cache("growers:*")

        # First request (cache MISS)
        response1 = await client.get("/api/growers/", headers=auth_headers)
        assert response1.status_code == 200

        # Check cache key created
        keys = []
        async for key in redis_client.scan_iter(match="growers:*"):
            keys.append(key)
        assert len(keys) == 1

        # Second request (cache HIT)
        response2 = await client.get("/api/growers/", headers=auth_headers)
        assert response2.status_code == 200

        # Results should be identical
        assert response1.json() == response2.json()
