"""Pydantic schemas for Lot CRUD operations."""

from datetime import date, datetime

from pydantic import BaseModel, Field


# ── Create ───────────────────────────────────────────────────

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
    target_market: str | None = None
    carton_count: int | None = None
    weight_kg: float | None = None
    pack_date: date | None = None
    quality_data: dict | None = None
    status: str | None = None
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
    target_market: str | None
    carton_count: int
    weight_kg: float | None
    pack_date: date | None
    intake_date: datetime | None
    quality_data: dict | None
    status: str
    notes: str | None
    packed_by: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ── List (lightweight) ───────────────────────────────────────

class LotSummary(BaseModel):
    id: str
    lot_code: str
    batch_id: str
    fruit_type: str
    variety: str | None
    grade: str | None
    size: str | None
    carton_count: int
    weight_kg: float | None
    status: str
    pack_date: date | None
    created_at: datetime

    model_config = {"from_attributes": True}
