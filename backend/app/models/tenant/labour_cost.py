"""LabourCost — tracks labour costs across packhouse operations.

Captures costs for packing line workers, harvest teams, cold store
operators, and any other labour.  Can link to a supplier (labour broker)
and/or a specific packhouse or pack line.
"""

import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean, DateTime, Date, Float, ForeignKey,
    JSON, String, Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import TenantBase


class LabourCost(TenantBase):
    __tablename__ = "labour_costs"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )

    # ── Category ─────────────────────────────────────────────
    # packing | harvest | cold_store | loading | admin | other
    category: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    description: Mapped[str | None] = mapped_column(String(255))

    # ── Links ────────────────────────────────────────────────
    supplier_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("suppliers.id")
    )
    packhouse_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("packhouses.id")
    )
    pack_line_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("pack_lines.id")
    )
    harvest_team_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("harvest_teams.id")
    )

    # ── Cost details ─────────────────────────────────────────
    currency: Mapped[str] = mapped_column(String(3), default="ZAR")
    hours_worked: Mapped[float | None] = mapped_column(Float)
    rate_per_hour: Mapped[float | None] = mapped_column(Float)
    headcount: Mapped[float | None] = mapped_column(Float)
    total_amount: Mapped[float] = mapped_column(Float, nullable=False)
    # JSON: overtime, allowances, etc.
    # {"overtime_hours": 4, "overtime_rate": 45.0, "meal_allowance": 200}
    extras: Mapped[dict | None] = mapped_column(JSON)

    # ── Period ───────────────────────────────────────────────
    work_date: Mapped[datetime] = mapped_column(Date, nullable=False, index=True)
    period_start: Mapped[datetime | None] = mapped_column(Date)
    period_end: Mapped[datetime | None] = mapped_column(Date)

    # ── Status ───────────────────────────────────────────────
    # recorded | approved | invoiced | paid
    status: Mapped[str] = mapped_column(String(30), default="recorded")

    # ── Metadata ─────────────────────────────────────────────
    notes: Mapped[str | None] = mapped_column(Text)
    recorded_by: Mapped[str | None] = mapped_column(String(36))  # user_id
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    # ── Relationships ────────────────────────────────────────
    supplier = relationship("Supplier", lazy="selectin")
    packhouse = relationship("Packhouse", lazy="selectin")
    harvest_team = relationship("HarvestTeam", lazy="selectin")
