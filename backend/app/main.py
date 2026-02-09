from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.middleware.tenant import TenantMiddleware
from app.routers import auth, enterprises, health, packhouses, reconciliation, wizard
from app.services.scheduler import lifespan

app = FastAPI(
    title="FruitPAK",
    description="Fruit Inventory Packhouse Management & Export System",
    version="0.1.0",
    lifespan=lifespan,
)

# ── Middleware (outermost first) ─────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins.split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(TenantMiddleware)

# ── Routers ──────────────────────────────────────────────────
# Public (no tenant context needed)
app.include_router(health.router)
app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(enterprises.router, prefix="/api/enterprises", tags=["enterprises"])

# Tenant-scoped (require tenant_schema in JWT)
app.include_router(packhouses.router, prefix="/api/packhouses", tags=["packhouses"])
app.include_router(wizard.router, prefix="/api/wizard", tags=["wizard"])
app.include_router(reconciliation.router, prefix="/api/reconciliation", tags=["reconciliation"])
