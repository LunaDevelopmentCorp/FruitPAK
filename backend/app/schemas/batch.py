"""Pydantic schemas for Batch CRUD operations."""

from datetime import date, datetime

from pydantic import BaseModel, Field, model_validator


# ── GRN Intake (primary intake flow) ─────────────────────────

class GRNRequest(BaseModel):
    """Payload for POST /api/batches/grn — the packhouse intake form.

    At least one of ``gross_weight_kg`` or ``bin_count`` must be provided.
    Weight can be added later (retrospective weighing) via PATCH.
    """
    grower_id: str
    packhouse_id: str
    fruit_type: str
    gross_weight_kg: float | None = Field(None, ge=0)

    # Optional but typical at intake
    harvest_date: date | None = None
    variety: str | None = None
    quality_grade: str | None = None
    harvest_team_id: str | None = None
    tare_weight_kg: float = 0.0
    arrival_temp_c: float | None = None
    brix_reading: float | None = None
    quality_assessment: dict | None = None
    bin_count: int | None = Field(None, ge=1)
    bin_type: str | None = None
    delivery_notes: str | None = None

    @model_validator(mode="after")
    def weight_or_units_required(self):
        if self.gross_weight_kg is None and self.bin_count is None:
            raise ValueError(
                "Provide at least one of gross_weight_kg or bin_count"
            )
        return self


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
    intake_date: datetime | None
    gross_weight_kg: float | None
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
    grower_name: str | None = None
    fruit_type: str
    variety: str | None
    gross_weight_kg: float | None
    net_weight_kg: float | None
    status: str
    intake_date: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}

    @model_validator(mode="before")
    @classmethod
    def _extract_grower_name(cls, data):
        if hasattr(data, "grower") and data.grower:
            data.__dict__["grower_name"] = data.grower.name
        return data


# ── History event ────────────────────────────────────────────

class BatchHistoryOut(BaseModel):
    id: str
    event_type: str
    event_subtype: str | None = None
    event_data: dict | None = None
    location_detail: str | None = None
    notes: str | None = None
    recorded_by: str | None = None
    recorded_at: datetime

    model_config = {"from_attributes": True}


# ── Detail (full, with resolved names + history) ────────────

class BatchDetailOut(BatchOut):
    grower_name: str | None = None
    packhouse_name: str | None = None
    history: list[BatchHistoryOut] = []

    @model_validator(mode="before")
    @classmethod
    def _extract_relations(cls, data):
        if hasattr(data, "grower") and data.grower:
            data.__dict__["grower_name"] = data.grower.name
        if hasattr(data, "packhouse") and data.packhouse:
            data.__dict__["packhouse_name"] = data.packhouse.name
        return data
