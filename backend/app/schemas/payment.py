"""Pydantic schemas for grower and harvest team payment recording."""

from datetime import date, datetime

from pydantic import BaseModel, field_validator


class GrowerPaymentCreate(BaseModel):
    grower_id: str
    amount: float
    currency: str = "ZAR"
    payment_type: str = "final"
    payment_date: date
    notes: str | None = None
    batch_ids: list[str] = []

    @field_validator("amount")
    @classmethod
    def amount_positive(cls, v: float) -> float:
        if v <= 0:
            raise ValueError("Amount must be positive")
        return v

    @field_validator("payment_type")
    @classmethod
    def valid_type(cls, v: str) -> str:
        if v not in ("advance", "final"):
            raise ValueError("payment_type must be 'advance' or 'final'")
        return v


class GrowerPaymentOut(BaseModel):
    id: str
    payment_ref: str
    grower_id: str
    grower_name: str | None = None
    batch_ids: list[str]
    currency: str
    gross_amount: float
    net_amount: float
    total_kg: float | None = None
    payment_type: str
    paid_date: date | None = None
    status: str
    notes: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Harvest Team Payments ────────────────────────────────────


class TeamPaymentCreate(BaseModel):
    harvest_team_id: str
    amount: float
    currency: str = "ZAR"
    payment_type: str = "advance"
    payment_date: date
    notes: str | None = None
    batch_ids: list[str] = []

    @field_validator("amount")
    @classmethod
    def amount_positive(cls, v: float) -> float:
        if v <= 0:
            raise ValueError("Amount must be positive")
        return v

    @field_validator("payment_type")
    @classmethod
    def valid_type(cls, v: str) -> str:
        if v not in ("advance", "final"):
            raise ValueError("payment_type must be 'advance' or 'final'")
        return v


class TeamPaymentOut(BaseModel):
    id: str
    payment_ref: str
    harvest_team_id: str
    team_name: str | None = None
    team_leader: str | None = None
    batch_ids: list[str]
    currency: str
    amount: float
    total_kg: float | None = None
    total_bins: int | None = None
    payment_type: str
    payment_date: date | None = None
    status: str
    notes: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class TeamSummary(BaseModel):
    """Reconciliation summary for a single harvest team."""
    harvest_team_id: str
    team_name: str
    team_leader: str | None
    total_batches: int
    total_kg: float          # raw intake kg
    total_bins: int
    class1_kg: float         # Class 1 packed-out kg (from lots)
    rate_per_kg: float | None  # team's contracted rate per kg
    amount_owed: float       # class1_kg × rate_per_kg (0 if no rate)
    total_advances: float
    total_finals: float
    total_paid: float
    balance: float           # amount_owed - total_paid (negative = still owed)
