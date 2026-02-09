"""Export — an export shipment / booking.

Groups one or more Containers being shipped to a destination market.
Tracks the full export lifecycle from booking through to delivery,
including shipping line, vessel, port info, and PPECB/phyto documentation.

Lifecycle:  draft → booked → loaded → in_transit → arrived → completed
"""

import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean, DateTime, Date, Float, ForeignKey,
    Integer, JSON, String, Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import TenantBase


class Export(TenantBase):
    __tablename__ = "exports"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    booking_ref: Mapped[str] = mapped_column(
        String(100), unique=True, nullable=False, index=True
    )

    # ── Client / destination ─────────────────────────────────
    client_name: Mapped[str] = mapped_column(String(255), nullable=False)
    client_ref: Mapped[str | None] = mapped_column(String(100))
    target_market: Mapped[str | None] = mapped_column(String(100))
    destination_country: Mapped[str | None] = mapped_column(String(100))
    destination_port: Mapped[str | None] = mapped_column(String(100))

    # ── Shipping ─────────────────────────────────────────────
    shipping_line: Mapped[str | None] = mapped_column(String(255))
    vessel_name: Mapped[str | None] = mapped_column(String(255))
    voyage_number: Mapped[str | None] = mapped_column(String(100))
    port_of_loading: Mapped[str | None] = mapped_column(String(100))
    etd: Mapped[datetime | None] = mapped_column(Date)  # estimated departure
    eta: Mapped[datetime | None] = mapped_column(Date)  # estimated arrival
    actual_departure: Mapped[datetime | None] = mapped_column(Date)
    actual_arrival: Mapped[datetime | None] = mapped_column(Date)

    # ── Totals ───────────────────────────────────────────────
    container_count: Mapped[int] = mapped_column(Integer, default=0)
    total_pallets: Mapped[int] = mapped_column(Integer, default=0)
    total_cartons: Mapped[int] = mapped_column(Integer, default=0)
    total_weight_kg: Mapped[float | None] = mapped_column(Float)

    # ── Documentation ────────────────────────────────────────
    # PPECB inspection / phytosanitary certificate references
    ppecb_cert_number: Mapped[str | None] = mapped_column(String(100))
    phyto_cert_number: Mapped[str | None] = mapped_column(String(100))
    bill_of_lading: Mapped[str | None] = mapped_column(String(100))
    # JSON: additional document refs {"customs_dec": "...", "eur1": "...", ...}
    documents: Mapped[dict | None] = mapped_column(JSON)

    # ── Financial link ───────────────────────────────────────
    currency: Mapped[str | None] = mapped_column(String(3))
    total_value: Mapped[float | None] = mapped_column(Float)
    incoterm: Mapped[str | None] = mapped_column(String(10))  # FOB, CIF, CFR, etc.

    # ── Status ───────────────────────────────────────────────
    # draft | booked | loaded | in_transit | arrived | completed | cancelled
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
    containers = relationship("Container", back_populates="export", lazy="selectin")
    invoices = relationship("ClientInvoice", back_populates="export", lazy="selectin")
