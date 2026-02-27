"""Tenant-schema models (duplicated into every tenant_xxx schema).

These models use TenantBase, so their tables are created per-tenant
and never in the public schema.
"""

# ── Setup / config models ────────────────────────────────────
from app.models.tenant.wizard_state import WizardState
from app.models.tenant.company_profile import CompanyProfile
from app.models.tenant.packhouse import Packhouse
from app.models.tenant.pack_line import PackLine
from app.models.tenant.supplier import Supplier
from app.models.tenant.grower import Grower
from app.models.tenant.harvest_team import HarvestTeam
from app.models.tenant.product_config import ProductConfig, PackSpec, BoxSize, PalletType, BinType, PalletTypeBoxCapacity
from app.models.tenant.transport_config import TransportConfig
from app.models.tenant.financial_config import FinancialConfig

# ── Core operational models ──────────────────────────────────
from app.models.tenant.batch import Batch
from app.models.tenant.batch_history import BatchHistory
from app.models.tenant.lot import Lot
from app.models.tenant.pallet import Pallet, PalletLot
from app.models.tenant.container import Container
from app.models.tenant.export import Export
from app.models.tenant.shipping_schedule import ShippingSchedule

# ── Financial models ─────────────────────────────────────────
from app.models.tenant.grower_payment import GrowerPayment
from app.models.tenant.labour_cost import LabourCost
from app.models.tenant.client_invoice import ClientInvoice
from app.models.tenant.credit import Credit

# ── Reconciliation ───────────────────────────────────────────
from app.models.tenant.reconciliation_alert import ReconciliationAlert

# ── Packaging stock ─────────────────────────────────────────
from app.models.tenant.packaging_stock import PackagingStock, PackagingMovement

__all__ = [
    # Setup / config
    "WizardState", "CompanyProfile", "Packhouse", "PackLine",
    "Supplier", "Grower", "HarvestTeam",
    "ProductConfig", "PackSpec", "BoxSize", "PalletType", "BinType", "PalletTypeBoxCapacity",
    "TransportConfig", "FinancialConfig",
    # Core operational
    "Batch", "BatchHistory", "Lot", "Pallet", "PalletLot", "Container", "Export",
    "ShippingSchedule",
    # Financial
    "GrowerPayment", "LabourCost", "ClientInvoice", "Credit",
    # Reconciliation
    "ReconciliationAlert",
    # Packaging stock
    "PackagingStock", "PackagingMovement",
]
