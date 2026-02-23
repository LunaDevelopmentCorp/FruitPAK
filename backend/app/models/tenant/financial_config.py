"""Step 8: Financial basics (optional).

Stores base rates and financial configuration.
Only visible to users with financials.read permission.
"""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, Float, Integer, JSON, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import TenantBase


class FinancialConfig(TenantBase):
    __tablename__ = "financial_config"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    base_currency: Mapped[str] = mapped_column(String(3), default="ZAR")
    export_currencies: Mapped[list | None] = mapped_column(JSON, default=None)
    # Rates
    packing_rate_per_kg: Mapped[float | None] = mapped_column(Float)
    cold_storage_rate_per_pallet_day: Mapped[float | None] = mapped_column(Float)
    transport_rate_per_pallet: Mapped[float | None] = mapped_column(Float)
    labour_rate_per_hour: Mapped[float | None] = mapped_column(Float)
    # Payment terms
    grower_payment_terms_days: Mapped[int | None] = mapped_column(Integer)
    client_payment_terms_days: Mapped[int | None] = mapped_column(Integer)
    # Additional rate structures (JSON for flexibility)
    additional_rates: Mapped[dict | None] = mapped_column(JSON, default=None)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )
