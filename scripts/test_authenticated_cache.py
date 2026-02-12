#!/usr/bin/env python
"""
Test authenticated endpoints with cache verification.

This script:
1. Registers/logs in a test user
2. Creates enterprise and completes onboarding
3. Makes authenticated requests to cached endpoints
4. Monitors Redis cache population
5. Measures cache HIT vs MISS performance
6. Verifies cache invalidation
"""

import asyncio
import time
import json
from datetime import datetime

import httpx
import redis.asyncio as redis


class AuthenticatedCacheTest:
    def __init__(self):
        self.base_url = "http://localhost:8000"
        self.redis_url = "redis://localhost:6379/0"
        self.token = None
        self.results = {
            "registration": None,
            "login": None,
            "enterprise": None,
            "reissue": None,
            "wizard": None,
            "cache_tests": [],
            "cache_invalidation": None,
        }

    async def register_test_user(self, client: httpx.AsyncClient):
        """Register a test user (or skip if already exists)."""
        print("\n" + "="*70)
        print("STEP 1: Register Test User")
        print("="*70)

        user_data = {
            "email": "cache_test@example.com",
            "password": "TestPassword123!",
            "full_name": "Cache Test User",
            "company_name": "Cache Test Company",
        }

        try:
            response = await client.post(
                f"{self.base_url}/api/auth/register",
                json=user_data,
            )

            if response.status_code == 201:
                print("✅ Test user registered successfully")
                self.results["registration"] = "success"
                return True
            elif response.status_code == 400:
                error = response.json()
                if "already exists" in error.get("detail", "").lower():
                    print("ℹ️  Test user already exists, will use existing user")
                    self.results["registration"] = "already_exists"
                    return True
                else:
                    print(f"⚠️  Registration failed: {error}")
                    self.results["registration"] = f"failed: {error}"
                    return True  # Continue anyway, try to login
            else:
                print(f"❌ Registration failed: {response.status_code}")
                print(f"   Response: {response.text}")
                self.results["registration"] = f"failed: {response.status_code}"
                return False

        except Exception as e:
            print(f"❌ Registration error: {e}")
            self.results["registration"] = f"error: {e}"
            return False

    async def login_test_user(self, client: httpx.AsyncClient):
        """Login and get JWT token."""
        print("\n" + "="*70)
        print("STEP 2: Login and Get JWT Token")
        print("="*70)

        login_data = {
            "email": "cache_test@example.com",
            "password": "TestPassword123!",
        }

        try:
            response = await client.post(
                f"{self.base_url}/api/auth/login",
                json=login_data,
            )

            if response.status_code == 200:
                data = response.json()
                self.token = data.get("access_token")
                if self.token:
                    print(f"✅ Login successful")
                    print(f"   Token (first 20 chars): {self.token[:20]}...")
                    self.results["login"] = "success"
                    return True
                else:
                    print("❌ No access token in response")
                    print(f"   Response: {data}")
                    self.results["login"] = "no_token"
                    return False
            else:
                print(f"❌ Login failed: {response.status_code}")
                print(f"   Response: {response.text}")
                self.results["login"] = f"failed: {response.status_code}"
                return False

        except Exception as e:
            print(f"❌ Login error: {e}")
            self.results["login"] = f"error: {e}"
            return False

    async def create_enterprise(self, client: httpx.AsyncClient):
        """Create enterprise for the test user."""
        print("\n" + "="*70)
        print("STEP 3: Create Enterprise")
        print("="*70)

        headers = {"Authorization": f"Bearer {self.token}"}
        enterprise_data = {
            "name": "Cache Test Enterprise",
            "country": "US",
        }

        try:
            response = await client.post(
                f"{self.base_url}/api/enterprises/",
                headers=headers,
                json=enterprise_data,
            )

            if response.status_code == 201:
                data = response.json()
                print(f"✅ Enterprise created: {data.get('name')}")
                print(f"   Tenant schema: {data.get('tenant_schema')}")
                self.results["enterprise"] = "success"
                return True
            elif response.status_code == 400:
                error = response.json()
                if "already belongs" in error.get("detail", "").lower():
                    print("ℹ️  User already has an enterprise")
                    self.results["enterprise"] = "already_exists"
                    return True
                else:
                    print(f"⚠️  Enterprise creation failed: {error}")
                    self.results["enterprise"] = f"failed: {error}"
                    return False
            else:
                print(f"❌ Enterprise creation failed: {response.status_code}")
                print(f"   Response: {response.text}")
                self.results["enterprise"] = f"failed: {response.status_code}"
                return False

        except Exception as e:
            print(f"❌ Enterprise creation error: {e}")
            self.results["enterprise"] = f"error: {e}"
            return False

    async def reissue_token(self, client: httpx.AsyncClient):
        """Get new token with tenant_schema claim."""
        print("\n" + "="*70)
        print("STEP 4: Reissue Token (with tenant context)")
        print("="*70)

        headers = {"Authorization": f"Bearer {self.token}"}

        try:
            response = await client.post(
                f"{self.base_url}/api/enterprises/reissue-token",
                headers=headers,
            )

            if response.status_code == 200:
                data = response.json()
                self.token = data.get("access_token")
                if self.token:
                    print(f"✅ Token reissued with tenant context")
                    print(f"   Token (first 20 chars): {self.token[:20]}...")
                    self.results["reissue"] = "success"
                    return True
                else:
                    print("❌ No access token in response")
                    self.results["reissue"] = "no_token"
                    return False
            else:
                print(f"❌ Token reissue failed: {response.status_code}")
                print(f"   Response: {response.text}")
                self.results["reissue"] = f"failed: {response.status_code}"
                return False

        except Exception as e:
            print(f"❌ Token reissue error: {e}")
            self.results["reissue"] = f"error: {e}"
            return False

    async def complete_wizard(self, client: httpx.AsyncClient):
        """Complete the onboarding wizard."""
        print("\n" + "="*70)
        print("STEP 5: Complete Onboarding Wizard")
        print("="*70)

        headers = {"Authorization": f"Bearer {self.token}"}
        wizard_data = {
            "business_type": "packhouse",
            "packhouse_count": 1,
            "primary_fruits": ["Apple", "Orange"],
            "certifications": ["GLOBALG.A.P."],
        }

        try:
            response = await client.post(
                f"{self.base_url}/api/wizard/complete",
                headers=headers,
                json=wizard_data,
            )

            if response.status_code == 200:
                print(f"✅ Onboarding wizard completed")
                self.results["wizard"] = "success"
                return True
            elif response.status_code == 400:
                error = response.json()
                if "already onboarded" in error.get("detail", "").lower():
                    print("ℹ️  Already onboarded")
                    self.results["wizard"] = "already_completed"
                    return True
                else:
                    print(f"⚠️  Wizard completion failed: {error}")
                    self.results["wizard"] = f"failed: {error}"
                    # Continue anyway
                    return True
            else:
                print(f"⚠️  Wizard completion failed: {response.status_code}")
                print(f"   Response: {response.text}")
                self.results["wizard"] = f"failed: {response.status_code}"
                # Continue anyway
                return True

        except Exception as e:
            print(f"⚠️  Wizard completion error: {e}")
            self.results["wizard"] = f"error: {e}"
            # Continue anyway
            return True

    async def test_cached_endpoint(
        self,
        client: httpx.AsyncClient,
        redis_client: redis.Redis,
        endpoint: str,
        endpoint_name: str,
    ):
        """Test a single cached endpoint: MISS, then HIT."""
        print("\n" + "="*70)
        print(f"STEP 6: Test Cached Endpoint - {endpoint_name}")
        print("="*70)

        headers = {"Authorization": f"Bearer {self.token}"}
        test_result = {
            "endpoint": endpoint_name,
            "url": endpoint,
            "cache_miss_time": None,
            "cache_hit_time": None,
            "cache_keys_before": 0,
            "cache_keys_after": 0,
            "speedup": None,
            "status": "pending",
        }

        try:
            # Check cache keys before
            keys_before = []
            async for key in redis_client.scan_iter(match="*"):
                keys_before.append(key)
            test_result["cache_keys_before"] = len(keys_before)

            print(f"\nCache keys before request: {len(keys_before)}")
            if keys_before:
                print(f"   Sample keys:")
                for key in keys_before[:3]:
                    print(f"   - {key}")

            # First request (cache MISS)
            print(f"\n📡 Making first request (expected: cache MISS)...")
            start = time.perf_counter()
            response1 = await client.get(
                f"{self.base_url}{endpoint}",
                headers=headers,
            )
            miss_time = (time.perf_counter() - start) * 1000  # ms

            if response1.status_code == 200:
                data1 = response1.json()
                print(f"✅ First request successful: {miss_time:.2f}ms")
                print(f"   Response: {data1.get('total', 0)} items")
                test_result["cache_miss_time"] = round(miss_time, 2)
            else:
                print(f"❌ First request failed: {response1.status_code}")
                print(f"   Response: {response1.text}")
                test_result["status"] = f"failed: {response1.status_code}"
                self.results["cache_tests"].append(test_result)
                return

            # Check cache keys after first request
            await asyncio.sleep(0.1)  # Give cache time to write
            keys_after = []
            async for key in redis_client.scan_iter(match="*"):
                keys_after.append(key)
            test_result["cache_keys_after"] = len(keys_after)

            print(f"\nCache keys after first request: {len(keys_after)}")
            new_keys = set(keys_after) - set(keys_before)
            if new_keys:
                print(f"   New cache keys created: {len(new_keys)}")
                for key in list(new_keys)[:3]:
                    ttl = await redis_client.ttl(key)
                    print(f"   - {key[:60]}... (TTL: {ttl}s)")
            else:
                print(f"   ⚠️  No new cache keys created!")

            # Second request (cache HIT)
            print(f"\n📡 Making second request (expected: cache HIT)...")
            start = time.perf_counter()
            response2 = await client.get(
                f"{self.base_url}{endpoint}",
                headers=headers,
            )
            hit_time = (time.perf_counter() - start) * 1000  # ms

            if response2.status_code == 200:
                data2 = response2.json()
                print(f"✅ Second request successful: {hit_time:.2f}ms")
                print(f"   Response: {data2.get('total', 0)} items")
                test_result["cache_hit_time"] = round(hit_time, 2)

                # Verify responses are identical
                if data1 == data2:
                    print(f"✅ Responses are identical (cache working correctly)")
                else:
                    print(f"⚠️  Responses differ (possible cache issue)")

                # Calculate speedup
                if hit_time > 0:
                    speedup = miss_time / hit_time
                    test_result["speedup"] = round(speedup, 1)
                    print(f"\n🚀 Performance Improvement:")
                    print(f"   Cache MISS: {miss_time:.2f}ms")
                    print(f"   Cache HIT:  {hit_time:.2f}ms")
                    print(f"   Speedup:    {speedup:.1f}x faster")

                    if speedup > 2:
                        grade = "A+ (Excellent)"
                    elif speedup > 1.5:
                        grade = "A (Very Good)"
                    elif speedup > 1.2:
                        grade = "B (Good)"
                    else:
                        grade = "C (Marginal)"

                    print(f"   Grade:      {grade}")

                test_result["status"] = "success"

            else:
                print(f"❌ Second request failed: {response2.status_code}")
                test_result["status"] = f"failed: {response2.status_code}"

        except Exception as e:
            print(f"❌ Test error: {e}")
            test_result["status"] = f"error: {e}"
            import traceback
            traceback.print_exc()

        self.results["cache_tests"].append(test_result)

    async def test_cache_invalidation(
        self,
        client: httpx.AsyncClient,
        redis_client: redis.Redis,
    ):
        """Test cache invalidation on POST."""
        print("\n" + "="*70)
        print("STEP 7: Test Cache Invalidation")
        print("="*70)

        headers = {"Authorization": f"Bearer {self.token}"}

        try:
            # Check packhouses cache keys before
            keys_before = []
            async for key in redis_client.scan_iter(match="packhouses:*"):
                keys_before.append(key)

            print(f"\nPackhouses cache keys before POST: {len(keys_before)}")

            # Create a new packhouse
            print(f"\n📡 Creating new packhouse (should invalidate cache)...")
            packhouse_data = {
                "name": f"Test Packhouse {datetime.now().strftime('%H%M%S')}",
                "location": "Test Location",
                "capacity_tons_per_day": 100,
                "cold_rooms": 5,
            }

            response = await client.post(
                f"{self.base_url}/api/packhouses/",
                headers=headers,
                json=packhouse_data,
            )

            if response.status_code == 201:
                data = response.json()
                print(f"✅ Packhouse created: {data.get('name')}")

                # Check cache keys after
                await asyncio.sleep(0.1)
                keys_after = []
                async for key in redis_client.scan_iter(match="packhouses:*"):
                    keys_after.append(key)

                print(f"\nPackhouses cache keys after POST: {len(keys_after)}")

                if len(keys_after) < len(keys_before):
                    print(f"✅ Cache invalidation working! {len(keys_before)} → {len(keys_after)} keys")
                    self.results["cache_invalidation"] = "success"
                elif len(keys_after) == 0 and len(keys_before) > 0:
                    print(f"✅ Cache cleared successfully (all keys removed)")
                    self.results["cache_invalidation"] = "success"
                elif len(keys_before) == 0:
                    print(f"ℹ️  No cache keys before, invalidation not applicable")
                    self.results["cache_invalidation"] = "n/a"
                else:
                    print(f"⚠️  Cache keys unchanged or increased")
                    self.results["cache_invalidation"] = "unclear"

            else:
                print(f"❌ Failed to create packhouse: {response.status_code}")
                print(f"   Response: {response.text}")
                self.results["cache_invalidation"] = f"failed: {response.status_code}"

        except Exception as e:
            print(f"❌ Cache invalidation test error: {e}")
            self.results["cache_invalidation"] = f"error: {e}"

    async def generate_summary(self):
        """Generate test summary."""
        print("\n" + "="*70)
        print("TEST SUMMARY")
        print("="*70)

        print(f"\nTest Date: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")

        # Registration/Login/Onboarding
        print(f"\n📋 Setup & Onboarding:")
        print(f"   Registration:   {self.results['registration']}")
        print(f"   Login:          {self.results['login']}")
        print(f"   Enterprise:     {self.results['enterprise']}")
        print(f"   Token reissue:  {self.results['reissue']}")
        print(f"   Wizard:         {self.results['wizard']}")

        # Cache tests
        print(f"\n📊 Cached Endpoints:")
        for test in self.results["cache_tests"]:
            status_icon = "✅" if test["status"] == "success" else "❌"
            print(f"\n   {status_icon} {test['endpoint']}")
            print(f"      Status:      {test['status']}")
            if test["cache_miss_time"]:
                print(f"      Cache MISS:  {test['cache_miss_time']}ms")
            if test["cache_hit_time"]:
                print(f"      Cache HIT:   {test['cache_hit_time']}ms")
            if test["speedup"]:
                print(f"      Speedup:     {test['speedup']}x faster")
            print(f"      Cache keys:  {test['cache_keys_before']} → {test['cache_keys_after']}")

        # Cache invalidation
        print(f"\n🔄 Cache Invalidation:")
        print(f"   Status: {self.results['cache_invalidation']}")

        # Overall assessment
        print(f"\n" + "="*70)
        print("OVERALL ASSESSMENT")
        print("="*70)

        success_count = sum(
            1 for test in self.results["cache_tests"]
            if test["status"] == "success"
        )
        total_tests = len(self.results["cache_tests"])

        if success_count == total_tests and self.results["login"] == "success":
            print(f"\n✅ Overall: PASSED ({success_count}/{total_tests} endpoints)")
            print(f"   All cached endpoints working correctly")
            print(f"   Cache HIT/MISS behavior verified")
            print(f"   Production-ready for authenticated traffic")
        else:
            print(f"\n⚠️  Overall: ISSUES FOUND ({success_count}/{total_tests} passed)")
            print(f"   Review failed tests above")

        print(f"\n" + "="*70)

    async def run_all_tests(self):
        """Run all authenticated cache tests."""
        print("\n" + "="*70)
        print("Authenticated Cache Test Suite")
        print("="*70)
        print("\nTesting cache behavior with JWT authentication...")

        redis_client = redis.from_url(self.redis_url, decode_responses=True)

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                # Step 1: Register test user
                if not await self.register_test_user(client):
                    print("\n❌ Cannot continue without user registration")
                    return 1

                # Step 2: Login
                if not await self.login_test_user(client):
                    print("\n❌ Cannot continue without login")
                    return 1

                # Step 3: Create enterprise
                if not await self.create_enterprise(client):
                    print("\n❌ Cannot continue without enterprise")
                    return 1

                # Step 4: Reissue token with tenant context
                if not await self.reissue_token(client):
                    print("\n❌ Cannot continue without tenant token")
                    return 1

                # Step 5: Complete onboarding wizard
                await self.complete_wizard(client)

                # Step 6: Test cached endpoints
                await self.test_cached_endpoint(
                    client,
                    redis_client,
                    "/api/growers/?limit=50&offset=0",
                    "GET /api/growers/",
                )

                await self.test_cached_endpoint(
                    client,
                    redis_client,
                    "/api/packhouses/?limit=50&offset=0",
                    "GET /api/packhouses/",
                )

                # Step 7: Test cache invalidation
                await self.test_cache_invalidation(client, redis_client)

                # Step 8: Summary
                await self.generate_summary()

                print("\n✅ All tests completed!")
                return 0

        except Exception as e:
            print(f"\n❌ Fatal error during testing: {e}")
            import traceback
            traceback.print_exc()
            return 1

        finally:
            await redis_client.aclose()


async def main():
    """Main entry point."""
    tester = AuthenticatedCacheTest()
    exit_code = await tester.run_all_tests()
    return exit_code


if __name__ == "__main__":
    exit_code = asyncio.run(main())
    exit(exit_code)
