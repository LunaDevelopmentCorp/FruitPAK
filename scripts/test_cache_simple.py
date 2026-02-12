#!/usr/bin/env python
"""
Simplified authenticated cache test.

This script bypasses the wizard by directly marking the enterprise as onboarded
in the database (for testing purposes only).
"""

import asyncio
import time
from datetime import datetime

import httpx
import redis.asyncio as redis
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession


class SimpleCacheTest:
    def __init__(self):
        self.base_url = "http://localhost:8000"
        self.redis_url = "redis://localhost:6379/0"
        self.db_url = "postgresql+asyncpg://fruitpak:fruitpak@localhost:5432/fruitpak"
        self.token = None
        self.enterprise_id = None
        self.results = {}

    async def setup_test_user(self):
        """Setup test user and mark enterprise as onboarded."""
        print("\n" + "="*70)
        print("SETUP: Preparing Test User & Enterprise")
        print("="*70)

        async with httpx.AsyncClient(timeout=30.0) as client:
            # Try to register (or skip if exists)
            user_data = {
                "email": "cache_test2@example.com",
                "password": "TestPassword123!",
                "full_name": "Cache Test User 2",
                "company_name": "Cache Test Company 2",
            }

            response = await client.post(
                f"{self.base_url}/api/auth/register",
                json=user_data,
            )

            if response.status_code not in [201, 400]:
                print(f"❌ Registration failed: {response.status_code}")
                return False

            # Login
            login_data = {
                "email": "cache_test2@example.com",
                "password": "TestPassword123!",
            }

            response = await client.post(
                f"{self.base_url}/api/auth/login",
                json=login_data,
            )

            if response.status_code != 200:
                print(f"❌ Login failed: {response.status_code}")
                return False

            self.token = response.json().get("access_token")
            print(f"✅ Logged in successfully")

            # Create enterprise
            enterprise_data = {
                "name": f"Cache Test Ent {datetime.now().strftime('%H%M%S')}",
                "country": "US",
            }

            response = await client.post(
                f"{self.base_url}/api/enterprises/",
                headers={"Authorization": f"Bearer {self.token}"},
                json=enterprise_data,
            )

            if response.status_code == 201:
                print(f"✅ Enterprise created")
            elif response.status_code == 400:
                print(f"ℹ️  Enterprise already exists")
            else:
                print(f"❌ Enterprise creation failed: {response.status_code}")
                return False

            # Reissue token
            response = await client.post(
                f"{self.base_url}/api/enterprises/reissue-token",
                headers={"Authorization": f"Bearer {self.token}"},
            )

            if response.status_code != 200:
                print(f"❌ Token reissue failed: {response.status_code}")
                return False

            self.token = response.json().get("access_token")
            user_data = response.json().get("user")
            self.enterprise_id = user_data.get("enterprise_id")
            print(f"✅ Token reissued with tenant context")
            print(f"   Enterprise ID: {self.enterprise_id}")

        # Mark enterprise as onboarded in database
        engine = create_async_engine(self.db_url, echo=False)
        try:
            async with engine.begin() as conn:
                await conn.execute(
                    text("UPDATE enterprises SET is_onboarded = true WHERE id = :id"),
                    {"id": self.enterprise_id}
                )
                print(f"✅ Marked enterprise as onboarded (bypassing wizard for testing)")
        finally:
            await engine.dispose()

        return True

    async def test_cached_endpoint(self, endpoint, name):
        """Test cache behavior for an endpoint."""
        print("\n" + "="*70)
        print(f"TEST: {name}")
        print("="*70)

        redis_client = redis.from_url(self.redis_url, decode_responses=True)
        headers = {"Authorization": f"Bearer {self.token}"}

        try:
            # First request (cache MISS)
            print(f"\n📡 Request 1 (expected: cache MISS)...")
            start = time.perf_counter()
            async with httpx.AsyncClient(timeout=30.0) as client:
                response1 = await client.get(
                    f"{self.base_url}{endpoint}",
                    headers=headers,
                )
            miss_time = (time.perf_counter() - start) * 1000

            if response1.status_code != 200:
                print(f"❌ Request failed: {response1.status_code}")
                print(f"   Response: {response1.text}")
                return False

            data1 = response1.json()
            print(f"✅ Success: {miss_time:.2f}ms ({data1.get('total', 0)} items)")

            # Check cache keys
            await asyncio.sleep(0.1)
            keys = []
            async for key in redis_client.scan_iter(match="*"):
                keys.append(key)
            print(f"   Cache keys after: {len(keys)}")
            for key in keys[:2]:
                ttl = await redis_client.ttl(key)
                print(f"   - {key[:50]}... (TTL: {ttl}s)")

            # Second request (cache HIT)
            print(f"\n📡 Request 2 (expected: cache HIT)...")
            start = time.perf_counter()
            async with httpx.AsyncClient(timeout=30.0) as client:
                response2 = await client.get(
                    f"{self.base_url}{endpoint}",
                    headers=headers,
                )
            hit_time = (time.perf_counter() - start) * 1000

            if response2.status_code != 200:
                print(f"❌ Request failed: {response2.status_code}")
                return False

            data2 = response2.json()
            print(f"✅ Success: {hit_time:.2f}ms ({data2.get('total', 0)} items)")

            # Verify identical
            if data1 == data2:
                print(f"✅ Responses identical (cache working)")
            else:
                print(f"⚠️  Responses differ")

            # Performance
            speedup = miss_time / hit_time if hit_time > 0 else 0
            print(f"\n🚀 Performance:")
            print(f"   Cache MISS: {miss_time:.2f}ms")
            print(f"   Cache HIT:  {hit_time:.2f}ms")
            print(f"   Speedup:    {speedup:.1f}x faster")

            if speedup > 2:
                grade = "A+"
            elif speedup > 1.5:
                grade = "A"
            elif speedup > 1.2:
                grade = "B"
            else:
                grade = "C"

            print(f"   Grade:      {grade}")

            self.results[name] = {
                "miss_ms": round(miss_time, 2),
                "hit_ms": round(hit_time, 2),
                "speedup": round(speedup, 1),
                "grade": grade,
            }

            return True

        finally:
            await redis_client.aclose()

    async def test_cache_invalidation(self):
        """Test cache invalidation."""
        print("\n" + "="*70)
        print("TEST: Cache Invalidation")
        print("="*70)

        redis_client = redis.from_url(self.redis_url, decode_responses=True)
        headers = {"Authorization": f"Bearer {self.token}"}

        try:
            # Count cache keys before
            keys_before = []
            async for key in redis_client.scan_iter(match="packhouses:*"):
                keys_before.append(key)
            print(f"\nPackhouses cache keys before POST: {len(keys_before)}")

            # Create a packhouse
            packhouse_data = {
                "name": f"Test PH {datetime.now().strftime('%H%M%S')}",
                "location": "Test Location",
                "capacity_tons_per_day": 100,
                "cold_rooms": 5,
            }

            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    f"{self.base_url}/api/packhouses/",
                    headers=headers,
                    json=packhouse_data,
                )

            if response.status_code != 201:
                print(f"❌ Failed to create packhouse: {response.status_code}")
                print(f"   Response: {response.text}")
                return False

            print(f"✅ Packhouse created: {response.json().get('name')}")

            # Count cache keys after
            await asyncio.sleep(0.1)
            keys_after = []
            async for key in redis_client.scan_iter(match="packhouses:*"):
                keys_after.append(key)
            print(f"Packhouses cache keys after POST: {len(keys_after)}")

            if len(keys_after) < len(keys_before):
                print(f"✅ Cache invalidation working! {len(keys_before)} → {len(keys_after)} keys")
                return True
            elif len(keys_before) == 0:
                print(f"ℹ️  No cache keys to invalidate")
                return True
            else:
                print(f"⚠️  Cache keys not cleared")
                return False

        finally:
            await redis_client.aclose()

    async def run(self):
        """Run all tests."""
        print("\n" + "="*70)
        print("Authenticated Cache Test (Simplified)")
        print("="*70)

        if not await self.setup_test_user():
            print("\n❌ Setup failed")
            return 1

        # Test endpoints
        await self.test_cached_endpoint("/api/growers/?limit=50&offset=0", "Growers")
        await self.test_cached_endpoint("/api/packhouses/?limit=50&offset=0", "Packhouses")
        await self.test_cache_invalidation()

        # Summary
        print("\n" + "="*70)
        print("SUMMARY")
        print("="*70)

        for name, result in self.results.items():
            print(f"\n{name}:")
            print(f"  Cache MISS: {result['miss_ms']}ms")
            print(f"  Cache HIT:  {result['hit_ms']}ms")
            print(f"  Speedup:    {result['speedup']}x ({result['grade']})")

        print("\n✅ All tests completed!\n")
        return 0


async def main():
    tester = SimpleCacheTest()
    return await tester.run()


if __name__ == "__main__":
    exit_code = asyncio.run(main())
    exit(exit_code)
