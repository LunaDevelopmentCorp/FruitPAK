"""ActivityLog — immutable audit trail for all key user actions.

Records who did what, when, and to which entity. Used by the admin
activity feed and overview dashboard.
"""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import TenantBase


class ActivityLog(TenantBase):
    __tablename__ = "activity_logs"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )

    # ── Who ────────────────────────────────────────────────────
    user_id: Mapped[str] = mapped_column(String(36), nullable=False, index=True)
    user_name: Mapped[str] = mapped_column(String(200), nullable=False)

    # ── What ───────────────────────────────────────────────────
    # created | updated | deleted | restored | purged |
    # status_changed | allocated | deallocated | sealed | exported |
    # user_created | user_updated | user_deactivated
    action: Mapped[str] = mapped_column(String(50), nullable=False, index=True)

    # ── Target ─────────────────────────────────────────────────
    # batch | lot | pallet | container | payment | user | ...
    entity_type: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    entity_id: Mapped[str | None] = mapped_column(String(36))
    entity_code: Mapped[str | None] = mapped_column(String(100))

    # ── Context ────────────────────────────────────────────────
    summary: Mapped[str | None] = mapped_column(Text)
    details: Mapped[dict | None] = mapped_column(JSON)

    # ── Timestamp ──────────────────────────────────────────────
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False, index=True
    )
