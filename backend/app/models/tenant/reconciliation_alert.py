"""ReconciliationAlert — flags mismatches between physical and financial records.

Each alert represents a single detected discrepancy, categorised by type
and severity.  Alerts are created by the daily reconciliation job and
remain open until manually reviewed or auto-resolved on the next run.

Lifecycle:  open → acknowledged → resolved | dismissed
"""

import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean, DateTime, Float, String, Text, JSON,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.database import TenantBase


class ReconciliationAlert(TenantBase):
    __tablename__ = "reconciliation_alerts"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )

    # ── Classification ───────────────────────────────────────
    # grn_vs_payment | export_vs_invoice | labour_vs_cost |
    # pallet_vs_container | lot_vs_batch | cold_storage_gap
    alert_type: Mapped[str] = mapped_column(String(50), nullable=False, index=True)

    # critical | high | medium | low
    severity: Mapped[str] = mapped_column(String(20), nullable=False, index=True)

    # ── Mismatch details ─────────────────────────────────────
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)

    # The two values that don't match
    expected_value: Mapped[float | None] = mapped_column(Float)
    actual_value: Mapped[float | None] = mapped_column(Float)
    variance: Mapped[float | None] = mapped_column(Float)
    # Percentage deviation: abs(actual - expected) / expected * 100
    variance_pct: Mapped[float | None] = mapped_column(Float)
    unit: Mapped[str | None] = mapped_column(String(20))  # kg, ZAR, hours, pallets

    # ── Entity references ────────────────────────────────────
    # Store IDs of the entities involved so the UI can link to them
    # {"batch_id": "...", "grower_payment_id": "...", "grower_id": "..."}
    entity_refs: Mapped[dict | None] = mapped_column(JSON)

    # ── Period ───────────────────────────────────────────────
    # The date range this check covers (e.g. the batch intake date,
    # or the invoice period)
    period_start: Mapped[datetime | None] = mapped_column(DateTime)
    period_end: Mapped[datetime | None] = mapped_column(DateTime)

    # ── Status ───────────────────────────────────────────────
    # open | acknowledged | resolved | dismissed
    status: Mapped[str] = mapped_column(String(20), default="open", index=True)
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime)
    resolved_by: Mapped[str | None] = mapped_column(String(36))  # user_id
    resolution_note: Mapped[str | None] = mapped_column(Text)

    # ── Run metadata ─────────────────────────────────────────
    # Which reconciliation run created this alert
    run_id: Mapped[str | None] = mapped_column(String(36), index=True)
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )
