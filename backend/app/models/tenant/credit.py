"""Credit — credit notes and financial adjustments.

Covers credit notes against client invoices (quality claims, short
delivery, price adjustments) and grower credits (rejects, advance
repayments).  A credit reduces the balance on an invoice or payment.

Types:  client_credit | grower_credit | adjustment
"""

import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean, DateTime, Date, Float, ForeignKey,
    JSON, String, Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import TenantBase


class Credit(TenantBase):
    __tablename__ = "credits"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    credit_number: Mapped[str] = mapped_column(
        String(50), unique=True, nullable=False, index=True
    )

    # ── Type ─────────────────────────────────────────────────
    # client_credit | grower_credit | adjustment
    credit_type: Mapped[str] = mapped_column(String(30), nullable=False, index=True)

    # ── Reason ───────────────────────────────────────────────
    # quality_claim | short_delivery | price_adjustment | reject_return | other
    reason: Mapped[str] = mapped_column(String(50), nullable=False)
    reason_detail: Mapped[str | None] = mapped_column(Text)

    # ── Links (one or more depending on credit_type) ─────────
    invoice_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("client_invoices.id")
    )
    grower_payment_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("grower_payments.id")
    )
    export_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("exports.id")
    )

    # ── Amounts ──────────────────────────────────────────────
    currency: Mapped[str] = mapped_column(String(3), nullable=False)
    # JSON line items (mirrors invoice structure):
    # [{"description": "Quality claim - Class 1 Valencia", "qty": 200, "unit_price": 12.50, "amount": 2500}]
    line_items: Mapped[list | None] = mapped_column(JSON)
    total_amount: Mapped[float] = mapped_column(Float, nullable=False)

    # ── Dates ────────────────────────────────────────────────
    issue_date: Mapped[datetime] = mapped_column(Date, default=datetime.utcnow)
    applied_date: Mapped[datetime | None] = mapped_column(Date)

    # ── Status ───────────────────────────────────────────────
    # draft | issued | applied | cancelled
    status: Mapped[str] = mapped_column(String(30), default="draft", index=True)
    approved_by: Mapped[str | None] = mapped_column(String(36))  # user_id
    approved_at: Mapped[datetime | None] = mapped_column(DateTime)

    # ── Metadata ─────────────────────────────────────────────
    notes: Mapped[str | None] = mapped_column(Text)
    created_by: Mapped[str | None] = mapped_column(String(36))
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    # ── Relationships ────────────────────────────────────────
    invoice = relationship("ClientInvoice", back_populates="credits", lazy="selectin")
    grower_payment = relationship("GrowerPayment", backref="credits", lazy="selectin")
