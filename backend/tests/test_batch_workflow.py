"""End-to-end batch -> lot -> pallet workflow tests.

Covers the full lifecycle: GRN intake, batch listing/detail/update,
lot creation from batches, pallet creation from lots, batch closing,
and soft-delete.
"""

import pytest
from httpx import AsyncClient


# ── Helpers ──────────────────────────────────────────────────────

GRN_PAYLOAD = {
    "grower_id": "grower-test-001",
    "packhouse_id": "packhouse-test-001",
    "fruit_type": "apple",
    "variety": "Fuji",
    "gross_weight_kg": 1200.0,
    "tare_weight_kg": 50.0,
    "harvest_team_id": "team-test-001",
    "bin_count": 20,
    "bin_type": "Plastic bin",
}


async def _create_batch(
    client: AsyncClient,
    headers: dict,
    *,
    overrides: dict | None = None,
) -> dict:
    """Helper: POST /api/batches/grn and return the full response body."""
    payload = {**GRN_PAYLOAD, **(overrides or {})}
    resp = await client.post("/api/batches/grn", headers=headers, json=payload)
    assert resp.status_code == 201, resp.text
    return resp.json()


async def _create_batch_with_lots(
    client: AsyncClient,
    headers: dict,
    *,
    lots: list[dict] | None = None,
) -> tuple[dict, list[dict]]:
    """Helper: create a batch and then create lots from it.

    Returns (batch_body, lots_list).
    """
    grn = await _create_batch(client, headers)
    batch_id = grn["batch"]["id"]

    lot_items = lots or [
        {"grade": "A", "size": "Medium", "carton_count": 30},
        {"grade": "B", "size": "Large", "carton_count": 20},
    ]
    resp = await client.post(
        f"/api/lots/from-batch/{batch_id}",
        headers=headers,
        json={"lots": lot_items},
    )
    assert resp.status_code == 201, resp.text
    return grn, resp.json()


async def _create_batch_lots_pallets(
    client: AsyncClient,
    headers: dict,
    *,
    lots: list[dict] | None = None,
    capacity_boxes: int = 240,
) -> tuple[dict, list[dict], list[dict]]:
    """Helper: create batch -> lots -> pallet(s).

    Returns (grn_body, lots_list, pallets_list).
    """
    grn, created_lots = await _create_batch_with_lots(
        client, headers, lots=lots,
    )

    lot_assignments = [
        {"lot_id": lot["id"], "box_count": lot["carton_count"]}
        for lot in created_lots
    ]
    resp = await client.post(
        "/api/pallets/from-lots",
        headers=headers,
        json={
            "pallet_type_name": "EUR-1",
            "capacity_boxes": capacity_boxes,
            "packhouse_id": "packhouse-test-001",
            "lot_assignments": lot_assignments,
        },
    )
    assert resp.status_code == 201, resp.text
    return grn, created_lots, resp.json()


# ── Test Class ───────────────────────────────────────────────────

