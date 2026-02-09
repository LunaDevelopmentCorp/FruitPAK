"""Pydantic schemas for reconciliation API responses."""

from datetime import datetime
from pydantic import BaseModel


class AlertOut(BaseModel):
    """Single reconciliation alert."""
    id: str
    alert_type: str
    severity: str
    title: str
    description: str
    expected_value: float | None
    actual_value: float | None
    variance: float | None
    variance_pct: float | None
    unit: str | None
    entity_refs: dict | None
    period_start: datetime | None
    period_end: datetime | None
    status: str
    resolved_at: datetime | None
    resolved_by: str | None
    resolution_note: str | None
    run_id: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class AlertUpdate(BaseModel):
    """Update an alert's status."""
    status: str  # acknowledged | resolved | dismissed
    resolution_note: str | None = None


class RunSummary(BaseModel):
    """Summary returned after a reconciliation run."""
    run_id: str
    ran_at: str
    total_alerts: int
    by_type: dict[str, int]
    by_severity: dict[str, int]


class DashboardSummary(BaseModel):
    """Aggregated view for the reconciliation dashboard."""
    total_open: int
    total_acknowledged: int
    total_resolved_30d: int
    by_type: dict[str, int]
    by_severity: dict[str, int]
    latest_run_id: str | None
    latest_run_at: datetime | None
    alerts: list[AlertOut]
