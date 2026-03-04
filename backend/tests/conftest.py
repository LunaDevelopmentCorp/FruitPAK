"""Pytest configuration and fixtures for FruitPAK tests.

Provides reusable test fixtures for database, authentication, Redis, etc.

Two types of tests:
  - Public-schema tests: use `client` fixture (overrides get_db only)
  - Tenant-scoped tests: use `tenant_client` fixture (overrides both
    get_db and get_tenant_db, creates tenant schema + tables)
"""

import asyncio
from typing import AsyncGenerator, Generator

import pytest
import pytest_asyncio
from httpx import AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

from app.main import app
from app.config import settings
from app.database import get_db, get_tenant_db
from app.auth.jwt import create_access_token
from app.auth.password import hash_password
from app.models.public.user import User, UserRole
from app.models.public.enterprise import Enterprise


# ── Test Database Setup ──────────────────────────────────────────

TEST_TENANT_SCHEMA = "tenant_testrunner1"


@pytest.fixture(scope="session")
def event_loop() -> Generator:
    """Create event loop for async tests."""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture(scope="session")
async def test_engine():
    """Create test database engine."""
    # Use test database (replace DB name in async URL)
    test_db_url = settings.database_url.rsplit("/", 1)[0] + "/fruitpak_test"

    engine = create_async_engine(test_db_url, echo=False)

    # Verify connectivity
    async with engine.begin() as conn:
        await conn.execute(text("SELECT 1"))

    yield engine

    await engine.dispose()


@pytest_asyncio.fixture(scope="session")
async def _create_tenant_schema(test_engine):
    """Create the test tenant schema and all TenantBase tables once per session."""
    from app.database import TenantBase

    async with test_engine.begin() as conn:
        await conn.execute(text(f'CREATE SCHEMA IF NOT EXISTS "{TEST_TENANT_SCHEMA}"'))

        def _sync_create(sync_conn):
            for table in TenantBase.metadata.tables.values():
                table.schema = TEST_TENANT_SCHEMA
            TenantBase.metadata.create_all(bind=sync_conn, checkfirst=True)
            for table in TenantBase.metadata.tables.values():
                table.schema = None

        await conn.run_sync(_sync_create)

    yield

    # Cleanup: drop the test tenant schema
    async with test_engine.begin() as conn:
        await conn.execute(text(f'DROP SCHEMA IF EXISTS "{TEST_TENANT_SCHEMA}" CASCADE'))


@pytest_asyncio.fixture
async def db_session(test_engine) -> AsyncGenerator[AsyncSession, None]:
    """Create database session for tests (public schema)."""
    async_session_factory = sessionmaker(
        test_engine, class_=AsyncSession, expire_on_commit=False
    )

    async with async_session_factory() as session:
        await session.begin()
        yield session
        await session.rollback()


@pytest_asyncio.fixture
async def tenant_db_session(
    test_engine, _create_tenant_schema
) -> AsyncGenerator[AsyncSession, None]:
    """Create database session pinned to the tenant schema.

    Uses a SAVEPOINT so each test runs in isolation without affecting
    the tenant schema tables created at session scope.
    """
    async_session_factory = sessionmaker(
        test_engine, class_=AsyncSession, expire_on_commit=False
    )

    async with async_session_factory() as session:
        await session.begin()
        await session.execute(
            text(f'SET search_path TO "{TEST_TENANT_SCHEMA}", pg_catalog')
        )
        yield session
        await session.rollback()


@pytest_asyncio.fixture
async def client(db_session) -> AsyncGenerator[AsyncClient, None]:
    """Create test client with overridden public-schema DB dependency."""

    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db

    async with AsyncClient(app=app, base_url="http://test") as client:
        yield client

    app.dependency_overrides.clear()


@pytest_asyncio.fixture
async def tenant_client(
    db_session, tenant_db_session
) -> AsyncGenerator[AsyncClient, None]:
    """Create test client with both public and tenant DB overrides.

    Use this for endpoints that hit tenant-scoped tables (batches, lots,
    pallets, containers, payments, config, etc.).
    """
    from app.tenancy import set_current_tenant_schema, clear_tenant_context

    async def override_get_db():
        yield db_session

    async def override_get_tenant_db():
        yield tenant_db_session

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_tenant_db] = override_get_tenant_db

    # Set tenant context so @cached and other ContextVar readers work
    set_current_tenant_schema(TEST_TENANT_SCHEMA)

    async with AsyncClient(app=app, base_url="http://test") as client:
        yield client

    clear_tenant_context()
    app.dependency_overrides.clear()


# ── Test Data Fixtures ───────────────────────────────────────────

