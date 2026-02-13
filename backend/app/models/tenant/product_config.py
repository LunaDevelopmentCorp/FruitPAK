"""Step 6: Product & packing configuration.

Defines how fruit is graded, sized, packed, and palletized.
Each enterprise defines their own grade/size matrices, pack specs,
and palletizing standards during onboarding.
"""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, Float, Integer, JSON, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import TenantBase


class ProductConfig(TenantBase):
    """Master product/fruit type config."""
    __tablename__ = "product_configs"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    fruit_type: Mapped[str] = mapped_column(String(100), nullable=False)
    variety: Mapped[str | None] = mapped_column(String(100))
    # Available grades: ["Class 1", "Class 2", "Export", "Local"]
    grades: Mapped[list] = mapped_column(JSON, default=list)
    # Available sizes: ["Small", "Medium", "Large", "XL"] or counts ["56", "64", "72"]
    sizes: Mapped[list] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class PackSpec(TenantBase):
    """Pack specification — defines a carton/container type."""
    __tablename__ = "pack_specs"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    # e.g. "4kg Open Top", "10kg Telescopic", "15kg Bulk"
    pack_type: Mapped[str | None] = mapped_column(String(100))
    weight_kg: Mapped[float | None] = mapped_column(Float)
    units_per_carton: Mapped[int | None] = mapped_column(Integer)
    # Palletizing: how many cartons fit per layer, how many layers
    cartons_per_layer: Mapped[int | None] = mapped_column(Integer)
    layers_per_pallet: Mapped[int | None] = mapped_column(Integer)
    # Target market / client specific
    target_market: Mapped[str | None] = mapped_column(String(100))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class BoxSize(TenantBase):
    """Enterprise-specific box/carton size definition."""
    __tablename__ = "box_sizes"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    # Size code (fruit count reference): 4, 5, 6, 7, 8, 9, 10, 12, 14
    size_code: Mapped[int | None] = mapped_column(Integer)
    fruit_count: Mapped[int | None] = mapped_column(Integer)
    weight_kg: Mapped[float] = mapped_column(Float, default=4.0)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class PalletType(TenantBase):
    """Enterprise-specific pallet structure definition."""
    __tablename__ = "pallet_types"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    capacity_boxes: Mapped[int] = mapped_column(Integer, default=240)
    notes: Mapped[str | None] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
