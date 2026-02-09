"""ClientInvoice — invoice issued to an export client.

Tracks invoicing for fruit exports.  Linked to an Export and optionally
to specific containers.  Supports line items stored as JSON for
flexibility across different billing structures.

Lifecycle:  draft → issued → partially_paid → paid | cancelled | credited
"""

import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean, DateTime, Date, Float, ForeignKey,
    JSON, String, Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import TenantBase


class ClientInvoice(TenantBase):
    __tablename__ = "client_invoices"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    invoice_number: Mapped[str] = mapped_column(
        String(50), unique=True, nullable=False, index=True
    )

    # ── Client ───────────────────────────────────────────────
    client_name: Mapped[str] = mapped_column(String(255), nullable=False)
    client_ref: Mapped[str | None] = mapped_column(String(100))

    # ── Export link ──────────────────────────────────────────
    export_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("exports.id")
    )

    # ── Amounts ──────────────────────────────────────────────
    currency: Mapped[str] = mapped_column(String(3), default="USD")
    # JSON line items:
    # [{"description": "Class 1 Valencia 4kg", "qty": 5000, "unit_price": 12.50, "amount": 62500}, ...]
    line_items: Mapped[list] = mapped_column(JSON, default=list)
    subtotal: Mapped[float] = mapped_column(Float, nullable=False)
    tax_rate_pct: Mapped[float] = mapped_column(Float, default=0.0)
    tax_amount: Mapped[float] = mapped_column(Float, default=0.0)
    total_amount: Mapped[float] = mapped_column(Float, nullable=False)
    amount_paid: Mapped[float] = mapped_column(Float, default=0.0)
    balance_due: Mapped[float] = mapped_column(Float, nullable=False)

    # ── Dates ────────────────────────────────────────────────
    issue_date: Mapped[datetime] = mapped_column(Date, default=datetime.utcnow)
    due_date: Mapped[datetime | None] = mapped_column(Date)
    paid_date: Mapped[datetime | None] = mapped_column(Date)

    # ── Payment ──────────────────────────────────────────────
    payment_terms: Mapped[str | None] = mapped_column(String(100))
    incoterm: Mapped[str | None] = mapped_column(String(10))  # FOB, CIF, CFR

    # ── Status ───────────────────────────────────────────────
    # draft | issued | partially_paid | paid | cancelled | credited
    status: Mapped[str] = mapped_column(String(30), default="draft", index=True)

    # ── Metadata ─────────────────────────────────────────────
    notes: Mapped[str | None] = mapped_column(Text)
    created_by: Mapped[str | None] = mapped_column(String(36))  # user_id
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    # ── Relationships ────────────────────────────────────────
    export = relationship("Export", back_populates="invoices", lazy="selectin")
    credits = relationship("Credit", back_populates="invoice", lazy="selectin")
