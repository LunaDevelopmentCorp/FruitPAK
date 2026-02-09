"""BatchHistory — immutable event log for batch movements.

Records every state transition, location change, and quality event for a
batch as it moves through the packhouse.  This table is the primary
traceability and audit trail.

TimescaleDB note:
    After initial Alembic migration, convert to a hypertable for efficient
    time-range queries:

        SELECT create_hypertable('batch_history', 'recorded_at');

    This enables automatic partitioning by time and fast aggregation.
"""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import TenantBase


class BatchHistory(TenantBase):
    __tablename__ = "batch_history"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    batch_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("batches.id"), nullable=False, index=True
    )

    # ── Event classification ─────────────────────────────────
    # intake | grading | packing | cold_storage | loading | export | rejected | note
    event_type: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    # Freeform sub-type: "temperature_check", "bin_tip", "qc_pass", etc.
    event_subtype: Mapped[str | None] = mapped_column(String(100))

    # ── Location ─────────────────────────────────────────────
    packhouse_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("packhouses.id")
    )
    pack_line_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("pack_lines.id")
    )
    # Free text for cold room number, storage bay, loading dock, etc.
    location_detail: Mapped[str | None] = mapped_column(String(255))

    # ── Event data ───────────────────────────────────────────
    # Flexible payload — structure depends on event_type:
    #   intake:      {"gross_weight_kg": 5000, "bin_count": 10}
    #   grading:     {"grade_breakdown": {"Class1": 60, "Class2": 30, "Waste": 10}}
    #   packing:     {"lots_created": ["lot-001", "lot-002"], "pack_spec": "4kg OT"}
    #   cold_storage: {"room": "CR-3", "temp_c": 2.5, "humidity_pct": 85}
    #   loading:     {"container_id": "...", "pallet_ids": [...]}
    #   export:      {"booking_ref": "XYZ-123"}
    event_data: Mapped[dict | None] = mapped_column(JSON)

    notes: Mapped[str | None] = mapped_column(Text)
    recorded_by: Mapped[str | None] = mapped_column(String(36))  # user_id
    recorded_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False, index=True
    )

    # ── Relationships ────────────────────────────────────────
    batch = relationship("Batch", back_populates="history")
