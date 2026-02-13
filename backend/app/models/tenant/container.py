"""Container — a physical shipping container loaded with pallets.

Represents a reefer or open container that is stuffed with pallets in the
packhouse cold store / loading dock, then dispatched for export.

Lifecycle:  open → loading → sealed → dispatched → delivered
"""

import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean, DateTime, Float, ForeignKey, Integer, JSON, String, Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import TenantBase


class Container(TenantBase):
    __tablename__ = "containers"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    container_number: Mapped[str] = mapped_column(
        String(50), unique=True, nullable=False, index=True
    )

    # ── Type & config ────────────────────────────────────────
    transport_config_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("transport_configs.id")
    )
    # "reefer_20ft", "reefer_40ft", "open_truck", "break_bulk"
    container_type: Mapped[str] = mapped_column(String(50), nullable=False)
    capacity_pallets: Mapped[int] = mapped_column(Integer, default=20)

    # ── Customer / destination ────────────────────────────────
    customer_name: Mapped[str | None] = mapped_column(String(255))
    destination: Mapped[str | None] = mapped_column(String(255))
    export_date: Mapped[datetime | None] = mapped_column(DateTime)

    # ── Loading details ──────────────────────────────────────
    packhouse_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("packhouses.id")
    )
    pallet_count: Mapped[int] = mapped_column(Integer, default=0)
    total_cartons: Mapped[int] = mapped_column(Integer, default=0)
    gross_weight_kg: Mapped[float | None] = mapped_column(Float)

    # ── Seal & verification ──────────────────────────────────
    seal_number: Mapped[str | None] = mapped_column(String(100))
    sealed_at: Mapped[datetime | None] = mapped_column(DateTime)
    sealed_by: Mapped[str | None] = mapped_column(String(36))  # user_id

    # ── Temperature ──────────────────────────────────────────
    temp_setpoint_c: Mapped[float | None] = mapped_column(Float)
    # JSON array of readings: [{"temp_c": 2.1, "recorded_at": "...", "location": "front"}, ...]
    temp_readings: Mapped[list | None] = mapped_column(JSON)

    # ── Export link ──────────────────────────────────────────
    export_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("exports.id")
    )

    # ── Status ───────────────────────────────────────────────
    # open | loading | sealed | dispatched | delivered
    status: Mapped[str] = mapped_column(String(30), default="open", index=True)
    dispatched_at: Mapped[datetime | None] = mapped_column(DateTime)

    # ── Metadata ─────────────────────────────────────────────
    qr_code_url: Mapped[str | None] = mapped_column(String(500))
    notes: Mapped[str | None] = mapped_column(Text)
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    # ── Relationships ────────────────────────────────────────
    transport_config = relationship("TransportConfig", lazy="selectin")
    packhouse = relationship("Packhouse", lazy="selectin")
    export = relationship("Export", back_populates="containers", lazy="selectin")
    pallets = relationship("Pallet", back_populates="container", lazy="selectin")
