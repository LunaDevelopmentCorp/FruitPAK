"""Tenant-scoped configuration key-value store."""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, JSON, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import TenantBase


class TenantConfig(TenantBase):
    """Key-value configuration per tenant.

    Used for:
      - mixed_pallet_rules: {"allow_mixed_sizes": false, "allow_mixed_box_types": false}
      - number_formats: {"batch": "GRN-{date}-{seq:3}", ...}
    """
    __tablename__ = "tenant_config"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    key: Mapped[str] = mapped_column(String(100), unique=True, nullable=False)
    value: Mapped[dict] = mapped_column(JSON, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
