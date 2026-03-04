from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.logging_config import setup_logging
from app.middleware.tenant import TenantMiddleware
from app.middleware.rate_limit import RateLimitMiddleware
from app.middleware.request_id import RequestIdMiddleware
from app.middleware.security import (
    SecurityHeadersMiddleware,
    HTTPSRedirectMiddleware,
    SecureCookieMiddleware,
)
from app.middleware.exceptions import register_exception_handlers
from app.routers import admin, auth, batches, bulk_import, clients, config, containers, custom_roles, enterprises, growers, harvest_teams, health, lots, packaging, packhouses, pallets, payments, platform, reconciliation, shipping_agents, shipping_lines, shipping_schedules, transporters, wizard
from app.services.scheduler import lifespan

# Configure logging before anything else
setup_logging(debug=settings.debug)

# Sentry error tracking (opt-in — set SENTRY_DSN env var to enable)
if settings.sentry_dsn:
    try:
        import sentry_sdk
        sentry_sdk.init(
            dsn=settings.sentry_dsn,
            environment=settings.environment,
            traces_sample_rate=0.1,
        )
    except ImportError:
        import logging as _log
        _log.getLogger(__name__).warning(
            "SENTRY_DSN is set but sentry-sdk is not installed. "
            "Install with: pip install sentry-sdk[fastapi]"
        )

app = FastAPI(
    title="FruitPAK",
    description="Fruit Inventory Packhouse Management & Export System",
    version="0.1.0",
    lifespan=lifespan,
    docs_url="/docs" if settings.debug else None,
    redoc_url="/redoc" if settings.debug else None,
    openapi_url="/openapi.json" if settings.debug else None,
)

# ── Exception Handlers ───────────────────────────────────────
register_exception_handlers(app)

# ── Middleware (outermost first) ─────────────────────────────
# Request ID tracing (outermost — sets ID before anything else runs)
app.add_middleware(RequestIdMiddleware)

# Security headers
app.add_middleware(SecurityHeadersMiddleware)

# HTTPS redirect (production only)
app.add_middleware(HTTPSRedirectMiddleware, force_https=False)

# Secure cookies (production only)
app.add_middleware(SecureCookieMiddleware)

# Rate limiting
app.add_middleware(
    RateLimitMiddleware,
    default_limit=100,  # 100 requests per minute (anonymous/IP)
    authenticated_limit=500,  # 500 requests per minute (JWT user)
    default_window=60,
    exempt_paths=["/health", "/health/ready", "/docs", "/openapi.json"],
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins.split(","),
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Packhouse-Id", "Accept-Language"],
)

# Tenant context (innermost - processes request data)
app.add_middleware(TenantMiddleware)

# ── Routers ──────────────────────────────────────────────────
# Public (no tenant context needed)
app.include_router(health.router)
app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(enterprises.router, prefix="/api/enterprises", tags=["enterprises"])

# Tenant-scoped (require tenant_schema in JWT)
app.include_router(packhouses.router, prefix="/api/packhouses", tags=["packhouses"])
app.include_router(growers.router, prefix="/api/growers", tags=["growers"])
app.include_router(harvest_teams.router, prefix="/api/harvest-teams", tags=["harvest-teams"])
app.include_router(wizard.router, prefix="/api/wizard", tags=["wizard"])
app.include_router(batches.router, prefix="/api/batches", tags=["batches"])
app.include_router(lots.router, prefix="/api/lots", tags=["lots"])
app.include_router(pallets.router, prefix="/api/pallets", tags=["pallets"])
app.include_router(packaging.router, prefix="/api/packaging", tags=["packaging"])
app.include_router(clients.router, prefix="/api/clients", tags=["clients"])
app.include_router(containers.router, prefix="/api/containers", tags=["containers"])
app.include_router(shipping_lines.router, prefix="/api/shipping-lines", tags=["shipping-lines"])
app.include_router(transporters.router, prefix="/api/transporters", tags=["transporters"])
app.include_router(shipping_agents.router, prefix="/api/shipping-agents", tags=["shipping-agents"])
app.include_router(shipping_schedules.router, prefix="/api/shipping-schedules", tags=["shipping-schedules"])
app.include_router(payments.router, prefix="/api/payments", tags=["payments"])
app.include_router(reconciliation.router, prefix="/api/reconciliation", tags=["reconciliation"])
app.include_router(config.router, prefix="/api/config", tags=["config"])
app.include_router(bulk_import.router, prefix="/api/bulk-import", tags=["bulk-import"])
app.include_router(custom_roles.router, prefix="/api/roles", tags=["roles"])
app.include_router(admin.router, prefix="/api/admin", tags=["admin"])
app.include_router(platform.router, prefix="/api/platform", tags=["platform"])