@pytest_asyncio.fixture
async def test_user(db_session: AsyncSession) -> User:
    """Create test user."""
    user = User(
        email="test@example.com",
        full_name="Test User",
        hashed_password=hash_password("testpassword123"),
        role=UserRole.ADMINISTRATOR,
        is_active=True,
    )
    db_session.add(user)
    await db_session.flush()
    await db_session.refresh(user)
    return user


@pytest_asyncio.fixture
async def test_enterprise(db_session: AsyncSession) -> Enterprise:
    """Create test enterprise."""
    enterprise = Enterprise(
        name="Test Enterprise",
        country="US",
        tenant_schema=TEST_TENANT_SCHEMA,
        is_onboarded=True,
    )
    db_session.add(enterprise)
    await db_session.flush()
    await db_session.refresh(enterprise)
    return enterprise


@pytest_asyncio.fixture
async def test_user_with_enterprise(
    db_session: AsyncSession,
    test_user: User,
    test_enterprise: Enterprise,
) -> User:
    """Create test user with enterprise."""
    test_user.enterprise_id = test_enterprise.id
    test_user.role = UserRole.ADMINISTRATOR
    await db_session.flush()
    await db_session.refresh(test_user)
    return test_user


@pytest.fixture
def test_token(test_user_with_enterprise: User, test_enterprise: Enterprise) -> str:
    """Create test JWT token with all permissions."""
    return create_access_token(
        user_id=test_user_with_enterprise.id,
        role=test_user_with_enterprise.role.value,
        permissions=["*"],
        tenant_schema=test_enterprise.tenant_schema,
    )


@pytest.fixture
def auth_headers(test_token: str) -> dict:
    """Create authorization headers with test token."""
    return {"Authorization": f"Bearer {test_token}"}


@pytest.fixture
def financials_token(test_user_with_enterprise: User, test_enterprise: Enterprise) -> str:
    """Create test JWT token with financial permissions only."""
    return create_access_token(
        user_id=test_user_with_enterprise.id,
        role=test_user_with_enterprise.role.value,
        permissions=["financials.read", "financials.write"],
        tenant_schema=test_enterprise.tenant_schema,
    )


@pytest.fixture
def financials_headers(financials_token: str) -> dict:
    """Authorization headers with financial permissions."""
    return {"Authorization": f"Bearer {financials_token}"}


@pytest.fixture
def readonly_token(test_user_with_enterprise: User, test_enterprise: Enterprise) -> str:
    """Create test JWT token with read-only permissions."""
    return create_access_token(
        user_id=test_user_with_enterprise.id,
        role="operator",
        permissions=["batch.read", "config.read"],
        tenant_schema=test_enterprise.tenant_schema,
    )


@pytest.fixture
def readonly_headers(readonly_token: str) -> dict:
    """Authorization headers with read-only permissions."""
    return {"Authorization": f"Bearer {readonly_token}"}


# ── Tenant Seed Data Fixtures ────────────────────────────────────

@pytest_asyncio.fixture
async def seed_grower(tenant_db_session: AsyncSession):
    """Seed a test grower in the tenant schema."""
    await tenant_db_session.execute(text("""
        INSERT INTO growers (id, name, grower_code, is_active)
        VALUES ('grower-test-001', 'Test Grower', 'TG001', true)
        ON CONFLICT (id) DO NOTHING
    """))
    await tenant_db_session.flush()
    return "grower-test-001"


@pytest_asyncio.fixture
async def seed_packhouse(tenant_db_session: AsyncSession):
    """Seed a test packhouse in the tenant schema."""
    await tenant_db_session.execute(text("""
        INSERT INTO packhouses (id, name, is_active)
        VALUES ('packhouse-test-001', 'Test Packhouse', true)
        ON CONFLICT (id) DO NOTHING
    """))
    await tenant_db_session.flush()
    return "packhouse-test-001"


@pytest_asyncio.fixture
async def seed_harvest_team(tenant_db_session: AsyncSession):
    """Seed a test harvest team in the tenant schema."""
    await tenant_db_session.execute(text("""
        INSERT INTO harvest_teams (id, name, team_leader, is_active)
        VALUES ('team-test-001', 'Test Team', 'Team Leader', true)
        ON CONFLICT (id) DO NOTHING
    """))
    await tenant_db_session.flush()
    return "team-test-001"


# ── Redis Fixtures ───────────────────────────────────────────────

@pytest_asyncio.fixture
async def redis_client():
    """Create Redis client for tests."""
    import redis.asyncio as redis

    client = redis.from_url(settings.redis_url, decode_responses=True)

    yield client

    # Cleanup: flush test database
    await client.flushdb()
    await client.aclose()


# ── Test Markers ─────────────────────────────────────────────────

def pytest_configure(config):
    """Configure custom markers."""
    config.addinivalue_line("markers", "unit: Unit tests")
    config.addinivalue_line("markers", "integration: Integration tests")
    config.addinivalue_line("markers", "slow: Slow tests")
