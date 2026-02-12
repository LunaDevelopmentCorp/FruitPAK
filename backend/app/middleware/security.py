"""Security middleware for HTTPS enforcement and security headers.

Implements security best practices:
- HTTPS redirection
- HSTS headers
- CSP headers
- Security-related HTTP headers
"""

from typing import Callable

from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import RedirectResponse

from app.config import settings


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Add security headers to all responses."""

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        """Add security headers to response."""
        response = await call_next(request)

        # Strict-Transport-Security (HSTS)
        # Force HTTPS for 1 year, include subdomains
        if settings.environment == "production":
            response.headers["Strict-Transport-Security"] = (
                "max-age=31536000; includeSubDomains; preload"
            )

        # X-Content-Type-Options
        # Prevent MIME type sniffing
        response.headers["X-Content-Type-Options"] = "nosniff"

        # X-Frame-Options
        # Prevent clickjacking
        response.headers["X-Frame-Options"] = "DENY"

        # X-XSS-Protection
        # Enable XSS filter (legacy browsers)
        response.headers["X-XSS-Protection"] = "1; mode=block"

        # Referrer-Policy
        # Control referrer information
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"

        # Permissions-Policy (formerly Feature-Policy)
        # Restrict browser features
        response.headers["Permissions-Policy"] = (
            "geolocation=(), microphone=(), camera=(), payment=()"
        )

        # Content-Security-Policy
        # Prevent XSS, injection attacks
        if settings.environment == "production":
            csp = (
                "default-src 'self'; "
                "script-src 'self' 'unsafe-inline'; "
                "style-src 'self' 'unsafe-inline'; "
                "img-src 'self' data: https:; "
                "font-src 'self' data:; "
                "connect-src 'self'; "
                "frame-ancestors 'none'; "
                "base-uri 'self'; "
                "form-action 'self';"
            )
            response.headers["Content-Security-Policy"] = csp

        # Note: Uvicorn's server header is added after middleware,
        # so we can't remove it here. Consider using a reverse proxy
        # like Nginx to remove server identification headers.

        return response


class HTTPSRedirectMiddleware(BaseHTTPMiddleware):
    """Redirect HTTP requests to HTTPS (production only)."""

    def __init__(self, app, force_https: bool = False):
        super().__init__(app)
        self.force_https = force_https or settings.environment == "production"

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        """Redirect HTTP to HTTPS if needed."""
        if not self.force_https:
            # Skip in development
            return await call_next(request)

        # Check if request is HTTP
        if request.url.scheme == "http":
            # Build HTTPS URL
            https_url = request.url.replace(scheme="https")

            return RedirectResponse(
                url=str(https_url),
                status_code=301,  # Permanent redirect
            )

        return await call_next(request)


class SecureCookieMiddleware(BaseHTTPMiddleware):
    """Ensure cookies are secure in production."""

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        """Add secure attributes to cookies."""
        response = await call_next(request)

        if settings.environment == "production":
            # Update Set-Cookie headers to be secure
            set_cookie_headers = response.headers.getlist("set-cookie")
            if set_cookie_headers:
                # Clear existing set-cookie headers
                del response.headers["set-cookie"]

                # Re-add with secure attributes
                for cookie in set_cookie_headers:
                    # Add secure attributes if not present
                    if "Secure" not in cookie:
                        cookie += "; Secure"
                    if "HttpOnly" not in cookie:
                        cookie += "; HttpOnly"
                    if "SameSite" not in cookie:
                        cookie += "; SameSite=Strict"

                    response.headers.append("set-cookie", cookie)

        return response
