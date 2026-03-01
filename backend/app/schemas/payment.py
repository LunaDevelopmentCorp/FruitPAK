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
    grower_code: str | None = None
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


class GrowerPaymentUpdate(BaseModel):
    amount: float | None = None
    payment_type: str | None = None
    payment_date: date | None = None
    notes: str | None = None
    status: str | None = None

    @field_validator("amount")
    @classmethod
    def amount_positive(cls, v: float | None) -> float | None:
        if v is not None and v <= 0:
            raise ValueError("Amount must be positive")
        return v

    @field_validator("payment_type")
    @classmethod
    def valid_type(cls, v: str | None) -> str | None:
        if v is not None and v not in ("advance", "final"):
            raise ValueError("payment_type must be 'advance' or 'final'")
        return v

    @field_validator("status")
    @classmethod
    def valid_status(cls, v: str | None) -> str | None:
        if v is not None and v not in ("paid", "cancelled"):
            raise ValueError("status must be 'paid' or 'cancelled'")
        return v


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


class TeamPaymentUpdate(BaseModel):
    amount: float | None = None
    payment_type: str | None = None
    payment_date: date | None = None
    notes: str | None = None
    status: str | None = None

    @field_validator("amount")
    @classmethod
    def amount_positive(cls, v: float | None) -> float | None:
        if v is not None and v <= 0:
            raise ValueError("Amount must be positive")
        return v

    @field_validator("payment_type")
    @classmethod
    def valid_type(cls, v: str | None) -> str | None:
        if v is not None and v not in ("advance", "final"):
            raise ValueError("payment_type must be 'advance' or 'final'")
        return v

    @field_validator("status")
    @classmethod
    def valid_status(cls, v: str | None) -> str | None:
        if v is not None and v not in ("paid", "cancelled"):
            raise ValueError("status must be 'paid' or 'cancelled'")
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
    rate_per_kg: float | None  # team's default rate per kg
    amount_owed: float       # Σ (batch_class1_kg × effective_rate) per batch
    total_advances: float
    total_finals: float
    total_paid: float
    balance: float           # amount_owed - total_paid (negative = still owed)
    batch_codes: list[str] = []  # batch codes for client-side search


# ── Team Reconciliation Detail ───────────────────────────────


class TeamReconciliationBatch(BaseModel):
    """Per-batch breakdown for team reconciliation drill-down."""
    batch_id: str
    batch_code: str
    intake_date: date | None
    intake_kg: float
    class1_kg: float
    harvest_rate_per_kg: float | None  # batch-level rate (may be null)
    effective_rate: float | None       # batch rate or team fallback
    owed: float


class TeamReconciliationPayment(BaseModel):
    """Payment record for team reconciliation drill-down."""
    id: str
    payment_ref: str
    payment_date: date | None
    payment_type: str
    amount: float
    currency: str


class TeamReconciliationDetail(BaseModel):
    """Full reconciliation drill-down for a single harvest team."""
    harvest_team_id: str
    team_name: str
    team_leader: str | None
    team_rate_per_kg: float | None
    rate_currency: str
    batches: list[TeamReconciliationBatch]
    payments: list[TeamReconciliationPayment]
    total_owed: float
    total_paid: float
    balance: float


# ── Grower Reconciliation ────────────────────────────────────


class GrowerReconciliationBatch(BaseModel):
    """Per-batch breakdown for grower reconciliation drill-down."""
    batch_id: str
    batch_code: str
    intake_date: date | None
    intake_kg: float
    status: str


class GrowerReconciliationPayment(BaseModel):
    """Payment record for grower reconciliation drill-down."""
    id: str
    payment_ref: str
    payment_date: date | None
    payment_type: str
    gross_amount: float
    currency: str


class GrowerReconciliationDetail(BaseModel):
    """Full reconciliation drill-down for a single grower."""
    grower_id: str
    grower_name: str
    grower_code: str | None
    currency: str
    batches: list[GrowerReconciliationBatch]
    payments: list[GrowerReconciliationPayment]
    total_intake_kg: float
    total_paid: float
    total_batches: int
