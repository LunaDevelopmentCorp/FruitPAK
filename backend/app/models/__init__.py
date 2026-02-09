"""Aggregate model imports for Alembic auto-detection."""

# Public schema
from app.models.public.enterprise import Enterprise  # noqa: F401
from app.models.public.user import User, UserRole  # noqa: F401

# Tenant schema — setup / config
from app.models.tenant.packhouse import Packhouse  # noqa: F401
from app.models.tenant.grower import Grower  # noqa: F401
from app.models.tenant.wizard_state import WizardState  # noqa: F401
from app.models.tenant.company_profile import CompanyProfile  # noqa: F401
from app.models.tenant.pack_line import PackLine  # noqa: F401
from app.models.tenant.supplier import Supplier  # noqa: F401
from app.models.tenant.harvest_team import HarvestTeam  # noqa: F401
from app.models.tenant.product_config import ProductConfig, PackSpec  # noqa: F401
from app.models.tenant.transport_config import TransportConfig  # noqa: F401
from app.models.tenant.financial_config import FinancialConfig  # noqa: F401

# Tenant schema — core operational
from app.models.tenant.batch import Batch  # noqa: F401
from app.models.tenant.batch_history import BatchHistory  # noqa: F401
from app.models.tenant.lot import Lot  # noqa: F401
from app.models.tenant.pallet import Pallet  # noqa: F401
from app.models.tenant.container import Container  # noqa: F401
from app.models.tenant.export import Export  # noqa: F401

# Tenant schema — financial
from app.models.tenant.grower_payment import GrowerPayment  # noqa: F401
from app.models.tenant.labour_cost import LabourCost  # noqa: F401
from app.models.tenant.client_invoice import ClientInvoice  # noqa: F401
from app.models.tenant.credit import Credit  # noqa: F401

# Tenant schema — reconciliation
from app.models.tenant.reconciliation_alert import ReconciliationAlert  # noqa: F401
