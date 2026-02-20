"""HarvestTeamPayment — tracks advances and payments to harvest teams.

Each payment record ties back to one or more Batches, capturing the
amount paid, batch linkage, and settlement status.

Lifecycle:  pending → approved → paid | cancelled
"""

import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean, DateTime, Date, Float, ForeignKey,
    JSON, String, Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import TenantBase


class HarvestTeamPayment(TenantBase):
    __tablename__ = "harvest_team_payments"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    payment_ref: Mapped[str] = mapped_column(
        String(50), unique=True, nullable=False, index=True
    )

    # ── Links ────────────────────────────────────────────────
    harvest_team_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("harvest_teams.id"), nullable=False, index=True
    )
    # JSON array of batch IDs this payment covers
    batch_ids: Mapped[list] = mapped_column(JSON, default=list)

    # ── Amounts ──────────────────────────────────────────────
    currency: Mapped[str] = mapped_column(String(3), default="ZAR")
    amount: Mapped[float] = mapped_column(Float, nullable=False)

    # ── Rate basis ───────────────────────────────────────────
    total_kg: Mapped[float | None] = mapped_column(Float)
    total_bins: Mapped[int | None] = mapped_column(None)

    # ── Dates ────────────────────────────────────────────────
    payment_date: Mapped[datetime | None] = mapped_column(Date, index=True)

    # ── Type & Status ─────────────────────────────────────────
    # advance | final
    payment_type: Mapped[str] = mapped_column(String(20), default="advance")
    # pending | paid | cancelled
    status: Mapped[str] = mapped_column(String(30), default="paid", index=True)

    # ── Metadata ─────────────────────────────────────────────
    notes: Mapped[str | None] = mapped_column(Text)
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    # ── Relationships ────────────────────────────────────────
    harvest_team = relationship("HarvestTeam", backref="payments", lazy="selectin")
