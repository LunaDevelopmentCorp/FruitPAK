"""Tests for config CRUD endpoints and related entity-list endpoints.

Covers:
    GET  /api/config/bin-types
    GET  /api/config/product-configs
    GET  /api/config/fruit-types
    GET  /api/config/box-sizes
    GET  /api/config/financial-summary
    GET  /api/config/transport-configs
    GET  /api/config/tenant-settings
    PUT  /api/config/tenant-settings
    GET  /api/shipping-lines/
    GET  /api/transporters/
    GET  /api/shipping-agents/
"""

import pytest
from httpx import AsyncClient


@pytest.mark.integration
@pytest.mark.asyncio
class TestConfigEndpoints:
    """Test enterprise configuration endpoints under /api/config/."""

    async def test_list_bin_types(
        self, tenant_client: AsyncClient, auth_headers: dict
    ):
        """GET /api/config/bin-types returns 200 with a list."""
        resp = await tenant_client.get(
            "/api/config/bin-types", headers=auth_headers
        )
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    async def test_list_product_configs(
        self, tenant_client: AsyncClient, auth_headers: dict
    ):
        """GET /api/config/product-configs returns 200 with a list."""
        resp = await tenant_client.get(
            "/api/config/product-configs", headers=auth_headers
        )
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    async def test_list_fruit_types(
        self, tenant_client: AsyncClient, auth_headers: dict
    ):
        """GET /api/config/fruit-types returns 200 with a list."""
        resp = await tenant_client.get(
            "/api/config/fruit-types", headers=auth_headers
        )
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    async def test_list_box_sizes(
        self, tenant_client: AsyncClient, auth_headers: dict
    ):
        """GET /api/config/box-sizes returns 200 with a list."""
        resp = await tenant_client.get(
            "/api/config/box-sizes", headers=auth_headers
        )
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    async def test_financial_summary(
        self, tenant_client: AsyncClient, auth_headers: dict
    ):
        """GET /api/config/financial-summary returns currency config."""
        resp = await tenant_client.get(
            "/api/config/financial-summary", headers=auth_headers
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "base_currency" in data
        assert "export_currencies" in data

    async def test_transport_configs(
        self, tenant_client: AsyncClient, auth_headers: dict
    ):
        """GET /api/config/transport-configs returns 200 with a list."""
        resp = await tenant_client.get(
            "/api/config/transport-configs", headers=auth_headers
        )
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    async def test_get_tenant_settings(
        self, tenant_client: AsyncClient, auth_headers: dict
    ):
        """GET /api/config/tenant-settings returns 200 with a dict."""
        resp = await tenant_client.get(
            "/api/config/tenant-settings", headers=auth_headers
        )
        assert resp.status_code == 200
        assert isinstance(resp.json(), dict)

    async def test_update_tenant_settings(
        self, tenant_client: AsyncClient, auth_headers: dict
    ):
        """PUT /api/config/tenant-settings upserts and returns the dict."""
        resp = await tenant_client.put(
            "/api/config/tenant-settings",
            headers=auth_headers,
            json={"settings": {"test_key": "test_value"}},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, dict)
        assert data.get("test_key") == "test_value"

    async def test_config_requires_auth(self, tenant_client: AsyncClient):
        """Config endpoints reject unauthenticated requests."""
        resp = await tenant_client.get("/api/config/bin-types")
        assert resp.status_code == 401

    async def test_list_shipping_lines(
        self, tenant_client: AsyncClient, auth_headers: dict
    ):
        """GET /api/shipping-lines/ returns 200 with a list."""
        resp = await tenant_client.get(
            "/api/shipping-lines/", headers=auth_headers
        )
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    async def test_list_transporters(
        self, tenant_client: AsyncClient, auth_headers: dict
    ):
        """GET /api/transporters/ returns 200 with a list."""
        resp = await tenant_client.get(
            "/api/transporters/", headers=auth_headers
        )
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    async def test_list_shipping_agents(
        self, tenant_client: AsyncClient, auth_headers: dict
    ):
        """GET /api/shipping-agents/ returns 200 with a list."""
        resp = await tenant_client.get(
            "/api/shipping-agents/", headers=auth_headers
        )
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)
