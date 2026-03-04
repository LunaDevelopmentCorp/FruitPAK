"""Tests for grower and harvest team payment endpoints.

Covers creation, listing, updating, reconciliation, and authorization
for both grower payments (POST/GET/PATCH/DELETE /api/payments/grower)
and team payments (POST/GET /api/payments/team).
"""

import re
from datetime import date

import pytest
from httpx import AsyncClient


@pytest.mark.integration
@pytest.mark.asyncio
class TestPayments:
    """Integration tests for the /api/payments endpoints."""

    # ── Helpers ───────────────────────────────────────────────

    async def _create_batch(
        self,
        client: AsyncClient,
        headers: dict,
        seed_grower: str,
        seed_packhouse: str,
        seed_harvest_team: str,
        gross_weight_kg: float = 1200,
        tare_weight_kg: float = 50,
    ) -> dict:
        """Create a batch via GRN endpoint and return the batch dict."""
        resp = await client.post(
            "/api/batches/grn",
            headers=headers,
            json={
                "grower_id": seed_grower,
                "packhouse_id": seed_packhouse,
                "harvest_team_id": seed_harvest_team,
                "fruit_type": "apple",
                "gross_weight_kg": gross_weight_kg,
                "tare_weight_kg": tare_weight_kg,
            },
        )
        assert resp.status_code == 201, f"GRN creation failed: {resp.text}"
        return resp.json()["batch"]

    # ── Grower Payment Tests ──────────────────────────────────

    async def test_create_grower_payment(
        self,
        tenant_client: AsyncClient,
        auth_headers: dict,
        seed_grower: str,
        seed_packhouse: str,
        seed_harvest_team: str,
    ):
        """POST /api/payments/grower creates a payment and returns 201."""
        # Create a batch first so the grower has deliveries
        await self._create_batch(
            tenant_client, auth_headers, seed_grower, seed_packhouse, seed_harvest_team
        )

        resp = await tenant_client.post(
            "/api/payments/grower",
            headers=auth_headers,
            json={
                "grower_id": seed_grower,
                "amount": 5000.0,
                "payment_date": str(date.today()),
            },
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["grower_id"] == seed_grower
        assert data["gross_amount"] == 5000.0
        assert data["status"] == "paid"
        assert "id" in data
        assert "payment_ref" in data

    async def test_grower_payment_ref_format(
        self,
        tenant_client: AsyncClient,
        auth_headers: dict,
        seed_grower: str,
        seed_packhouse: str,
        seed_harvest_team: str,
    ):
        """Payment ref should follow PAY-YYYYMMDD-NNN format."""
        await self._create_batch(
            tenant_client, auth_headers, seed_grower, seed_packhouse, seed_harvest_team
        )

        resp = await tenant_client.post(
            "/api/payments/grower",
            headers=auth_headers,
            json={
                "grower_id": seed_grower,
                "amount": 3000.0,
                "payment_date": str(date.today()),
            },
        )
        assert resp.status_code == 201
        payment_ref = resp.json()["payment_ref"]
        assert re.match(
            r"^PAY-\d{8}-\d{3}$", payment_ref
        ), f"Unexpected payment ref format: {payment_ref}"

    async def test_list_grower_payments(
        self,
        tenant_client: AsyncClient,
        auth_headers: dict,
        seed_grower: str,
        seed_packhouse: str,
        seed_harvest_team: str,
    ):
        """GET /api/payments/grower returns paginated payment list."""
        # Create batch and payment first
        await self._create_batch(
            tenant_client, auth_headers, seed_grower, seed_packhouse, seed_harvest_team
        )
        create_resp = await tenant_client.post(
            "/api/payments/grower",
            headers=auth_headers,
            json={
                "grower_id": seed_grower,
                "amount": 4000.0,
                "payment_date": str(date.today()),
            },
        )
        assert create_resp.status_code == 201

        # List payments
        resp = await tenant_client.get(
            "/api/payments/grower",
            headers=auth_headers,
            params={"grower_id": seed_grower},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "items" in data
        assert "total" in data
        assert data["total"] >= 1
        assert len(data["items"]) >= 1

    async def test_update_grower_payment(
        self,
        tenant_client: AsyncClient,
        auth_headers: dict,
        seed_grower: str,
        seed_packhouse: str,
        seed_harvest_team: str,
    ):
        """PATCH /api/payments/grower/{id} updates payment fields."""
        await self._create_batch(
            tenant_client, auth_headers, seed_grower, seed_packhouse, seed_harvest_team
        )

        # Create payment
        create_resp = await tenant_client.post(
            "/api/payments/grower",
            headers=auth_headers,
            json={
                "grower_id": seed_grower,
                "amount": 6000.0,
                "payment_date": str(date.today()),
            },
        )
        assert create_resp.status_code == 201
        payment_id = create_resp.json()["id"]

        # Update the payment amount and notes
        patch_resp = await tenant_client.patch(
            f"/api/payments/grower/{payment_id}",
            headers=auth_headers,
            json={
                "amount": 6500.0,
                "notes": "Adjusted after recount",
            },
        )
        assert patch_resp.status_code == 200
        updated = patch_resp.json()
        assert updated["gross_amount"] == 6500.0
        assert updated["notes"] == "Adjusted after recount"

    async def test_grower_reconciliation(
        self,
        tenant_client: AsyncClient,
        auth_headers: dict,
        seed_grower: str,
        seed_packhouse: str,
        seed_harvest_team: str,
    ):
        """GET /api/payments/grower/reconciliation/{grower_id} returns batch and payment details."""
        # Create a batch
        await self._create_batch(
            tenant_client, auth_headers, seed_grower, seed_packhouse, seed_harvest_team
        )

        # Create a payment
        await tenant_client.post(
            "/api/payments/grower",
            headers=auth_headers,
            json={
                "grower_id": seed_grower,
                "amount": 2500.0,
                "payment_date": str(date.today()),
            },
        )

        # Get reconciliation detail
        resp = await tenant_client.get(
            f"/api/payments/grower/reconciliation/{seed_grower}",
            headers=auth_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["grower_id"] == seed_grower
        assert "batches" in data
        assert "payments" in data
        assert "total_intake_kg" in data
        assert "total_paid" in data
        assert "total_batches" in data
        assert data["total_batches"] >= 1
        assert data["total_paid"] >= 2500.0

    # ── Team Payment Tests ────────────────────────────────────

    async def test_create_team_payment(
        self,
        tenant_client: AsyncClient,
        auth_headers: dict,
        seed_grower: str,
        seed_packhouse: str,
        seed_harvest_team: str,
    ):
        """POST /api/payments/team creates a team payment and returns 201."""
        # Create a batch so the team has deliveries
        await self._create_batch(
            tenant_client, auth_headers, seed_grower, seed_packhouse, seed_harvest_team
        )

        resp = await tenant_client.post(
            "/api/payments/team",
            headers=auth_headers,
            json={
                "harvest_team_id": seed_harvest_team,
                "amount": 2000.0,
                "payment_date": str(date.today()),
            },
        )
        assert resp.status_code == 201
        data = resp.json()
        assert data["harvest_team_id"] == seed_harvest_team
        assert data["amount"] == 2000.0
        assert data["status"] == "paid"
        assert "payment_ref" in data
        # Team payment refs follow HTP-YYYYMMDD-NNN
        assert re.match(
            r"^HTP-\d{8}-\d{3}$", data["payment_ref"]
        ), f"Unexpected team payment ref: {data['payment_ref']}"

    async def test_team_summary(
        self,
        tenant_client: AsyncClient,
        auth_headers: dict,
        seed_grower: str,
        seed_packhouse: str,
        seed_harvest_team: str,
    ):
        """GET /api/payments/team/summary returns per-team reconciliation summaries."""
        # Create a batch and team payment
        await self._create_batch(
            tenant_client, auth_headers, seed_grower, seed_packhouse, seed_harvest_team
        )
        await tenant_client.post(
            "/api/payments/team",
            headers=auth_headers,
            json={
                "harvest_team_id": seed_harvest_team,
                "amount": 1500.0,
                "payment_date": str(date.today()),
                "payment_type": "advance",
            },
        )

        resp = await tenant_client.get(
            "/api/payments/team/summary",
            headers=auth_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        # Should include at least the seeded team
        team_ids = [s["harvest_team_id"] for s in data]
        assert seed_harvest_team in team_ids
        # Verify summary shape
        summary = next(s for s in data if s["harvest_team_id"] == seed_harvest_team)
        assert "total_batches" in summary
        assert "total_kg" in summary
        assert "total_paid" in summary
        assert "balance" in summary
        assert summary["total_paid"] >= 1500.0

    # ── Auth Tests ────────────────────────────────────────────

    async def test_payment_requires_auth(self, tenant_client: AsyncClient):
        """Payment endpoints reject unauthenticated requests with 401."""
        resp = await tenant_client.post(
            "/api/payments/grower",
            json={
                "grower_id": "any",
                "amount": 100.0,
                "payment_date": str(date.today()),
            },
        )
        assert resp.status_code == 401

    async def test_list_grower_payments_requires_auth(self, tenant_client: AsyncClient):
        """GET /api/payments/grower rejects unauthenticated requests."""
        resp = await tenant_client.get("/api/payments/grower")
        assert resp.status_code == 401

    async def test_team_payment_requires_auth(self, tenant_client: AsyncClient):
        """POST /api/payments/team rejects unauthenticated requests."""
        resp = await tenant_client.post(
            "/api/payments/team",
            json={
                "harvest_team_id": "any",
                "amount": 100.0,
                "payment_date": str(date.today()),
            },
        )
        assert resp.status_code == 401

    async def test_team_summary_requires_auth(self, tenant_client: AsyncClient):
        """GET /api/payments/team/summary rejects unauthenticated requests."""
        resp = await tenant_client.get("/api/payments/team/summary")
        assert resp.status_code == 401
