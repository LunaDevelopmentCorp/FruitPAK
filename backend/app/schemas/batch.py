"""Pydantic schemas for Batch CRUD operations."""

from __future__ import annotations

from datetime import date, datetime

from pydantic import BaseModel, Field, model_validator

from app.schemas.lot import LotSummary


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
    harvest_team_id: str
    tare_weight_kg: float = 0.0
    arrival_temp_c: float | None = None
    brix_reading: float | None = None
    quality_assessment: dict | None = None
    bin_count: int | None = Field(None, ge=1)
    bin_type: str | None = None
    field_code: str | None = None
    field_name: str | None = None
    vehicle_reg: str | None = None
    driver_name: str | None = None
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
    waste_kg: float | None = Field(None, ge=0)
    waste_reason: str | None = None
    bin_count: int | None = None
    bin_type: str | None = None
    payment_routing: str | None = None
    harvest_rate_per_kg: float | None = None
    vehicle_reg: str | None = None
    driver_name: str | None = None
    notes: str | None = None


# ── Response ─────────────────────────────────────────────────

class BatchOut(BaseModel):
    id: str
    batch_code: str
    grower_id: str
    grower_name: str | None = None
    grower_code: str | None = None
    harvest_team_id: str | None
    harvest_team_name: str | None = None
    payment_routing: str = "grower"
    harvest_rate_per_kg: float | None = None
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
    waste_kg: float = 0.0
    waste_reason: str | None = None
    bin_count: int | None
    bin_type: str | None
    field_code: str | None = None
    field_name: str | None = None
    vehicle_reg: str | None = None
    driver_name: str | None = None
    notes: str | None
    received_by: str | None
    locked_fields: list[str] = []
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}

    @model_validator(mode="before")
    @classmethod
    def _extract_related(cls, data):
        if hasattr(data, "grower") and data.grower:
            data.__dict__["grower_name"] = data.grower.name
            data.__dict__["grower_code"] = data.grower.grower_code
        if hasattr(data, "harvest_team") and data.harvest_team:
            data.__dict__["harvest_team_name"] = data.harvest_team.name
        return data


# ── List (lightweight) ───────────────────────────────────────

class BatchSummary(BaseModel):
    id: str
    batch_code: str
    grower_id: str
    grower_name: str | None = None
    grower_code: str | None = None
    harvest_team_id: str | None = None
    harvest_team_name: str | None = None
    harvest_team_leader: str | None = None
    payment_routing: str = "grower"
    harvest_rate_per_kg: float | None = None
    fruit_type: str
    variety: str | None
    gross_weight_kg: float | None
    tare_weight_kg: float = 0.0
    net_weight_kg: float | None
    bin_count: int | None = None
    bin_type: str | None = None
    field_code: str | None = None
    field_name: str | None = None
    vehicle_reg: str | None = None
    driver_name: str | None = None
    harvest_date: date | None = None
    notes: str | None = None
    status: str
    intake_date: datetime | None
    created_at: datetime

    model_config = {"from_attributes": True}

    @model_validator(mode="before")
    @classmethod
    def _extract_related_names(cls, data):
        if hasattr(data, "grower") and data.grower:
            data.__dict__["grower_name"] = data.grower.name
            data.__dict__["grower_code"] = data.grower.grower_code
        if hasattr(data, "harvest_team") and data.harvest_team:
            data.__dict__["harvest_team_name"] = data.harvest_team.name
            data.__dict__["harvest_team_leader"] = data.harvest_team.team_leader
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
    recorded_by_name: str | None = None
    recorded_at: datetime

    model_config = {"from_attributes": True}


# ── Detail (full, with resolved names + history + lots) ──────

class BatchDetailOut(BatchOut):
    grower_name: str | None = None
    packhouse_name: str | None = None
    received_by_name: str | None = None
    history: list[BatchHistoryOut] = []
    lots: list["LotSummaryWithAllocation"] = []

    @model_validator(mode="before")
    @classmethod
    def _extract_relations(cls, data):
        if hasattr(data, "grower") and data.grower:
            data.__dict__["grower_name"] = data.grower.name
            data.__dict__["grower_code"] = data.grower.grower_code
        if hasattr(data, "packhouse") and data.packhouse:
            data.__dict__["packhouse_name"] = data.packhouse.name
        # Prevent lazy-load of history in async context — the router
        # loads history separately and assigns it after model_validate.
        if hasattr(data, "__dict__") and "history" not in data.__dict__:
            data.__dict__["history"] = []
        # received_by_name is injected by the router after user lookup
        return data


class LotSummaryWithAllocation(LotSummary):
    """LotSummary extended with palletized box count."""
    palletized_boxes: int = 0
