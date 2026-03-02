"""Pydantic schemas for Container CRUD operations."""

from datetime import date, datetime

from pydantic import BaseModel, Field


# ── Create container from pallets ─────────────────────────────

class ContainerFromPalletsRequest(BaseModel):
    """Payload for POST /api/containers/from-pallets."""
    container_type: str = Field(..., max_length=50)
    capacity_pallets: int = Field(20, ge=1)
    pallet_ids: list[str] = Field(..., min_length=1)
    client_id: str | None = None
    customer_name: str | None = None
    shipping_container_number: str | None = None
    export_date: datetime | None = None
    destination: str | None = None
    seal_number: str | None = None
    transporter_id: str | None = None
    shipping_agent_id: str | None = None
    shipping_line_id: str | None = None
    vessel_name: str | None = None
    voyage_number: str | None = None
    eta: date | None = None
    notes: str | None = None


# ── Create empty container ────────────────────────────────────

class CreateEmptyContainerRequest(BaseModel):
    """Payload for POST /api/containers/ (empty, no pallets)."""
    container_type: str = Field(..., max_length=50)
    capacity_pallets: int = Field(20, ge=1)
    client_id: str | None = None
    shipping_container_number: str | None = None
    destination: str | None = None
    export_date: datetime | None = None
    seal_number: str | None = None
    transporter_id: str | None = None
    shipping_agent_id: str | None = None
    shipping_line_id: str | None = None
    vessel_name: str | None = None
    voyage_number: str | None = None
    eta: date | None = None
    notes: str | None = None


# ── Update container ─────────────────────────────────────────

class ContainerUpdate(BaseModel):
    """Payload for PATCH /api/containers/{id}."""
    container_type: str | None = None
    capacity_pallets: int | None = Field(None, ge=1)
    client_id: str | None = None
    customer_name: str | None = None
    shipping_container_number: str | None = None
    destination: str | None = None
    export_date: datetime | None = None
    seal_number: str | None = None
    transporter_id: str | None = None
    shipping_agent_id: str | None = None
    shipping_line_id: str | None = None
    vessel_name: str | None = None
    voyage_number: str | None = None
    eta: date | None = None
    notes: str | None = None
    transport_config_id: str | None = None


# ── Load pallets into container ───────────────────────────────

class LoadPalletsRequest(BaseModel):
    """Payload for POST /api/containers/{id}/load-pallets."""
    pallet_ids: list[str] = Field(..., min_length=1)
    force: bool = False


# ── Status transition request schemas ─────────────────────────

class SealContainerRequest(BaseModel):
    """Payload for POST /api/containers/{id}/seal."""
    seal_number: str = Field(..., min_length=1, max_length=100)
    temp_setpoint_c: float | None = None


class ExportContainerRequest(BaseModel):
    """Payload for POST /api/containers/{id}/export."""
    vessel_name: str | None = None
    voyage_number: str | None = None
    shipping_line_id: str | None = None
    eta: date | None = None


# ── Pallet in container (traceability) ────────────────────────

class ContainerPalletOut(BaseModel):
    id: str
    pallet_number: str
    current_boxes: int
    fruit_type: str | None
    grade: str | None
    size: str | None
    box_size_name: str | None = None
    status: str

    model_config = {"from_attributes": True}


# ── Traceability: lot → batch → grower chain ─────────────────

class TraceLot(BaseModel):
    lot_code: str
    grade: str | None
    size: str | None
    box_count: int
    box_size_name: str | None = None


class TraceBatch(BaseModel):
    batch_code: str
    grower_name: str | None
    grower_code: str | None = None
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
    client_id: str | None = None
    customer_name: str | None
    destination: str | None
    shipping_container_number: str | None = None
    transporter_id: str | None = None
    transporter_name: str | None = None
    shipping_agent_id: str | None = None
    shipping_agent_name: str | None = None
    shipping_line_id: str | None = None
    shipping_line_name: str | None = None
    vessel_name: str | None = None
    voyage_number: str | None = None
    eta: date | None = None
    is_overdue: bool = False
    status: str
    pallet_numbers: list[str] = []
    lot_codes: list[str] = []
    batch_codes: list[str] = []
    locked_fields: list[str] = []
    created_at: datetime

    model_config = {"from_attributes": True}


class ContainerDetail(ContainerSummary):
    export_date: datetime | None
    seal_number: str | None
    sealed_at: datetime | None = None
    sealed_by: str | None = None
    packhouse_id: str | None
    transport_config_id: str | None = None
    temp_setpoint_c: float | None = None
    dispatched_at: datetime | None = None
    arrived_at: datetime | None = None
    delivered_at: datetime | None = None
    qr_code_url: str | None
    notes: str | None
    updated_at: datetime
    pallets: list[ContainerPalletOut] = []
    traceability: list[TracePallet] = []
    capacity_warnings: list[str] = []

    model_config = {"from_attributes": True}


# ── Transport config capacity schemas ─────────────────────────

class BoxCapacityOut(BaseModel):
    box_size_id: str
    box_size_name: str | None = None
    max_boxes: int

    model_config = {"from_attributes": True}


class BoxCapacityInput(BaseModel):
    box_size_id: str
    max_boxes: int = Field(..., ge=1)


class TransportConfigOut(BaseModel):
    id: str
    name: str
    container_type: str
    temp_setpoint_c: float | None = None
    temp_min_c: float | None = None
    temp_max_c: float | None = None
    pallet_capacity: int | None = None
    max_weight_kg: float | None = None
    box_capacities: list[BoxCapacityOut] = []

    model_config = {"from_attributes": True}


class TransportConfigUpdate(BaseModel):
    name: str | None = None
    container_type: str | None = None
    temp_setpoint_c: float | None = None
    temp_min_c: float | None = None
    temp_max_c: float | None = None
    pallet_capacity: int | None = None
    max_weight_kg: float | None = None
