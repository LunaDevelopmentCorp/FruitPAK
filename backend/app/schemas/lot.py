"""Pydantic schemas for Lot CRUD operations."""

from datetime import date, datetime

from pydantic import BaseModel, Field


# ── Create lots from a batch (high-level) ────────────────────

class LotFromBatchItem(BaseModel):
    """A single lot to create from a batch (one grade/size combo)."""
    grade: str = Field(..., max_length=50)
    size: str | None = Field(None, max_length=50)
    box_size_id: str | None = None
    weight_kg: float | None = Field(None, ge=0)
    carton_count: int = Field(0, ge=0)
    pack_date: date | None = None
    waste_kg: float | None = Field(None, ge=0)
    waste_reason: str | None = None
    notes: str | None = None


class LotsFromBatchRequest(BaseModel):
    """Payload for POST /api/lots/from-batch/{batch_id}."""
    lots: list[LotFromBatchItem] = Field(..., min_length=1)


# ── Create (low-level) ──────────────────────────────────────

class LotCreate(BaseModel):
    lot_code: str = Field(..., max_length=50)
    batch_id: str
    grower_id: str
    packhouse_id: str
    fruit_type: str

    # Optional fields
    pack_line_id: str | None = None
    variety: str | None = None
    grade: str | None = None
    size: str | None = None
    product_config_id: str | None = None
    pack_spec_id: str | None = None
    box_size_id: str | None = None
    target_market: str | None = None
    carton_count: int = 0
    weight_kg: float | None = None
    pack_date: date | None = None
    quality_data: dict | None = None
    notes: str | None = None


# ── Update (partial) ─────────────────────────────────────────

class LotUpdate(BaseModel):
    grade: str | None = None
    size: str | None = None
    product_config_id: str | None = None
    pack_spec_id: str | None = None
    box_size_id: str | None = None
    target_market: str | None = None
    carton_count: int | None = None
    weight_kg: float | None = None
    pack_date: date | None = None
    quality_data: dict | None = None
    status: str | None = None
    waste_kg: float | None = Field(None, ge=0)
    waste_reason: str | None = None
    notes: str | None = None


# ── Response ─────────────────────────────────────────────────

class LotOut(BaseModel):
    id: str
    lot_code: str
    batch_id: str
    grower_id: str
    packhouse_id: str
    pack_line_id: str | None
    fruit_type: str
    variety: str | None
    grade: str | None
    size: str | None
    product_config_id: str | None
    pack_spec_id: str | None
    box_size_id: str | None = None
    box_size_name: str | None = None
    box_weight_kg: float | None = None
    target_market: str | None
    carton_count: int
    weight_kg: float | None
    waste_kg: float = 0.0
    waste_reason: str | None = None
    pack_date: date | None
    intake_date: datetime | None
    quality_data: dict | None
    status: str
    notes: str | None
    packed_by: str | None
    created_at: datetime
    updated_at: datetime

    locked_fields: list[str] = []

    # Resolved names
    batch_code: str | None = None
    grower_name: str | None = None
    grower_code: str | None = None

    model_config = {"from_attributes": True}

    @classmethod
    def from_orm_with_names(cls, lot) -> "LotOut":
        data = cls.model_validate(lot)
        if hasattr(lot, "batch") and lot.batch:
            data.batch_code = lot.batch.batch_code
        if hasattr(lot, "grower") and lot.grower:
            data.grower_name = lot.grower.name
            data.grower_code = lot.grower.grower_code
        if hasattr(lot, "box_size") and lot.box_size:
            data.box_size_name = lot.box_size.name
            data.box_weight_kg = lot.box_size.weight_kg
        return data


# ── List (lightweight) ───────────────────────────────────────

class LotSummary(BaseModel):
    id: str
    lot_code: str
    batch_id: str
    fruit_type: str
    variety: str | None
    grade: str | None
    size: str | None
    box_size_id: str | None = None
    carton_count: int
    weight_kg: float | None
    waste_kg: float = 0.0
    waste_reason: str | None = None
    notes: str | None = None
    palletized_boxes: int = 0
    locked_fields: list[str] = []
    status: str
    pack_date: date | None
    created_at: datetime

    model_config = {"from_attributes": True}
