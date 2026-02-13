"""Pallet — a physical pallet of packed cartons.

Pallets are built from Lots in the palletizing area, then moved to
cold storage and eventually loaded into Containers for export.
Each pallet has a unique SSCC-style code for scanning.

A pallet can contain boxes from multiple Lots (via PalletLot join table).
Enterprise-defined pallet types set the capacity.

Lifecycle:  open → closed → stored → allocated → loaded → exported
"""

import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean, DateTime, Float, ForeignKey,
    Integer, JSON, String, Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import TenantBase


class Pallet(TenantBase):
    __tablename__ = "pallets"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    pallet_number: Mapped[str] = mapped_column(
        String(50), unique=True, nullable=False, index=True
    )

    # ── Pallet type (from enterprise config) ──────────────────
    pallet_type_name: Mapped[str | None] = mapped_column(String(100))
    capacity_boxes: Mapped[int] = mapped_column(Integer, default=240)
    current_boxes: Mapped[int] = mapped_column(Integer, default=0)

    # ── Traceability links ───────────────────────────────────
    packhouse_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("packhouses.id"), nullable=False
    )

    # ── Fruit identification (from primary lot, for fast queries) ──
    fruit_type: Mapped[str | None] = mapped_column(String(100))
    variety: Mapped[str | None] = mapped_column(String(100))
    grade: Mapped[str | None] = mapped_column(String(50), index=True)
    size: Mapped[str | None] = mapped_column(String(50))
    target_market: Mapped[str | None] = mapped_column(String(100))

    # ── Weight ────────────────────────────────────────────────
    net_weight_kg: Mapped[float | None] = mapped_column(Float)
    gross_weight_kg: Mapped[float | None] = mapped_column(Float)

    # ── Cold storage ─────────────────────────────────────────
    cold_store_room: Mapped[str | None] = mapped_column(String(50))
    cold_store_position: Mapped[str | None] = mapped_column(String(100))
    stored_at: Mapped[datetime | None] = mapped_column(DateTime)

    # ── Container / export ───────────────────────────────────
    container_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("containers.id"), index=True
    )
    loaded_at: Mapped[datetime | None] = mapped_column(DateTime)
    position_in_container: Mapped[str | None] = mapped_column(String(50))

    # ── Quality ──────────────────────────────────────────────
    quality_data: Mapped[dict | None] = mapped_column(JSON)

    # ── Status ───────────────────────────────────────────────
    # open | closed | stored | allocated | loaded | exported
    status: Mapped[str] = mapped_column(String(30), default="open", index=True)

    # ── QR ────────────────────────────────────────────────────
    qr_code_url: Mapped[str | None] = mapped_column(String(500))

    # ── Metadata ─────────────────────────────────────────────
    notes: Mapped[str | None] = mapped_column(Text)
    palletized_by: Mapped[str | None] = mapped_column(String(36))
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    # ── Relationships ────────────────────────────────────────
    packhouse = relationship("Packhouse", lazy="selectin")
    container = relationship("Container", back_populates="pallets", lazy="selectin")
    pallet_lots = relationship("PalletLot", back_populates="pallet", lazy="selectin")


class PalletLot(TenantBase):
    """Join table linking pallets to lots with box counts."""
    __tablename__ = "pallet_lots"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    pallet_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("pallets.id"), nullable=False, index=True
    )
    lot_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("lots.id"), nullable=False, index=True
    )
    box_count: Mapped[int] = mapped_column(Integer, default=0)
    size: Mapped[str | None] = mapped_column(String(50))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    # ── Relationships ────────────────────────────────────────
    pallet = relationship("Pallet", back_populates="pallet_lots")
    lot = relationship("Lot", back_populates="pallet_lots")
