"""Batch — the fundamental intake unit.

A Batch represents a single delivery of fruit from a grower into a packhouse.
It is created at GRN (Goods Received Note) intake and tracks the fruit through
grading, packing, and palletizing.  Every Lot produced during packing traces
back to a Batch for full traceability.

Lifecycle:  received → grading → packing → complete
"""

import uuid
from datetime import datetime

from sqlalchemy import (
    Boolean, DateTime, Date, Float, ForeignKey,
    Integer, JSON, String, Text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import TenantBase


class Batch(TenantBase):
    __tablename__ = "batches"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    # GRN number — human-readable, unique per tenant
    batch_code: Mapped[str] = mapped_column(
        String(50), unique=True, nullable=False, index=True
    )

    # ── Origin traceability ──────────────────────────────────
    grower_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("growers.id"), nullable=False
    )
    harvest_team_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("harvest_teams.id")
    )
    packhouse_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("packhouses.id"), nullable=False
    )

    # ── Fruit details ────────────────────────────────────────
    fruit_type: Mapped[str] = mapped_column(String(100), nullable=False)
    variety: Mapped[str | None] = mapped_column(String(100))
    harvest_date: Mapped[datetime | None] = mapped_column(Date)
    intake_date: Mapped[datetime] = mapped_column(Date, default=datetime.utcnow)

    # ── Weights ──────────────────────────────────────────────
    gross_weight_kg: Mapped[float | None] = mapped_column(Float, nullable=True)
    tare_weight_kg: Mapped[float] = mapped_column(Float, default=0.0)
    net_weight_kg: Mapped[float | None] = mapped_column(Float)

    # ── Quality at intake ────────────────────────────────────
    # Temperature on arrival (°C), brix reading, visual notes
    arrival_temp_c: Mapped[float | None] = mapped_column(Float)
    brix_reading: Mapped[float | None] = mapped_column(Float)
    # JSON: {"defects": ["sunburn", "wind_scar"], "maturity": "ready", ...}
    quality_assessment: Mapped[dict | None] = mapped_column(JSON)

    # ── Status ───────────────────────────────────────────────
    # received | grading | packing | complete | rejected
    status: Mapped[str] = mapped_column(String(30), default="received", index=True)
    rejection_reason: Mapped[str | None] = mapped_column(Text)

    # ── Bin / container tracking ─────────────────────────────
    bin_count: Mapped[int | None] = mapped_column(Integer)
    bin_type: Mapped[str | None] = mapped_column(String(50))

    # ── Metadata ─────────────────────────────────────────────
    notes: Mapped[str | None] = mapped_column(Text)
    received_by: Mapped[str | None] = mapped_column(String(36))  # user_id
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )

    # ── Relationships ────────────────────────────────────────
    grower = relationship("Grower", backref="batches", lazy="selectin")
    harvest_team = relationship("HarvestTeam", backref="batches", lazy="selectin")
    packhouse = relationship("Packhouse", backref="batches", lazy="selectin")
    lots = relationship("Lot", back_populates="batch", lazy="selectin")
    history = relationship(
        "BatchHistory", back_populates="batch",
        order_by="BatchHistory.recorded_at", lazy="selectin",
    )
