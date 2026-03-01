"""ShippingSchedule — a sailing/voyage schedule entry.

Represents an upcoming (or past) sailing that packhouse managers reference
when deciding which vessel to book containers onto.  Can be manually entered
or later pulled from the MSC API.

Statuses:  scheduled | departed | arrived | cancelled
Sources:   manual | msc_api
"""

import uuid
from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import TenantBase


class ShippingSchedule(TenantBase):
    __tablename__ = "shipping_schedules"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )

    # ── Shipping line FK ─────────────────────────────────────
    shipping_line_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("shipping_lines.id")
    )

    # ── Voyage identity ───────────────────────────────────────
    shipping_line: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    vessel_name: Mapped[str] = mapped_column(String(255), nullable=False)
    voyage_number: Mapped[str] = mapped_column(String(100), nullable=False)

    # ── Route ─────────────────────────────────────────────────
    port_of_loading: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    port_of_discharge: Mapped[str] = mapped_column(String(255), nullable=False, index=True)

    # ── Dates ─────────────────────────────────────────────────
    etd: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    eta: Mapped[date] = mapped_column(Date, nullable=False)
    booking_cutoff: Mapped[date | None] = mapped_column(Date)
    cargo_cutoff: Mapped[date | None] = mapped_column(Date)

    # ── Status & source ───────────────────────────────────────
    status: Mapped[str] = mapped_column(String(30), default="scheduled", index=True)
    source: Mapped[str] = mapped_column(String(20), default="manual")

    # ── Metadata ──────────────────────────────────────────────
    notes: Mapped[str | None] = mapped_column(Text)
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    # ── Relationships ─────────────────────────────────────────
    shipping_line_rel = relationship("ShippingLine", lazy="selectin")
    exports = relationship("Export", back_populates="shipping_schedule", lazy="selectin")
