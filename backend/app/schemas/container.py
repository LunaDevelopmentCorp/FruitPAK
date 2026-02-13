"""Pydantic schemas for Container CRUD operations."""

from datetime import datetime

from pydantic import BaseModel, Field


# ── Create container from pallets ─────────────────────────────

class ContainerFromPalletsRequest(BaseModel):
    """Payload for POST /api/containers/from-pallets."""
    container_type: str = Field(..., max_length=50)
    capacity_pallets: int = Field(20, ge=1)
    pallet_ids: list[str] = Field(..., min_length=1)
    customer_name: str | None = None
    export_date: datetime | None = None
    destination: str | None = None
    seal_number: str | None = None
    notes: str | None = None


# ── Pallet in container (traceability) ────────────────────────

class ContainerPalletOut(BaseModel):
    id: str
    pallet_number: str
    current_boxes: int
    fruit_type: str | None
    grade: str | None
    size: str | None
    status: str

    model_config = {"from_attributes": True}


# ── Traceability: lot → batch → grower chain ─────────────────

class TraceLot(BaseModel):
    lot_code: str
    grade: str | None
    size: str | None
    box_count: int


class TraceBatch(BaseModel):
    batch_code: str
    grower_name: str | None
    fruit_type: str
    intake_date: str | None


class TracePallet(BaseModel):
    pallet_number: str
    current_boxes: int
    lots: list[TraceLot] = []
    batches: list[TraceBatch] = []


# ── Response ─────────────────────────────────────────────────

class ContainerSummary(BaseModel):
    id: str
    container_number: str
    container_type: str
    capacity_pallets: int
    pallet_count: int
    total_cartons: int
    gross_weight_kg: float | None
    customer_name: str | None
    destination: str | None
    status: str
    created_at: datetime

    model_config = {"from_attributes": True}


class ContainerDetail(ContainerSummary):
    export_date: datetime | None
    seal_number: str | None
    packhouse_id: str | None
    qr_code_url: str | None
    notes: str | None
    updated_at: datetime
    pallets: list[ContainerPalletOut] = []
    traceability: list[TracePallet] = []

    model_config = {"from_attributes": True}
