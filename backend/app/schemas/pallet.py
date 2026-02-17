"""Pydantic schemas for Pallet CRUD operations."""

from datetime import datetime

from pydantic import BaseModel, Field


# ── Create pallets from lots ─────────────────────────────────

class LotAssignment(BaseModel):
    """One lot's contribution to a pallet."""
    lot_id: str
    box_count: int = Field(..., ge=1)
    size: str | None = None


class PalletFromLotsRequest(BaseModel):
    """Payload for POST /api/pallets/from-lots."""
    pallet_type_name: str
    capacity_boxes: int = Field(240, ge=1)
    lot_assignments: list[LotAssignment] = Field(..., min_length=1)
    packhouse_id: str
    notes: str | None = None


# ── Allocate boxes to existing pallet ────────────────────────

class AllocateBoxesRequest(BaseModel):
    """Payload for POST /api/pallets/{pallet_id}/allocate."""
    lot_assignments: list[LotAssignment] = Field(..., min_length=1)


# ── Deallocate result ──────────────────────────────────────────

class DeallocateResult(BaseModel):
    """Response for DELETE /api/pallets/{pallet_id}/lots/{pallet_lot_id}."""
    pallet_id: str
    pallet_lot_id: str
    boxes_returned: int
    pallet_status: str
    pallet_current_boxes: int


# ── PalletLot (join) ─────────────────────────────────────────

class PalletLotOut(BaseModel):
    id: str
    pallet_id: str
    lot_id: str
    box_count: int
    size: str | None
    lot_code: str | None = None
    grade: str | None = None

    model_config = {"from_attributes": True}


# ── Response ─────────────────────────────────────────────────

class PalletSummary(BaseModel):
    id: str
    pallet_number: str
    pallet_type_name: str | None
    capacity_boxes: int
    current_boxes: int
    fruit_type: str | None
    grade: str | None
    size: str | None
    net_weight_kg: float | None
    status: str
    created_at: datetime

    model_config = {"from_attributes": True}


class PalletDetail(PalletSummary):
    variety: str | None
    target_market: str | None
    packhouse_id: str
    cold_store_room: str | None
    cold_store_position: str | None
    qr_code_url: str | None
    notes: str | None
    palletized_by: str | None
    updated_at: datetime
    pallet_lots: list[PalletLotOut] = []

    model_config = {"from_attributes": True}


# ── Config (enterprise box sizes & pallet types) ─────────────

class BoxSizeOut(BaseModel):
    id: str
    name: str
    size_code: int | None
    fruit_count: int | None
    weight_kg: float
    cost_per_unit: float | None = None

    model_config = {"from_attributes": True}


class PalletTypeOut(BaseModel):
    id: str
    name: str
    capacity_boxes: int
    notes: str | None

    model_config = {"from_attributes": True}
