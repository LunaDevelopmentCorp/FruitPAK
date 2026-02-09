"""Step 1: Company & Exporter basics.

One row per enterprise — stores the core business identity,
export registration, and contact info entered during onboarding.
"""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import TenantBase


class CompanyProfile(TenantBase):
    __tablename__ = "company_profile"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    # Business identity
    trading_name: Mapped[str] = mapped_column(String(255), nullable=False)
    legal_name: Mapped[str | None] = mapped_column(String(255))
    registration_number: Mapped[str | None] = mapped_column(String(100))
    vat_number: Mapped[str | None] = mapped_column(String(50))

    # Exporter details
    exporter_code: Mapped[str | None] = mapped_column(String(50))
    fbo_code: Mapped[str | None] = mapped_column(String(50))  # Food Business Operator
    ppecb_code: Mapped[str | None] = mapped_column(String(50))  # Perishable Products Export

    # Address
    address_line_1: Mapped[str | None] = mapped_column(String(255))
    address_line_2: Mapped[str | None] = mapped_column(String(255))
    city: Mapped[str | None] = mapped_column(String(100))
    province: Mapped[str | None] = mapped_column(String(100))
    postal_code: Mapped[str | None] = mapped_column(String(20))
    country: Mapped[str | None] = mapped_column(String(100))

    # Contact
    contact_name: Mapped[str | None] = mapped_column(String(255))
    contact_email: Mapped[str | None] = mapped_column(String(255))
    contact_phone: Mapped[str | None] = mapped_column(String(20))

    notes: Mapped[str | None] = mapped_column(Text)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )
