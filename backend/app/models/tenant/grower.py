"""Step 4: Growers — name, fields, size, volume estimates, certification.

Expanded from the original scaffold to include wizard onboarding fields.
"""

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import TenantBase


class Grower(TenantBase):
    __tablename__ = "growers"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    grower_code: Mapped[str | None] = mapped_column(String(50), unique=True)
    contact_person: Mapped[str | None] = mapped_column(String(255))
    phone: Mapped[str | None] = mapped_column(String(20))
    email: Mapped[str | None] = mapped_column(String(255))
    region: Mapped[str | None] = mapped_column(String(100))

    # Farm / field details
    # JSON array: [{"name": "Block A", "hectares": 12.5, "fruit_type": "citrus"}, ...]
    fields: Mapped[list | None] = mapped_column(JSON, default=list)
    total_hectares: Mapped[float | None] = mapped_column(Float)
    estimated_volume_tons: Mapped[float | None] = mapped_column(Float)

    # Certification
    globalg_ap_certified: Mapped[bool] = mapped_column(Boolean, default=False)
    globalg_ap_number: Mapped[str | None] = mapped_column(String(50))
    other_certifications: Mapped[list | None] = mapped_column(JSON, default=list)

    notes: Mapped[str | None] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
