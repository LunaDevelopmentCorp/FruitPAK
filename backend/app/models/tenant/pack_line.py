"""Step 2 detail: Pack lines and stations within a packhouse.

Packhouse → PackLine → (stations are a JSON array on PackLine for now).
"""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, JSON, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import TenantBase


class PackLine(TenantBase):
    __tablename__ = "pack_lines"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    packhouse_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("packhouses.id"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    line_number: Mapped[int] = mapped_column(Integer, nullable=False)
    # Stations as JSON: [{"name": "Tipping", "position": 1}, {"name": "Grading", "position": 2}, ...]
    stations: Mapped[list | None] = mapped_column(JSON, default=list)
    # Custom units this line handles (e.g. ["4kg carton", "10kg box"])
    custom_units: Mapped[list | None] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
