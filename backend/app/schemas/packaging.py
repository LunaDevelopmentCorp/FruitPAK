"""Pydantic schemas for packaging stock management."""

from datetime import datetime

from pydantic import BaseModel, Field


# ── Stock overview ──────────────────────────────────────────

class PackagingStockOut(BaseModel):
    id: str
    box_size_id: str | None = None
    pallet_type_id: str | None = None
    current_quantity: int
    min_stock_level: int

    # Resolved names from relationships
    name: str | None = None
    weight_kg: float | None = None
    cost_per_unit: float | None = None
    packaging_type: str | None = None  # "box" or "pallet"

    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ── Receipt (stock in) ─────────────────────────────────────

class PackagingReceiptRequest(BaseModel):
    """Import / receive packaging stock."""
    box_size_id: str | None = None
    pallet_type_id: str | None = None
    quantity: int = Field(..., ge=1)
    cost_per_unit: float | None = None
    notes: str | None = None


# ── Adjustment ──────────────────────────────────────────────

class PackagingAdjustmentRequest(BaseModel):
    """Manual stock correction (positive or negative)."""
    stock_id: str
    quantity: int  # positive to add, negative to subtract
    notes: str | None = None


# ── Min stock level ─────────────────────────────────────────

class UpdateMinStockRequest(BaseModel):
    min_stock_level: int = Field(..., ge=0)


# ── Movement history ────────────────────────────────────────

class PackagingMovementOut(BaseModel):
    id: str
    stock_id: str
    movement_type: str
    quantity: int
    cost_per_unit: float | None = None
    reference_type: str | None = None
    reference_id: str | None = None
    notes: str | None = None
    recorded_by: str | None = None
    recorded_at: datetime

    model_config = {"from_attributes": True}
