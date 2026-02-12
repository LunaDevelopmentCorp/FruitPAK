"""Wizard endpoint tests."""

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


@pytest.mark.api
@pytest.mark.asyncio
class TestWizard:
    """Test setup wizard endpoints."""

    @pytest_asyncio.fixture(autouse=True)
    async def _setup_tenant(self, db_session: AsyncSession, test_enterprise):
        """Ensure tenant schema and wizard_state table exist."""
        schema = test_enterprise.tenant_schema
        await db_session.execute(text(f'CREATE SCHEMA IF NOT EXISTS "{schema}"'))
        await db_session.execute(text(f'SET search_path TO "{schema}", public'))

        await db_session.execute(text("""
            CREATE TABLE IF NOT EXISTS wizard_state (
                id VARCHAR(36) PRIMARY KEY,
                current_step INTEGER DEFAULT 1,
                completed_steps JSONB DEFAULT '[]',
                draft_data JSONB,
                completed_data JSONB DEFAULT '{}',
                is_complete BOOLEAN DEFAULT false,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            )
        """))
        await db_session.execute(text("""
            CREATE TABLE IF NOT EXISTS company_profiles (
                id VARCHAR(36) PRIMARY KEY,
                trading_name VARCHAR(255),
                legal_name VARCHAR(255),
                registration_number VARCHAR(100),
                vat_number VARCHAR(100),
                exporter_code VARCHAR(100),
                address JSONB,
                contact JSONB,
                created_at TIMESTAMP DEFAULT NOW(),
                updated_at TIMESTAMP DEFAULT NOW()
            )
        """))
        await db_session.flush()

    async def test_get_progress(self, client: AsyncClient, auth_headers):
        """GET /wizard/ returns progress with initial state."""
        resp = await client.get("/api/wizard/", headers=auth_headers)
        assert resp.status_code == 200
        data = resp.json()
        assert "current_step" in data
        assert "completed_steps" in data
        assert "is_complete" in data

    async def test_save_step1_draft(self, client: AsyncClient, auth_headers):
        """PATCH /wizard/step/1 saves draft data without completing."""
        resp = await client.patch(
            "/api/wizard/step/1",
            headers=auth_headers,
            json={"trading_name": "Test Farm Ltd"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert 1 not in data.get("completed_steps", [])

    async def test_save_step1_complete(self, client: AsyncClient, auth_headers):
        """PATCH /wizard/step/1?complete=true completes the step."""
        resp = await client.patch(
            "/api/wizard/step/1?complete=true",
            headers=auth_headers,
            json={"trading_name": "Test Farm Ltd"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert 1 in data.get("completed_steps", [])

    async def test_wizard_requires_auth(self, client: AsyncClient):
        """Wizard endpoint rejects unauthenticated requests."""
        resp = await client.get("/api/wizard/")
        assert resp.status_code == 401
