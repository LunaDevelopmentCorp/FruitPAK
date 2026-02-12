"""GRN intake endpoint tests."""

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


@pytest.mark.api
@pytest.mark.asyncio
class TestGRNCreate:
    """Test Goods Received Note creation."""

    @pytest_asyncio.fixture(autouse=True)
    async def _setup_tenant(self, db_session: AsyncSession, test_enterprise):
        """Ensure tenant schema and seed tables exist for GRN tests."""
        schema = test_enterprise.tenant_schema
        await db_session.execute(text(f'CREATE SCHEMA IF NOT EXISTS "{schema}"'))
        await db_session.execute(text(f'SET search_path TO "{schema}", public'))

        # Create minimal tables needed for GRN
        await db_session.execute(text("""
            CREATE TABLE IF NOT EXISTS growers (
                id VARCHAR(36) PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                grower_code VARCHAR(50),
                created_at TIMESTAMP DEFAULT NOW()
            )
        """))
        await db_session.execute(text("""
            CREATE TABLE IF NOT EXISTS packhouses (
                id VARCHAR(36) PRIMARY KEY,
                name VARCHAR(255) NOT NULL,
                location VARCHAR(255),
                capacity_tons_per_day INTEGER,
                cold_rooms INTEGER
            )
        """))
        await db_session.execute(text("""
            CREATE TABLE IF NOT EXISTS batches (
                id VARCHAR(36) PRIMARY KEY,
                batch_code VARCHAR(50) UNIQUE NOT NULL,
                grower_id VARCHAR(36) REFERENCES growers(id),
                packhouse_id VARCHAR(36) REFERENCES packhouses(id),
                fruit_type VARCHAR(100) NOT NULL,
                variety VARCHAR(100),
                quality_grade VARCHAR(50),
                gross_weight_kg FLOAT,
                tare_weight_kg FLOAT DEFAULT 0,
                net_weight_kg FLOAT,
                bin_count INTEGER,
                bin_type VARCHAR(100),
                harvest_date DATE,
                arrival_temp_c FLOAT,
                brix_reading FLOAT,
                delivery_notes TEXT,
                harvest_team_id VARCHAR(36),
                status VARCHAR(50) DEFAULT 'received',
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            )
        """))
        await db_session.execute(text("""
            CREATE TABLE IF NOT EXISTS batch_history (
                id VARCHAR(36) PRIMARY KEY,
                batch_id VARCHAR(36) REFERENCES batches(id),
                event_type VARCHAR(100),
                event_data JSONB,
                recorded_at TIMESTAMP DEFAULT NOW(),
                recorded_by VARCHAR(36)
            )
        """))

        # Seed a grower and packhouse
        await db_session.execute(text("""
            INSERT INTO growers (id, name, grower_code)
            VALUES ('grower-001', 'Test Grower', 'TG001')
            ON CONFLICT (id) DO NOTHING
        """))
        await db_session.execute(text("""
            INSERT INTO packhouses (id, name)
            VALUES ('packhouse-001', 'Test Packhouse')
            ON CONFLICT (id) DO NOTHING
        """))
        await db_session.flush()

    async def test_grn_create_with_weight(self, client: AsyncClient, auth_headers):
        """GRN with gross weight creates a batch and computes net weight."""
        resp = await client.post("/api/batches/grn", headers=auth_headers, json={
            "grower_id": "grower-001",
            "packhouse_id": "packhouse-001",
            "fruit_type": "apple",
            "variety": "Fuji",
            "gross_weight_kg": 1200,
            "tare_weight_kg": 50,
        })
        assert resp.status_code == 201
        data = resp.json()
        assert "batch" in data
        assert data["batch"]["fruit_type"] == "apple"
        assert data["batch"]["net_weight_kg"] == 1150.0

    async def test_grn_create_with_bins(self, client: AsyncClient, auth_headers):
        """GRN with bin count (no weight) creates a batch."""
        resp = await client.post("/api/batches/grn", headers=auth_headers, json={
            "grower_id": "grower-001",
            "packhouse_id": "packhouse-001",
            "fruit_type": "pear",
            "bin_count": 24,
            "bin_type": "Plastic bin",
        })
        assert resp.status_code == 201
        data = resp.json()
        assert data["batch"]["bin_count"] == 24

    async def test_grn_missing_required_fields(self, client: AsyncClient, auth_headers):
        """GRN without required fields returns 422."""
        resp = await client.post("/api/batches/grn", headers=auth_headers, json={
            "packhouse_id": "packhouse-001",
            "fruit_type": "apple",
            "gross_weight_kg": 1200,
        })
        assert resp.status_code == 422

    async def test_grn_requires_auth(self, client: AsyncClient):
        """GRN endpoint rejects unauthenticated requests."""
        resp = await client.post("/api/batches/grn", json={
            "grower_id": "grower-001",
            "packhouse_id": "packhouse-001",
            "fruit_type": "apple",
            "gross_weight_kg": 1200,
        })
        assert resp.status_code == 401
