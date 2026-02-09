"""Step 7: Transport & container standards.

Defines the container types, temperature requirements, and
transport configurations used by this enterprise.
"""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, Float, Integer, JSON, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import TenantBase


class TransportConfig(TenantBase):
    __tablename__ = "transport_configs"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    # "reefer_20ft", "reefer_40ft", "open_truck", "break_bulk"
    container_type: Mapped[str] = mapped_column(String(50), nullable=False)
    # Temperature setpoint in °C
    temp_setpoint_c: Mapped[float | None] = mapped_column(Float)
    temp_min_c: Mapped[float | None] = mapped_column(Float)
    temp_max_c: Mapped[float | None] = mapped_column(Float)
    # Capacity
    pallet_capacity: Mapped[int | None] = mapped_column(Integer)
    max_weight_kg: Mapped[float | None] = mapped_column(Float)
    # Ventilation / atmosphere settings (JSON for flexibility)
    # e.g. {"ventilation_pct": 25, "co2_pct": 5, "o2_pct": 3}
    atmosphere_settings: Mapped[dict | None] = mapped_column(JSON, default=None)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
