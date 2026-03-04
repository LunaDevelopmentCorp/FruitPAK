"""Container lifecycle integration tests.

Covers the full container workflow: create -> load -> mark-loaded -> seal -> dispatch,
as well as edge cases for status validation, revert, update, delete, and auth.
"""

import pytest
from httpx import AsyncClient


# ── Helpers ──────────────────────────────────────────────────────


async def _create_container(client: AsyncClient, headers: dict) -> dict:
    """Create an empty container and return the response JSON."""
    resp = await client.post("/api/containers/", headers=headers, json={
        "container_type": "Reefer 40ft",
        "capacity_pallets": 20,
    })
    assert resp.status_code == 201, resp.text
    return resp.json()


async def _create_pallet(
    client: AsyncClient,
    headers: dict,
    grower_id: str,
    packhouse_id: str,
    harvest_team_id: str,
) -> str:
    """Create a batch -> lot -> pallet and return the pallet ID."""
    # 1. Create batch via GRN
    grn_resp = await client.post("/api/batches/grn", headers=headers, json={
        "grower_id": grower_id,
        "packhouse_id": packhouse_id,
        "harvest_team_id": harvest_team_id,
        "fruit_type": "apple",
        "variety": "Fuji",
        "gross_weight_kg": 1200,
        "tare_weight_kg": 50,
    })
    assert grn_resp.status_code == 201, grn_resp.text
    batch_id = grn_resp.json()["batch"]["id"]

    # 2. Create lot from batch
    lot_resp = await client.post(
        f"/api/lots/from-batch/{batch_id}",
        headers=headers,
        json={"lots": [{"grade": "A", "size": "Medium", "carton_count": 60}]},
    )
    assert lot_resp.status_code == 201, lot_resp.text
    lot_id = lot_resp.json()[0]["id"]

    # 3. Create pallet from lot
    pallet_resp = await client.post("/api/pallets/from-lots", headers=headers, json={
        "pallet_type_name": "EUR-1",
        "capacity_boxes": 240,
        "packhouse_id": packhouse_id,
        "lot_assignments": [{"lot_id": lot_id, "box_count": 60}],
    })
    assert pallet_resp.status_code == 201, pallet_resp.text
    return pallet_resp.json()[0]["id"]


async def _advance_container_to_sealed(
    client: AsyncClient,
    headers: dict,
    container_id: str,
    pallet_id: str,
) -> None:
    """Load a pallet, mark loaded, and seal a container."""
    # Load pallet
    resp = await client.post(
        f"/api/containers/{container_id}/load-pallets",
        headers=headers,
        json={"pallet_ids": [pallet_id]},
    )
    assert resp.status_code == 200, resp.text

    # Mark loaded
    resp = await client.post(
        f"/api/containers/{container_id}/mark-loaded",
        headers=headers,
    )
    assert resp.status_code == 200, resp.text

    # Seal
    resp = await client.post(
        f"/api/containers/{container_id}/seal",
        headers=headers,
        json={"seal_number": "SEAL-001"},
    )
    assert resp.status_code == 200, resp.text


# ── Test Class ───────────────────────────────────────────────────


