"""CustomRole — reusable permission template.

Admins define named role templates (e.g. "QC Inspector", "Dispatch Clerk")
with specific permission sets, then assign them to users.
"""

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import TenantBase


class CustomRole(TenantBase):
    __tablename__ = "custom_roles"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False, unique=True)
    description: Mapped[str | None] = mapped_column(Text)
    # JSON list of permission strings, e.g. ["batch.read", "lot.read"]
    permissions: Mapped[list] = mapped_column(JSON, nullable=False, default=list)
    # System roles are seeded and cannot be deleted
    is_system: Mapped[bool] = mapped_column(Boolean, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )
