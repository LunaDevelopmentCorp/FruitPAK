"""Pytest configuration and fixtures for FruitPAK tests.

Provides reusable test fixtures for database, authentication, Redis, etc.
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
from app.database import get_db
from app.auth.jwt import create_access_token
from app.auth.password import hash_password
from app.models.public.user import User, UserRole
from app.models.public.enterprise import Enterprise


# ── Test Database Setup ──────────────────────────────────────────

@pytest.fixture(scope="session")
def event_loop() -> Generator:
    """Create event loop for async tests."""
    loop = asyncio.get_event_loop_policy().new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture(scope="session")
async def test_engine():
    """Create test database engine."""
    # Use test database
    test_db_url = settings.database_url.replace(
        settings.postgres_db,
        f"{settings.postgres_db}_test"
    )

    engine = create_async_engine(test_db_url, echo=False)

    # Create database if not exists
    async with engine.begin() as conn:
        await conn.execute(text("SELECT 1"))

    yield engine

    await engine.dispose()


@pytest_asyncio.fixture
async def db_session(test_engine) -> AsyncGenerator[AsyncSession, None]:
    """Create database session for tests."""
    async_session = sessionmaker(
        test_engine, class_=AsyncSession, expire_on_commit=False
    )

    async with async_session() as session:
        # Start transaction
        await session.begin()

        yield session

        # Rollback transaction (no changes persist)
        await session.rollback()


@pytest_asyncio.fixture
async def client(db_session) -> AsyncGenerator[AsyncClient, None]:
    """Create test client with overridden database dependency."""

    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db

    async with AsyncClient(app=app, base_url="http://test") as client:
        yield client

    app.dependency_overrides.clear()


# ── Test Data Fixtures ───────────────────────────────────────────

@pytest_asyncio.fixture
async def test_user(db_session: AsyncSession) -> User:
    """Create test user."""
    user = User(
        email="test@example.com",
        full_name="Test User",
        password_hash=hash_password("testpassword123"),
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
        tenant_schema="tenant_test123",
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
    """Create test JWT token."""
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
