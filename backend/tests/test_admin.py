"""Tests for admin and platform endpoints.

Covers:
    Admin (require administrator role):
        GET    /api/admin/overview
        GET    /api/admin/activity
        GET    /api/admin/users
        PATCH  /api/admin/users/{user_id}
        POST   /api/admin/users/{user_id}/deactivate
        POST   /api/admin/users/{user_id}/activate
        GET    /api/admin/deleted-items

    Platform (require platform_admin role):
        GET    /api/platform/stats
        GET    /api/platform/enterprises
        GET    /api/platform/users
"""

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.jwt import create_access_token
from app.auth.password import hash_password
from app.models.public.user import User, UserRole


@pytest.mark.integration
@pytest.mark.asyncio
class TestAdminEndpoints:
    """Test admin-only endpoints under /api/admin/."""

    async def test_admin_overview(
        self, tenant_client: AsyncClient, auth_headers: dict
    ):
        """GET /api/admin/overview returns dashboard stats."""
        resp = await tenant_client.get(
            "/api/admin/overview", headers=auth_headers
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "batch_pipeline" in data
        assert "lot_pipeline" in data
        assert "pallet_pipeline" in data
        assert "container_pipeline" in data
        assert "today_batches" in data
        assert "stale_items" in data

    async def test_admin_activity_log(
        self, tenant_client: AsyncClient, auth_headers: dict
    ):
        """GET /api/admin/activity returns paginated activity entries."""
        resp = await tenant_client.get(
            "/api/admin/activity", headers=auth_headers
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "items" in data
        assert "total" in data

    async def test_admin_activity_log_with_filters(
        self, tenant_client: AsyncClient, auth_headers: dict
    ):
        """GET /api/admin/activity accepts query params."""
        resp = await tenant_client.get(
            "/api/admin/activity",
            headers=auth_headers,
            params={"entity_type": "batch", "limit": 10, "offset": 0},
        )
        assert resp.status_code == 200

    async def test_admin_list_users(
        self, tenant_client: AsyncClient, auth_headers: dict
    ):
        """GET /api/admin/users returns list of UserSummary."""
        resp = await tenant_client.get(
            "/api/admin/users", headers=auth_headers
        )
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    async def test_admin_deactivate_user(
        self,
        tenant_client: AsyncClient,
        auth_headers: dict,
        db_session: AsyncSession,
        test_user_with_enterprise: User,
    ):
        """POST /api/admin/users/{id}/deactivate sets is_active=False."""
        # Create a second user in the same enterprise to deactivate
        second_user = User(
            email="deactivate-target@example.com",
            full_name="Deactivate Target",
            hashed_password=hash_password("password123"),
            role=UserRole.OPERATOR,
            is_active=True,
            enterprise_id=test_user_with_enterprise.enterprise_id,
        )
        db_session.add(second_user)
        await db_session.flush()
        await db_session.refresh(second_user)

        resp = await tenant_client.post(
            f"/api/admin/users/{second_user.id}/deactivate",
            headers=auth_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["is_active"] is False

    async def test_admin_activate_user(
        self,
        tenant_client: AsyncClient,
        auth_headers: dict,
        db_session: AsyncSession,
        test_user_with_enterprise: User,
    ):
        """POST /api/admin/users/{id}/activate sets is_active=True."""
        # Create an inactive user to activate
        inactive_user = User(
            email="activate-target@example.com",
            full_name="Activate Target",
            hashed_password=hash_password("password123"),
            role=UserRole.OPERATOR,
            is_active=False,
            enterprise_id=test_user_with_enterprise.enterprise_id,
        )
        db_session.add(inactive_user)
        await db_session.flush()
        await db_session.refresh(inactive_user)

        resp = await tenant_client.post(
            f"/api/admin/users/{inactive_user.id}/activate",
            headers=auth_headers,
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["is_active"] is True

    async def test_admin_deleted_items(
        self, tenant_client: AsyncClient, auth_headers: dict
    ):
        """GET /api/admin/deleted-items returns grouped deleted items."""
        resp = await tenant_client.get(
            "/api/admin/deleted-items", headers=auth_headers
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "batches" in data
        assert "lots" in data
        assert "pallets" in data
        assert "containers" in data
        assert "total_count" in data

    async def test_admin_requires_auth(self, tenant_client: AsyncClient):
        """Admin endpoints reject unauthenticated requests."""
        resp = await tenant_client.get("/api/admin/overview")
        assert resp.status_code == 401

    async def test_admin_requires_admin_role(
        self,
        tenant_client: AsyncClient,
        test_user_with_enterprise: User,
        test_enterprise,
    ):
        """Admin endpoints reject non-administrator roles."""
        operator_token = create_access_token(
            user_id=test_user_with_enterprise.id,
            role="operator",
            permissions=["batch.read"],
            tenant_schema=test_enterprise.tenant_schema,
        )
        headers = {"Authorization": f"Bearer {operator_token}"}
        resp = await tenant_client.get(
            "/api/admin/overview", headers=headers
        )
        assert resp.status_code == 403


@pytest.mark.integration
@pytest.mark.asyncio
class TestPlatformEndpoints:
    """Test platform admin endpoints under /api/platform/."""

    @pytest_asyncio.fixture
    async def platform_user(
        self, db_session: AsyncSession, test_enterprise
    ) -> User:
        """Create a platform_admin user for platform endpoint tests."""
        user = User(
            email="platform-admin@example.com",
            full_name="Platform Admin",
            hashed_password=hash_password("platformpass123"),
            role=UserRole.PLATFORM_ADMIN,
            is_active=True,
            enterprise_id=test_enterprise.id,
        )
        db_session.add(user)
        await db_session.flush()
        await db_session.refresh(user)
        return user

    @pytest.fixture
    def platform_headers(self, platform_user: User) -> dict:
        """Authorization headers with platform_admin JWT."""
        token = create_access_token(
            user_id=platform_user.id,
            role="platform_admin",
            permissions=["*"],
            tenant_schema=None,
        )
        return {"Authorization": f"Bearer {token}"}

    async def test_platform_stats(
        self, tenant_client: AsyncClient, platform_headers: dict
    ):
        """GET /api/platform/stats returns platform-wide statistics."""
        resp = await tenant_client.get(
            "/api/platform/stats", headers=platform_headers
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "total_enterprises" in data
        assert "active_enterprises" in data
        assert "total_users" in data
        assert "active_users" in data

    async def test_platform_list_enterprises(
        self, tenant_client: AsyncClient, platform_headers: dict
    ):
        """GET /api/platform/enterprises returns enterprise list."""
        resp = await tenant_client.get(
            "/api/platform/enterprises", headers=platform_headers
        )
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    async def test_platform_list_users(
        self, tenant_client: AsyncClient, platform_headers: dict
    ):
        """GET /api/platform/users returns all users across enterprises."""
        resp = await tenant_client.get(
            "/api/platform/users", headers=platform_headers
        )
        assert resp.status_code == 200
        assert isinstance(resp.json(), list)

    async def test_platform_requires_platform_admin(
        self, tenant_client: AsyncClient, auth_headers: dict
    ):
        """Regular administrator cannot access platform endpoints (403)."""
        resp = await tenant_client.get(
            "/api/platform/stats", headers=auth_headers
        )
        assert resp.status_code == 403

    async def test_platform_requires_auth(self, tenant_client: AsyncClient):
        """Platform endpoints reject unauthenticated requests."""
        resp = await tenant_client.get("/api/platform/stats")
        assert resp.status_code == 401