@pytest.mark.integration
@pytest.mark.asyncio
class TestContainerLifecycle:
    """Integration tests for container CRUD and status lifecycle."""

    # ── Create ────────────────────────────────────────────────

    async def test_create_empty_container(self, tenant_client, auth_headers):
        """POST /api/containers/ creates an empty container with status 'open'."""
        data = await _create_container(tenant_client, auth_headers)

        assert data["status"] == "open"
        assert data["container_type"] == "Reefer 40ft"
        assert data["capacity_pallets"] == 20
        assert data["pallet_count"] == 0
        assert data["total_cartons"] == 0
        assert "id" in data
        assert "container_number" in data

    # ── List ──────────────────────────────────────────────────

    async def test_list_containers(self, tenant_client, auth_headers):
        """GET /api/containers/ returns a paginated list including the created container."""
        # Create a container first
        created = await _create_container(tenant_client, auth_headers)

        resp = await tenant_client.get("/api/containers/", headers=auth_headers)
        assert resp.status_code == 200
        body = resp.json()

        assert "items" in body
        assert "total" in body
        assert body["total"] >= 1

        ids = [c["id"] for c in body["items"]]
        assert created["id"] in ids

    async def test_list_containers_filter_by_status(self, tenant_client, auth_headers):
        """GET /api/containers/?status=open filters by status."""
        await _create_container(tenant_client, auth_headers)

        resp = await tenant_client.get(
            "/api/containers/", headers=auth_headers, params={"status": "open"},
        )
        assert resp.status_code == 200
        body = resp.json()
        for item in body["items"]:
            assert item["status"] == "open"

    # ── Detail ────────────────────────────────────────────────

    async def test_container_detail(self, tenant_client, auth_headers):
        """GET /api/containers/{id} returns full container detail with traceability."""
        created = await _create_container(tenant_client, auth_headers)
        container_id = created["id"]

        resp = await tenant_client.get(
            f"/api/containers/{container_id}", headers=auth_headers,
        )
        assert resp.status_code == 200
        detail = resp.json()

        assert detail["id"] == container_id
        assert detail["container_type"] == "Reefer 40ft"
        assert detail["status"] == "open"
        assert "traceability" in detail
        assert "pallets" in detail

    async def test_container_detail_not_found(self, tenant_client, auth_headers):
        """GET /api/containers/{id} returns 404 for a nonexistent ID."""
        resp = await tenant_client.get(
            "/api/containers/nonexistent-id", headers=auth_headers,
        )
        assert resp.status_code == 404

    # ── Load pallets ──────────────────────────────────────────

    async def test_load_pallets_into_container(
        self, tenant_client, auth_headers,
        seed_grower, seed_packhouse, seed_harvest_team,
    ):
        """POST /api/containers/{id}/load-pallets transitions open -> loading."""
        pallet_id = await _create_pallet(
            tenant_client, auth_headers,
            seed_grower, seed_packhouse, seed_harvest_team,
        )
        container = await _create_container(tenant_client, auth_headers)
        container_id = container["id"]

        resp = await tenant_client.post(
            f"/api/containers/{container_id}/load-pallets",
            headers=auth_headers,
            json={"pallet_ids": [pallet_id]},
        )
        assert resp.status_code == 200, resp.text
        data = resp.json()

        assert data["status"] == "loading"
        assert data["pallet_count"] == 1

    # ── Full lifecycle ────────────────────────────────────────

    async def test_container_lifecycle_full(
        self, tenant_client, auth_headers,
        seed_grower, seed_packhouse, seed_harvest_team,
    ):
        """Full forward lifecycle: create -> load -> mark-loaded -> seal -> dispatch."""
        pallet_id = await _create_pallet(
            tenant_client, auth_headers,
            seed_grower, seed_packhouse, seed_harvest_team,
        )
        container = await _create_container(tenant_client, auth_headers)
        container_id = container["id"]

        # 1. Load pallet -> status becomes "loading"
        resp = await tenant_client.post(
            f"/api/containers/{container_id}/load-pallets",
            headers=auth_headers,
            json={"pallet_ids": [pallet_id]},
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "loading"

        # 2. Mark loaded -> status becomes "loaded"
        resp = await tenant_client.post(
            f"/api/containers/{container_id}/mark-loaded",
            headers=auth_headers,
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "loaded"

        # 3. Seal -> status becomes "sealed"
        resp = await tenant_client.post(
            f"/api/containers/{container_id}/seal",
            headers=auth_headers,
            json={"seal_number": "SEAL-XYZ-123"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "sealed"

        # 4. Dispatch -> status becomes "dispatched"
        resp = await tenant_client.post(
            f"/api/containers/{container_id}/dispatch",
            headers=auth_headers,
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "dispatched"

    # ── Seal validation ───────────────────────────────────────

    async def test_seal_requires_seal_number(self, tenant_client, auth_headers):
        """POST /api/containers/{id}/seal without seal_number returns 422."""
        container = await _create_container(tenant_client, auth_headers)
        container_id = container["id"]

        # Try to seal with empty body (missing required seal_number)
        resp = await tenant_client.post(
            f"/api/containers/{container_id}/seal",
            headers=auth_headers,
            json={},
        )
        assert resp.status_code == 422

    async def test_seal_requires_loaded_status(
        self, tenant_client, auth_headers,
    ):
        """POST /api/containers/{id}/seal on an 'open' container returns 422."""
        container = await _create_container(tenant_client, auth_headers)
        container_id = container["id"]

        resp = await tenant_client.post(
            f"/api/containers/{container_id}/seal",
            headers=auth_headers,
            json={"seal_number": "SEAL-999"},
        )
        assert resp.status_code == 422

    # ── Cannot load sealed/dispatched ─────────────────────────

    async def test_cannot_load_to_sealed_container(
        self, tenant_client, auth_headers,
        seed_grower, seed_packhouse, seed_harvest_team,
    ):
        """Loading pallets into a sealed container returns 422."""
        # Create first pallet and advance container to sealed
        pallet_id_1 = await _create_pallet(
            tenant_client, auth_headers,
            seed_grower, seed_packhouse, seed_harvest_team,
        )
        container = await _create_container(tenant_client, auth_headers)
        container_id = container["id"]

        await _advance_container_to_sealed(
            tenant_client, auth_headers, container_id, pallet_id_1,
        )

        # Create a second pallet
        pallet_id_2 = await _create_pallet(
            tenant_client, auth_headers,
            seed_grower, seed_packhouse, seed_harvest_team,
        )

        # Attempt to load second pallet into sealed container
        resp = await tenant_client.post(
            f"/api/containers/{container_id}/load-pallets",
            headers=auth_headers,
            json={"pallet_ids": [pallet_id_2]},
        )
        assert resp.status_code == 422
        assert "Cannot load pallets" in resp.json()["detail"]

    # ── Mark loaded validation ────────────────────────────────

    async def test_mark_loaded_requires_pallets(self, tenant_client, auth_headers):
        """Mark-loaded on an open container with 0 pallets returns 422."""
        container = await _create_container(tenant_client, auth_headers)
        container_id = container["id"]

        resp = await tenant_client.post(
            f"/api/containers/{container_id}/mark-loaded",
            headers=auth_headers,
        )
        # Container is "open" (not "loading"), so 422 for wrong status
        assert resp.status_code == 422

    # ── Dispatch validation ───────────────────────────────────

    async def test_dispatch_requires_sealed_status(self, tenant_client, auth_headers):
        """Dispatch on an open container returns 422."""
        container = await _create_container(tenant_client, auth_headers)
        container_id = container["id"]

        resp = await tenant_client.post(
            f"/api/containers/{container_id}/dispatch",
            headers=auth_headers,
        )
        assert resp.status_code == 422

    # ── Revert ────────────────────────────────────────────────

    async def test_revert_status(
        self, tenant_client, auth_headers,
        seed_grower, seed_packhouse, seed_harvest_team,
    ):
        """Revert steps the container back one status."""
        pallet_id = await _create_pallet(
            tenant_client, auth_headers,
            seed_grower, seed_packhouse, seed_harvest_team,
        )
        container = await _create_container(tenant_client, auth_headers)
        container_id = container["id"]

        await _advance_container_to_sealed(
            tenant_client, auth_headers, container_id, pallet_id,
        )

        # Container is "sealed" -> revert to "loaded"
        resp = await tenant_client.post(
            f"/api/containers/{container_id}/revert",
            headers=auth_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "loaded"

        # Revert again: "loaded" -> "loading"
        resp = await tenant_client.post(
            f"/api/containers/{container_id}/revert",
            headers=auth_headers,
        )
        assert resp.status_code == 200
        assert resp.json()["status"] == "loading"

    async def test_revert_open_container_fails(self, tenant_client, auth_headers):
        """Reverting an open container (no previous step) returns 422."""
        container = await _create_container(tenant_client, auth_headers)
        container_id = container["id"]

        resp = await tenant_client.post(
            f"/api/containers/{container_id}/revert",
            headers=auth_headers,
        )
        assert resp.status_code == 422
        assert "Cannot revert" in resp.json()["detail"]

    # ── Update ────────────────────────────────────────────────

    async def test_update_container(self, tenant_client, auth_headers):
        """PATCH /api/containers/{id} updates container details."""
        container = await _create_container(tenant_client, auth_headers)
        container_id = container["id"]

        resp = await tenant_client.patch(
            f"/api/containers/{container_id}",
            headers=auth_headers,
            json={
                "destination": "Rotterdam, NL",
                "notes": "Handle with care",
            },
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["destination"] == "Rotterdam, NL"

    async def test_update_nonexistent_container(self, tenant_client, auth_headers):
        """PATCH on a nonexistent container returns 404."""
        resp = await tenant_client.patch(
            "/api/containers/nonexistent-id",
            headers=auth_headers,
            json={"destination": "Nowhere"},
        )
        assert resp.status_code == 404

    # ── Delete ────────────────────────────────────────────────

    async def test_delete_empty_container(self, tenant_client, auth_headers):
        """DELETE /api/containers/{id} soft-deletes an empty open container."""
        container = await _create_container(tenant_client, auth_headers)
        container_id = container["id"]

        resp = await tenant_client.delete(
            f"/api/containers/{container_id}", headers=auth_headers,
        )
        assert resp.status_code == 204

        # Confirm it is no longer visible
        resp = await tenant_client.get(
            f"/api/containers/{container_id}", headers=auth_headers,
        )
        assert resp.status_code == 404

    async def test_cannot_delete_loaded_container(
        self, tenant_client, auth_headers,
        seed_grower, seed_packhouse, seed_harvest_team,
    ):
        """DELETE on a loading container with pallets returns 400."""
        pallet_id = await _create_pallet(
            tenant_client, auth_headers,
            seed_grower, seed_packhouse, seed_harvest_team,
        )
        container = await _create_container(tenant_client, auth_headers)
        container_id = container["id"]

        # Load pallet -> transitions to "loading" with pallet_count=1
        resp = await tenant_client.post(
            f"/api/containers/{container_id}/load-pallets",
            headers=auth_headers,
            json={"pallet_ids": [pallet_id]},
        )
        assert resp.status_code == 200

        # Attempt to delete
        resp = await tenant_client.delete(
            f"/api/containers/{container_id}", headers=auth_headers,
        )
        assert resp.status_code == 400
        assert "pallet" in resp.json()["detail"].lower()

    async def test_cannot_delete_sealed_container(
        self, tenant_client, auth_headers,
        seed_grower, seed_packhouse, seed_harvest_team,
    ):
        """DELETE on a sealed container returns 400."""
        pallet_id = await _create_pallet(
            tenant_client, auth_headers,
            seed_grower, seed_packhouse, seed_harvest_team,
        )
        container = await _create_container(tenant_client, auth_headers)
        container_id = container["id"]

        await _advance_container_to_sealed(
            tenant_client, auth_headers, container_id, pallet_id,
        )

        resp = await tenant_client.delete(
            f"/api/containers/{container_id}", headers=auth_headers,
        )
        assert resp.status_code == 400

    # ── Auth ──────────────────────────────────────────────────

    async def test_container_requires_auth(self, tenant_client):
        """Container endpoints reject unauthenticated requests."""
        resp = await tenant_client.get("/api/containers/")
        assert resp.status_code == 401

        resp = await tenant_client.post("/api/containers/", json={
            "container_type": "Reefer 40ft",
            "capacity_pallets": 20,
        })
        assert resp.status_code == 401

        resp = await tenant_client.delete("/api/containers/fake-id")
        assert resp.status_code == 401

        resp = await tenant_client.post(
            "/api/containers/fake-id/load-pallets",
            json={"pallet_ids": ["p1"]},
        )
        assert resp.status_code == 401

        resp = await tenant_client.post("/api/containers/fake-id/seal", json={
            "seal_number": "SEAL-001",
        })
        assert resp.status_code == 401

        resp = await tenant_client.post("/api/containers/fake-id/dispatch")
        assert resp.status_code == 401

        resp = await tenant_client.post("/api/containers/fake-id/revert")
        assert resp.status_code == 401

        resp = await tenant_client.patch(
            "/api/containers/fake-id",
            json={"destination": "nowhere"},
        )
        assert resp.status_code == 401
