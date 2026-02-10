"""Pydantic schemas for Batch CRUD operations."""

from datetime import date, datetime

from pydantic import BaseModel, Field


# ── GRN Intake (primary intake flow) ─────────────────────────

class GRNRequest(BaseModel):
    """Payload for POST /api/batches/grn — the packhouse intake form."""
    grower_id: str
    packhouse_id: str
    fruit_type: str
    gross_weight_kg: float = Field(..., gt=0)

    # Optional but typical at intake
    harvest_date: date | None = None
    variety: str | None = None
    quality_grade: str | None = None
    harvest_team_id: str | None = None
    tare_weight_kg: float = 0.0
    arrival_temp_c: float | None = None
    brix_reading: float | None = None
    quality_assessment: dict | None = None
    bin_count: int | None = None
    bin_type: str | None = None
    delivery_notes: str | None = None


class GRNResponse(BaseModel):
    """Response from POST /api/batches/grn."""
    batch: "BatchOut"
    qr_code_url: str
    advance_payment_linked: bool
    advance_payment_ref: str | None = None


# ── Create ───────────────────────────────────────────────────

class BatchCreate(BaseModel):
    batch_code: str = Field(..., max_length=50)
    grower_id: str
    packhouse_id: str
    fruit_type: str
    gross_weight_kg: float = Field(..., gt=0)

    # Optional fields
    harvest_team_id: str | None = None
    variety: str | None = None
    harvest_date: date | None = None
    tare_weight_kg: float = 0.0
    arrival_temp_c: float | None = None
    brix_reading: float | None = None
    quality_assessment: dict | None = None
    bin_count: int | None = None
    bin_type: str | None = None
    notes: str | None = None


# ── Update (partial) ─────────────────────────────────────────

class BatchUpdate(BaseModel):
    variety: str | None = None
    harvest_date: date | None = None
    gross_weight_kg: float | None = Field(None, gt=0)
    tare_weight_kg: float | None = None
    net_weight_kg: float | None = None
    arrival_temp_c: float | None = None
    brix_reading: float | None = None
    quality_assessment: dict | None = None
    status: str | None = None
    rejection_reason: str | None = None
    bin_count: int | None = None
    bin_type: str | None = None
    notes: str | None = None


# ── Response ─────────────────────────────────────────────────

class BatchOut(BaseModel):
    id: str
    batch_code: str
    grower_id: str
    harvest_team_id: str | None
    packhouse_id: str
    fruit_type: str
    variety: str | None
    harvest_date: date | None
    intake_date: date | None
    gross_weight_kg: float
    tare_weight_kg: float
    net_weight_kg: float | None
    arrival_temp_c: float | None
    brix_reading: float | None
    quality_assessment: dict | None
    status: str
    rejection_reason: str | None
    bin_count: int | None
    bin_type: str | None
    notes: str | None
    received_by: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ── List (lightweight) ───────────────────────────────────────

class BatchSummary(BaseModel):
    id: str
    batch_code: str
    grower_id: str
    fruit_type: str
    variety: str | None
    gross_weight_kg: float
    net_weight_kg: float | None
    status: str
    intake_date: date | None
    created_at: datetime

    model_config = {"from_attributes": True}
