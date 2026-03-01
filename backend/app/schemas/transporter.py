"""Pydantic schemas for Transporter CRUD operations."""

from datetime import datetime

from pydantic import BaseModel, Field


class TransporterCreate(BaseModel):
    name: str = Field(..., max_length=255)
    code: str = Field(..., max_length=50)
    contact_person: str | None = None
    phone: str | None = None
    email: str | None = None
    address: str | None = None
    notes: str | None = None


class TransporterUpdate(BaseModel):
    name: str | None = None
    code: str | None = None
    contact_person: str | None = None
    phone: str | None = None
    email: str | None = None
    address: str | None = None
    notes: str | None = None


class TransporterOut(BaseModel):
    id: str
    name: str
    code: str
    contact_person: str | None
    phone: str | None
    email: str | None
    address: str | None
    notes: str | None
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}
