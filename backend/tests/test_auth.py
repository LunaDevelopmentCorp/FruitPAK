"""Tests for authentication endpoints."""

import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.public.user import User


@pytest.mark.auth
@pytest.mark.asyncio
class TestAuthEndpoints:
    """Test authentication endpoints."""

    async def test_register_user(self, client: AsyncClient):
        """Test user registration."""
        response = await client.post(
            "/api/auth/register",
            json={
                "email": "newuser@example.com",
                "password": "SecurePassword123!",
                "full_name": "New User",
                "company_name": "New Company",
            },
        )

        assert response.status_code == 201
        data = response.json()
        assert "access_token" in data
        assert data["user"]["email"] == "newuser@example.com"

    async def test_register_duplicate_email(
        self, client: AsyncClient, test_user: User
    ):
        """Test registration with duplicate email."""
        response = await client.post(
            "/api/auth/register",
            json={
                "email": test_user.email,
                "password": "AnotherPassword123!",
                "full_name": "Another User",
                "company_name": "Another Company",
            },
        )

        assert response.status_code == 400
        assert "already registered" in response.json()["detail"].lower()

    async def test_login_success(self, client: AsyncClient, test_user: User):
        """Test successful login."""
        response = await client.post(
            "/api/auth/login",
            json={
                "email": test_user.email,
                "password": "testpassword123",
            },
        )

        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert "refresh_token" in data
        assert data["user"]["email"] == test_user.email

    async def test_login_wrong_password(self, client: AsyncClient, test_user: User):
        """Test login with wrong password."""
        response = await client.post(
            "/api/auth/login",
            json={
                "email": test_user.email,
                "password": "wrongpassword",
            },
        )

        assert response.status_code == 401

    async def test_get_current_user(self, client: AsyncClient, auth_headers: dict):
        """Test getting current user profile."""
        response = await client.get("/api/auth/me", headers=auth_headers)

        assert response.status_code == 200
        data = response.json()
        assert "email" in data
        assert "role" in data

    async def test_logout(self, client: AsyncClient, auth_headers: dict):
        """Test logout endpoint."""
        response = await client.post("/api/auth/logout", headers=auth_headers)

        assert response.status_code == 204

        # Verify token is revoked
        response = await client.get("/api/auth/me", headers=auth_headers)
        assert response.status_code == 401


@pytest.mark.unit
class TestPasswordHashing:
    """Test password hashing utilities."""

    def test_hash_password(self):
        """Test password hashing."""
        from app.auth.password import hash_password, verify_password

        password = "MySecurePassword123!"
        hashed = hash_password(password)

        assert hashed != password
        assert verify_password(password, hashed)
        assert not verify_password("WrongPassword", hashed)


@pytest.mark.unit
class TestJWTTokens:
    """Test JWT token generation and validation."""

    def test_create_access_token(self):
        """Test creating access token."""
        from app.auth.jwt import create_access_token, decode_token

        token = create_access_token(
            user_id="user123",
            role="administrator",
            permissions=["read", "write"],
            tenant_schema="tenant_abc",
        )

        assert token is not None
        assert isinstance(token, str)

        # Decode and verify
        payload = decode_token(token)
        assert payload["sub"] == "user123"
        assert payload["role"] == "administrator"
        assert payload["tenant_schema"] == "tenant_abc"
        assert "read" in payload["permissions"]

    def test_decode_invalid_token(self):
        """Test decoding invalid token."""
        from app.auth.jwt import decode_token
        from fastapi import HTTPException

        with pytest.raises(HTTPException) as exc_info:
            decode_token("invalid.token.here")

        assert exc_info.value.status_code == 401