@pytest.mark.integration
@pytest.mark.asyncio
class TestBatchWorkflow:
    """End-to-end batch -> lot -> pallet workflow."""

    # ── GRN intake ───────────────────────────────────────────

    async def test_grn_creates_batch(
        self,
        tenant_client: AsyncClient,
        auth_headers: dict,
        seed_grower,
        seed_packhouse,
        seed_harvest_team,
    ):
        """POST /api/batches/grn creates a batch and returns a QR URL."""
        data = await _create_batch(tenant_client, auth_headers)

        batch = data["batch"]
        assert batch["grower_id"] == "grower-test-001"
        assert batch["packhouse_id"] == "packhouse-test-001"
        assert batch["fruit_type"] == "apple"
        assert batch["variety"] == "Fuji"
        assert batch["status"] == "received"
        assert batch["bin_count"] == 20
        assert batch["id"]  # non-empty UUID
        assert batch["batch_code"]  # auto-generated code

        assert data["qr_code_url"] == f"/api/batches/{batch['id']}/qr"

    async def test_grn_computes_net_weight(
        self,
        tenant_client: AsyncClient,
        auth_headers: dict,
        seed_grower,
        seed_packhouse,
        seed_harvest_team,
    ):
        """Net weight = gross - tare is auto-calculated."""
        data = await _create_batch(
            tenant_client,
            auth_headers,
            overrides={"gross_weight_kg": 1000.0, "tare_weight_kg": 100.0},
        )
        assert data["batch"]["net_weight_kg"] == 900.0

    async def test_grn_requires_auth(self, tenant_client: AsyncClient):
        """GRN endpoint rejects unauthenticated requests with 401."""
        resp = await tenant_client.post("/api/batches/grn", json=GRN_PAYLOAD)
        assert resp.status_code == 401

    async def test_grn_missing_fields_returns_422(
        self,
        tenant_client: AsyncClient,
        auth_headers: dict,
        seed_packhouse,
        seed_harvest_team,
    ):
        """GRN without grower_id (required) returns 422."""
        resp = await tenant_client.post(
            "/api/batches/grn",
            headers=auth_headers,
            json={
                # grower_id intentionally missing
                "packhouse_id": "packhouse-test-001",
                "fruit_type": "apple",
                "harvest_team_id": "team-test-001",
                "gross_weight_kg": 500,
            },
        )
        assert resp.status_code == 422

    # ── List / detail / update ───────────────────────────────

    async def test_list_batches(
        self,
        tenant_client: AsyncClient,
        auth_headers: dict,
        seed_grower,
        seed_packhouse,
        seed_harvest_team,
    ):
        """GET /api/batches/ returns cursor-paginated list including the new batch."""
        await _create_batch(tenant_client, auth_headers)

        resp = await tenant_client.get("/api/batches/", headers=auth_headers)
        assert resp.status_code == 200

        body = resp.json()
        assert "items" in body
        assert "has_more" in body
        assert isinstance(body["items"], list)
        assert len(body["items"]) >= 1

        # Verify shape of a summary item
        item = body["items"][0]
        assert "id" in item
        assert "batch_code" in item
        assert "fruit_type" in item
        assert "status" in item

    async def test_batch_detail(
        self,
        tenant_client: AsyncClient,
        auth_headers: dict,
        seed_grower,
        seed_packhouse,
        seed_harvest_team,
    ):
        """GET /api/batches/{id} returns full batch detail with lots and history."""
        data = await _create_batch(tenant_client, auth_headers)
        batch_id = data["batch"]["id"]

        resp = await tenant_client.get(
            f"/api/batches/{batch_id}", headers=auth_headers,
        )
        assert resp.status_code == 200

        detail = resp.json()
        assert detail["id"] == batch_id
        assert detail["fruit_type"] == "apple"
        assert "history" in detail
        assert isinstance(detail["history"], list)
        assert "lots" in detail
        assert isinstance(detail["lots"], list)

    async def test_update_batch(
        self,
        tenant_client: AsyncClient,
        auth_headers: dict,
        seed_grower,
        seed_packhouse,
        seed_harvest_team,
    ):
        """PATCH /api/batches/{id} updates mutable fields."""
        data = await _create_batch(tenant_client, auth_headers)
        batch_id = data["batch"]["id"]

        resp = await tenant_client.patch(
            f"/api/batches/{batch_id}",
            headers=auth_headers,
            json={"variety": "Granny Smith", "notes": "Updated via test"},
        )
        assert resp.status_code == 200

        updated = resp.json()
        assert updated["variety"] == "Granny Smith"
        assert updated["notes"] == "Updated via test"

    # ── Lot creation ─────────────────────────────────────────

    async def test_create_lots_from_batch(
        self,
        tenant_client: AsyncClient,
        auth_headers: dict,
        seed_grower,
        seed_packhouse,
        seed_harvest_team,
    ):
        """POST /api/lots/from-batch/{id} creates lots and sets batch to 'packing'."""
        grn_data = await _create_batch(tenant_client, auth_headers)
        batch_id = grn_data["batch"]["id"]

        lots_payload = {
            "lots": [
                {"grade": "A", "size": "Medium", "carton_count": 30},
                {"grade": "B", "size": "Large", "carton_count": 20},
            ],
        }
        resp = await tenant_client.post(
            f"/api/lots/from-batch/{batch_id}",
            headers=auth_headers,
            json=lots_payload,
        )
        assert resp.status_code == 201

        lots = resp.json()
        assert isinstance(lots, list)
        assert len(lots) == 2

        # Verify lot attributes inherited from batch
        for lot in lots:
            assert lot["batch_id"] == batch_id
            assert lot["fruit_type"] == "apple"
            assert lot["lot_code"]  # auto-generated

        grades = {lot["grade"] for lot in lots}
        assert grades == {"A", "B"}

        # Verify batch status changed to packing
        batch_resp = await tenant_client.get(
            f"/api/batches/{batch_id}", headers=auth_headers,
        )
        assert batch_resp.status_code == 200
        assert batch_resp.json()["status"] == "packing"

        # Verify lots appear in the lots listing filtered by batch_id
        lots_list_resp = await tenant_client.get(
            f"/api/lots/?batch_id={batch_id}", headers=auth_headers,
        )
        assert lots_list_resp.status_code == 200
        lots_body = lots_list_resp.json()
        assert lots_body["total"] == 2
        assert len(lots_body["items"]) == 2

    # ── Pallet creation ──────────────────────────────────────

    async def test_create_pallet_from_lots(
        self,
        tenant_client: AsyncClient,
        auth_headers: dict,
        seed_grower,
        seed_packhouse,
        seed_harvest_team,
    ):
        """POST /api/pallets/from-lots creates a pallet from lot assignments."""
        grn, created_lots, pallets = await _create_batch_lots_pallets(
            tenant_client, auth_headers,
        )

        assert len(pallets) >= 1
        pallet = pallets[0]
        assert pallet["pallet_number"]  # auto-generated
        assert pallet["pallet_type_name"] == "EUR-1"
        assert pallet["capacity_boxes"] == 240
        # Total assigned = 30 + 20 = 50
        assert pallet["current_boxes"] == 50

        # Verify pallets appear in listing
        resp = await tenant_client.get("/api/pallets/", headers=auth_headers)
        assert resp.status_code == 200
        body = resp.json()
        assert body["total"] >= 1

    # ── Close batch ──────────────────────────────────────────

    async def test_close_batch_requires_all_palletized(
        self,
        tenant_client: AsyncClient,
        auth_headers: dict,
        seed_grower,
        seed_packhouse,
        seed_harvest_team,
    ):
        """POST /api/batches/{id}/close fails when lots have unpalletized boxes."""
        # Create batch with lots but do NOT palletize them
        grn, created_lots = await _create_batch_with_lots(
            tenant_client, auth_headers,
        )
        batch_id = grn["batch"]["id"]

        # Attempting to close should fail -- lots are not palletized
        resp = await tenant_client.post(
            f"/api/batches/{batch_id}/close", headers=auth_headers,
        )
        assert resp.status_code == 400
        assert "Cannot close" in resp.json()["detail"]

        # Now palletize ALL lots fully
        lot_assignments = [
            {"lot_id": lot["id"], "box_count": lot["carton_count"]}
            for lot in created_lots
        ]
        pallet_resp = await tenant_client.post(
            "/api/pallets/from-lots",
            headers=auth_headers,
            json={
                "pallet_type_name": "EUR-1",
                "capacity_boxes": 240,
                "packhouse_id": "packhouse-test-001",
                "lot_assignments": lot_assignments,
            },
        )
        assert pallet_resp.status_code == 201

        # Now close should succeed
        close_resp = await tenant_client.post(
            f"/api/batches/{batch_id}/close", headers=auth_headers,
        )
        assert close_resp.status_code == 200
        assert close_resp.json()["status"] == "complete"

    # ── Soft-delete ──────────────────────────────────────────

    async def test_soft_delete_batch(
        self,
        tenant_client: AsyncClient,
        auth_headers: dict,
        seed_grower,
        seed_packhouse,
        seed_harvest_team,
    ):
        """DELETE /api/batches/{id} soft-deletes a batch (no palletized lots)."""
        data = await _create_batch(tenant_client, auth_headers)
        batch_id = data["batch"]["id"]

        resp = await tenant_client.delete(
            f"/api/batches/{batch_id}", headers=auth_headers,
        )
        assert resp.status_code == 204

        # Batch should no longer appear in detail
        detail_resp = await tenant_client.get(
            f"/api/batches/{batch_id}", headers=auth_headers,
        )
        assert detail_resp.status_code == 404
