"""Reconciliation endpoint tests."""

import pytest
from httpx import AsyncClient


@pytest.mark.api
@pytest.mark.asyncio
class TestReconciliation:
    """Test reconciliation endpoints require authentication."""

    async def test_dashboard_requires_auth(self, client: AsyncClient):
        """Dashboard endpoint rejects unauthenticated requests."""
        resp = await client.get("/api/reconciliation/")
        assert resp.status_code == 401

    async def test_run_requires_auth(self, client: AsyncClient):
        """Reconciliation run rejects unauthenticated requests."""
        resp = await client.post("/api/reconciliation/run")
        assert resp.status_code == 401

    async def test_alerts_list_requires_auth(self, client: AsyncClient):
        """Alerts list rejects unauthenticated requests."""
        resp = await client.get("/api/reconciliation/alerts")
        assert resp.status_code == 401

    async def test_alert_detail_requires_auth(self, client: AsyncClient):
        """Alert detail rejects unauthenticated requests."""
        resp = await client.get("/api/reconciliation/alerts/fake-id")
        assert resp.status_code == 401

    async def test_alert_update_requires_auth(self, client: AsyncClient):
        """Alert update rejects unauthenticated requests."""
        resp = await client.patch(
            "/api/reconciliation/alerts/fake-id",
            json={"status": "acknowledged"},
        )
        assert resp.status_code == 401
