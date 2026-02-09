"""Tracks onboarding wizard progress per tenant.

One row per enterprise (created on first wizard access).
Stores which steps are completed and optional partial draft data
for the step currently in progress.
"""

import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, JSON, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import TenantBase


class WizardState(TenantBase):
    __tablename__ = "wizard_state"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    current_step: Mapped[int] = mapped_column(Integer, default=1)
    completed_steps: Mapped[list] = mapped_column(JSON, default=list)
    # Partial draft data for the step in progress (JSON blob).
    # Cleared once the step is saved successfully.
    draft_data: Mapped[dict | None] = mapped_column(JSON, default=None)
    is_complete: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow
    )
