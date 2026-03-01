"""Pydantic schemas for ShippingSchedule CRUD operations."""

from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field


# ── Create ────────────────────────────────────────────────────

class ShippingScheduleCreate(BaseModel):
    shipping_line_id: str | None = None
    shipping_line: str = Field(..., max_length=100)
    vessel_name: str = Field(..., max_length=255)
    voyage_number: str = Field(..., max_length=100)
    port_of_loading: str = Field(..., max_length=255)
    port_of_discharge: str = Field(..., max_length=255)
    etd: date
    eta: date
    booking_cutoff: date | None = None
    cargo_cutoff: date | None = None
    status: str = "scheduled"
    notes: str | None = None


# ── Update (partial) ─────────────────────────────────────────

class ShippingScheduleUpdate(BaseModel):
    shipping_line_id: str | None = None
    shipping_line: str | None = None
    vessel_name: str | None = None
    voyage_number: str | None = None
    port_of_loading: str | None = None
    port_of_discharge: str | None = None
    etd: date | None = None
    eta: date | None = None
    booking_cutoff: date | None = None
    cargo_cutoff: date | None = None
    status: str | None = None
    notes: str | None = None


# ── Response (summary — used in list) ────────────────────────

class ShippingScheduleSummary(BaseModel):
    id: str
    shipping_line_id: str | None = None
    shipping_line: str
    shipping_line_name: str | None = None
    vessel_name: str
    voyage_number: str
    port_of_loading: str
    port_of_discharge: str
    etd: date
    eta: date
    booking_cutoff: date | None
    cargo_cutoff: date | None
    status: str
    source: str
    notes: str | None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


# ── Response (detail — includes timestamps) ──────────────────

class ShippingScheduleDetail(ShippingScheduleSummary):
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
