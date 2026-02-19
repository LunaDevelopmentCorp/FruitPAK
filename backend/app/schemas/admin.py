"""Pydantic schemas for the admin area: overview, activity log, user management."""

from datetime import datetime

from pydantic import BaseModel, EmailStr


# ── Overview ──────────────────────────────────────────────────

class PipelineCounts(BaseModel):
    status: str
    count: int


class StaleItem(BaseModel):
    id: str
    code: str
    entity_type: str
    status: str
    age_hours: float


class ActivityEntry(BaseModel):
    id: str
    user_name: str
    action: str
    entity_type: str
    entity_id: str | None = None
    entity_code: str | None = None
    summary: str | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class AdminOverview(BaseModel):
    batch_pipeline: list[PipelineCounts]
    lot_pipeline: list[PipelineCounts]
    pallet_pipeline: list[PipelineCounts]
    container_pipeline: list[PipelineCounts]
    today_batches: int
    today_pallets: int
    today_containers: int
    waste_kg_today: float
    waste_kg_week: float
    unpalletized_boxes: int
    stale_items: list[StaleItem]
    open_alerts: int
    critical_alerts: int
    active_users: int
    recent_activity: list[ActivityEntry]


# ── Activity Log ──────────────────────────────────────────────

class ActivityListResponse(BaseModel):
    items: list[ActivityEntry]
    total: int


# ── User Management ──────────────────────────────────────────

class UserSummary(BaseModel):
    id: str
    email: str
    full_name: str
    phone: str | None = None
    role: str
    is_active: bool
    assigned_packhouses: list[str] | None = None
    created_at: datetime

    model_config = {"from_attributes": True}


class UserUpdate(BaseModel):
    role: str | None = None
    full_name: str | None = None
    phone: str | None = None
    assigned_packhouses: list[str] | None = None


class CreateUserRequest(BaseModel):
    email: EmailStr
    password: str | None = None
    full_name: str
    phone: str | None = None
    role: str = "operator"
    assigned_packhouses: list[str] | None = None
