"""Lot — a graded and packed unit of fruit.

A Lot is created during the packing process when fruit from a Batch is
graded, sized, and packed into cartons of a specific grade/size/pack spec.
Multiple Lots can originate from a single Batch (one per grade-size combo).
Lots are then palletized into Pallets.

Lifecycle:  created → palletizing → stored → allocated → exported
"""

import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean, DateTime, Date, Float, ForeignKey,
    Integer, JSON, String, Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import TenantBase


class Lot(TenantBase):
    __tablename__ = "lots"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    lot_code: Mapped[str] = mapped_column(
        String(50), unique=True, nullable=False, index=True
    )

    # ── Traceability links ───────────────────────────────────
    batch_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("batches.id"), nullable=False, index=True
    )
    grower_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("growers.id"), nullable=False
    )
    packhouse_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("packhouses.id"), nullable=False
    )
    pack_line_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("pack_lines.id")
    )

    # ── Fruit identification ─────────────────────────────────
    fruit_type: Mapped[str] = mapped_column(String(100), nullable=False)
    variety: Mapped[str | None] = mapped_column(String(100))
    grade: Mapped[str | None] = mapped_column(String(50), index=True)
    size: Mapped[str | None] = mapped_column(String(50))
    product_config_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("product_configs.id")
    )

    # ── Pack spec ────────────────────────────────────────────
    pack_spec_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("pack_specs.id")
    )
    target_market: Mapped[str | None] = mapped_column(String(100))

    # ── Packaging ──────────────────────────────────────────────
    box_size_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("box_sizes.id")
    )

    # ── Quantities ───────────────────────────────────────────
    carton_count: Mapped[int] = mapped_column(Integer, default=0)
    weight_kg: Mapped[float | None] = mapped_column(Float)

    # ── Dates ────────────────────────────────────────────────
    pack_date: Mapped[datetime | None] = mapped_column(Date)
    intake_date: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    # ── Quality ──────────────────────────────────────────────
    # JSON: {"brix": 11.5, "pressure_kg": 5.2, "colour": "good", ...}
    quality_data: Mapped[dict | None] = mapped_column(JSON)

    # ── Waste ──────────────────────────────────────────────
    waste_kg: Mapped[float] = mapped_column(Float, default=0.0)
    waste_reason: Mapped[str | None] = mapped_column(Text)

    # ── Status ───────────────────────────────────────────────
    # created | palletizing | stored | allocated | exported
    status: Mapped[str] = mapped_column(String(30), default="created", index=True)

    # ── Metadata ─────────────────────────────────────────────
    notes: Mapped[str | None] = mapped_column(Text)
    packed_by: Mapped[str | None] = mapped_column(String(36))  # user_id
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, index=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    # ── Relationships ────────────────────────────────────────
    # All lazy="select" (default) — use explicit selectinload() in queries
    # that need them.  This avoids 7 hidden sub-queries every time a Lot
    # is touched (critical at 15 000 lots/day).
    batch = relationship("Batch", back_populates="lots")
    grower = relationship("Grower", backref="lots")
    packhouse = relationship("Packhouse", backref="lots")
    product_config = relationship("ProductConfig")
    pack_spec = relationship("PackSpec")
    box_size = relationship("BoxSize")
    pallet_lots = relationship("PalletLot", back_populates="lot")
