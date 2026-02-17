"""Packaging stock & movement tracking.

PackagingStock tracks the current inventory level for each packaging type
(box sizes and pallet types).

PackagingMovement is an audit ledger recording every stock change:
receipts (stock in), consumption (allocated to lots/pallets), and
manual adjustments.
"""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import TenantBase


class PackagingStock(TenantBase):
    """Current inventory level per packaging type."""
    __tablename__ = "packaging_stock"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )

    # Link to either a box size or pallet type (one must be set)
    box_size_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("box_sizes.id"), unique=True
    )
    pallet_type_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("pallet_types.id"), unique=True
    )

    current_quantity: Mapped[int] = mapped_column(Integer, default=0)
    min_stock_level: Mapped[int] = mapped_column(Integer, default=0)

    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    # Relationships
    box_size = relationship("BoxSize", lazy="selectin")
    pallet_type = relationship("PalletType", lazy="selectin")
    movements = relationship(
        "PackagingMovement", back_populates="stock", lazy="selectin",
        order_by="PackagingMovement.recorded_at.desc()",
    )


class PackagingMovement(TenantBase):
    """Audit ledger for packaging stock changes."""
    __tablename__ = "packaging_movements"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )

    stock_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("packaging_stock.id"), nullable=False, index=True
    )

    # receipt | consumption | adjustment
    movement_type: Mapped[str] = mapped_column(String(30), nullable=False)

    # Positive for stock in, negative for stock out
    quantity: Mapped[int] = mapped_column(Integer, nullable=False)

    cost_per_unit: Mapped[float | None] = mapped_column(Float)

    # Optional reference to the lot or pallet that consumed this stock
    reference_type: Mapped[str | None] = mapped_column(String(30))  # lot | pallet
    reference_id: Mapped[str | None] = mapped_column(String(36))

    notes: Mapped[str | None] = mapped_column(Text)
    recorded_by: Mapped[str | None] = mapped_column(String(36))  # user_id
    recorded_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, index=True
    )

    # Relationships
    stock = relationship("PackagingStock", back_populates="movements")
