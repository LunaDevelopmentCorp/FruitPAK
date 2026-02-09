"""GrowerPayment — tracks payments owed to and made to growers.

Each payment record ties back to one or more Batches, capturing the
agreed rate, deductions, and settlement status.  Supports partial
payments and multiple payment runs against a single batch.

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


class GrowerPayment(TenantBase):
    __tablename__ = "grower_payments"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    payment_ref: Mapped[str] = mapped_column(
        String(50), unique=True, nullable=False, index=True
    )

    # ── Links ────────────────────────────────────────────────
    grower_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("growers.id"), nullable=False
    )
    # JSON array of batch IDs this payment covers
    batch_ids: Mapped[list] = mapped_column(JSON, default=list)

    # ── Amounts ──────────────────────────────────────────────
    currency: Mapped[str] = mapped_column(String(3), default="ZAR")
    gross_amount: Mapped[float] = mapped_column(Float, nullable=False)
    # JSON breakdown: {"packing_fee": 1200, "transport": 500, "cold_storage": 300}
    deductions: Mapped[dict | None] = mapped_column(JSON)
    total_deductions: Mapped[float] = mapped_column(Float, default=0.0)
    net_amount: Mapped[float] = mapped_column(Float, nullable=False)

    # ── Rate basis ───────────────────────────────────────────
    rate_per_kg: Mapped[float | None] = mapped_column(Float)
    total_kg: Mapped[float | None] = mapped_column(Float)

    # ── Dates ────────────────────────────────────────────────
    period_start: Mapped[datetime | None] = mapped_column(Date)
    period_end: Mapped[datetime | None] = mapped_column(Date)
    due_date: Mapped[datetime | None] = mapped_column(Date)
    paid_date: Mapped[datetime | None] = mapped_column(Date)

    # ── Status ───────────────────────────────────────────────
    # pending | approved | paid | cancelled
    status: Mapped[str] = mapped_column(String(30), default="pending", index=True)
    approved_by: Mapped[str | None] = mapped_column(String(36))  # user_id
    approved_at: Mapped[datetime | None] = mapped_column(DateTime)

    # ── Metadata ─────────────────────────────────────────────
    notes: Mapped[str | None] = mapped_column(Text)
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    # ── Relationships ────────────────────────────────────────
    grower = relationship("Grower", backref="payments", lazy="selectin")
