"""Regression tests for multi-tenant isolation.

Verifies that:
  1. Redis cache keys include tenant context (no cross-tenant cache hits)
  2. Cache invalidation only affects the current tenant
  3. All TenantBase models are registered in models/__init__.py
"""

import pytest

from app.tenancy import _tenant_ctx
from app.utils.cache import cached, get_redis, invalidate_cache


@pytest.mark.cache
@pytest.mark.asyncio
class TestCacheTenantIsolation:
    """Verify cache keys are tenant-scoped."""

    async def test_cache_key_includes_tenant(self, redis_client):
        """Same function + args for different tenants must produce different cache keys."""
        call_count = 0

        @cached(ttl=10, prefix="test_iso")
        async def get_data(limit: int = 10):
            nonlocal call_count
            call_count += 1
            return {"tenant": _tenant_ctx.get(), "count": call_count}

        # Call as Tenant A
        token_a = _tenant_ctx.set("tenant_aaa111")
        result_a = await get_data(limit=10)
        _tenant_ctx.reset(token_a)

        # Call as Tenant B with same args
        token_b = _tenant_ctx.set("tenant_bbb222")
        result_b = await get_data(limit=10)
        _tenant_ctx.reset(token_b)

        # Both calls must execute the function (no cross-tenant cache hit)
        assert call_count == 2
        assert result_a["tenant"] == "tenant_aaa111"
        assert result_b["tenant"] == "tenant_bbb222"

    async def test_invalidate_cache_is_tenant_scoped(self, redis_client):
        """invalidate_cache should only clear the current tenant's keys."""
        r = await get_redis()

        # Simulate keys from two tenants
        await r.set("t:tenant_aaa111:growers:list:abc", "data_a")
        await r.set("t:tenant_bbb222:growers:list:abc", "data_b")

        # Invalidate as Tenant A
        token_a = _tenant_ctx.set("tenant_aaa111")
        await invalidate_cache("growers:*")
        _tenant_ctx.reset(token_a)

        # Tenant A's key should be gone, Tenant B's should remain
        assert await r.get("t:tenant_aaa111:growers:list:abc") is None
        assert await r.get("t:tenant_bbb222:growers:list:abc") == "data_b"

    async def test_no_tenant_context_does_not_leak(self, redis_client):
        """Without tenant context, cache keys must not collide with tenant-scoped keys."""
        call_count = 0

        @cached(ttl=10, prefix="test_leak")
        async def get_data(limit: int = 10):
            nonlocal call_count
            call_count += 1
            return {"count": call_count}

        # Call without tenant context
        result_no_tenant = await get_data(limit=10)

        # Call with tenant context and same args
        token = _tenant_ctx.set("tenant_ccc333")
        result_with_tenant = await get_data(limit=10)
        _tenant_ctx.reset(token)

        # Both must execute (different key namespaces)
        assert call_count == 2


@pytest.mark.unit
class TestModelRegistration:
    """Verify all tenant models are registered for migration detection."""

    def test_all_tenant_models_imported(self):
        """Every TenantBase model must be imported in models/__init__.py."""
        import app.models  # noqa: F401 — triggers all imports
        from app.database import TenantBase

        # All tenant table names that MUST be in TenantBase.metadata
        required_tables = {
            "packhouses", "growers", "wizard_states", "company_profiles",
            "pack_lines", "suppliers", "harvest_teams", "product_configs",
            "pack_specs", "transport_configs", "financial_configs",
            "batches", "batch_history", "lots", "pallets", "containers",
            "exports", "grower_payments", "harvest_team_payments",
            "labour_costs", "client_invoices", "credits",
            "reconciliation_alerts", "activity_log", "clients",
        }

        registered = set(TenantBase.metadata.tables.keys())
        missing = required_tables - registered
        assert not missing, f"Models not registered in models/__init__.py: {missing}"
