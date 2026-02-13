from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.middleware.tenant import TenantMiddleware
from app.middleware.rate_limit import RateLimitMiddleware
from app.middleware.security import (
    SecurityHeadersMiddleware,
    HTTPSRedirectMiddleware,
    SecureCookieMiddleware,
)
from app.middleware.exceptions import register_exception_handlers
from app.routers import auth, batches, containers, enterprises, growers, health, lots, packhouses, pallets, payments, reconciliation, wizard
from app.services.scheduler import lifespan

app = FastAPI(
    title="FruitPAK",
    description="Fruit Inventory Packhouse Management & Export System",
    version="0.1.0",
    lifespan=lifespan,
)

# ── Exception Handlers ───────────────────────────────────────
register_exception_handlers(app)

# ── Middleware (outermost first) ─────────────────────────────
# Security headers (first - applies to all responses)
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
    allow_methods=["*"],
    allow_headers=["*"],
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
app.include_router(wizard.router, prefix="/api/wizard", tags=["wizard"])
app.include_router(batches.router, prefix="/api/batches", tags=["batches"])
app.include_router(lots.router, prefix="/api/lots", tags=["lots"])
app.include_router(pallets.router, prefix="/api/pallets", tags=["pallets"])
app.include_router(containers.router, prefix="/api/containers", tags=["containers"])
app.include_router(payments.router, prefix="/api/payments", tags=["payments"])
app.include_router(reconciliation.router, prefix="/api/reconciliation", tags=["reconciliation"])
