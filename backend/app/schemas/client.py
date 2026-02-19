"""Pydantic schemas for Client CRUD operations."""

from datetime import datetime

from pydantic import BaseModel, Field


class ClientCreate(BaseModel):
    name: str = Field(..., max_length=255)
    contact_person: str | None = None
    email: str | None = None
    phone: str | None = None
    address: str | None = None
    country: str | None = None
    incoterm: str | None = None
    payment_terms_days: int | None = None
    currency: str | None = None
    credit_limit: float | None = None
    notes: str | None = None


class ClientUpdate(BaseModel):
    name: str | None = None
    contact_person: str | None = None
    email: str | None = None
    phone: str | None = None
    address: str | None = None
    country: str | None = None
    incoterm: str | None = None
    payment_terms_days: int | None = None
    currency: str | None = None
    credit_limit: float | None = None
    notes: str | None = None


class ClientOut(BaseModel):
    id: str
    name: str
    contact_person: str | None
    email: str | None
    phone: str | None
    address: str | None
    country: str | None
    incoterm: str | None
    payment_terms_days: int | None
    currency: str | None
    credit_limit: float | None
    outstanding_balance: float
    notes: str | None
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
