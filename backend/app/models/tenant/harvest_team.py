"""Step 5: Harvest teams — planning, estimates, traceability.

Each team is linked to a grower (where they pick) and optionally
to a labour supplier. Volume estimates and team size help with
planning and capacity forecasting.
"""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.database import TenantBase


class HarvestTeam(TenantBase):
    __tablename__ = "harvest_teams"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    team_leader: Mapped[str | None] = mapped_column(String(255))
    team_size: Mapped[int | None] = mapped_column(Integer)

    # Traceability links
    grower_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("growers.id")
    )
    supplier_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("suppliers.id")
    )

    # Planning & estimates
    estimated_volume_kg: Mapped[float | None] = mapped_column(Float)
    # Fruit types this team handles: ["citrus", "grapes"]
    fruit_types: Mapped[list | None] = mapped_column(JSON, default=list)
    # Assigned fields/blocks from the grower: ["Block A", "Block B"]
    assigned_fields: Mapped[list | None] = mapped_column(JSON, default=list)

    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
