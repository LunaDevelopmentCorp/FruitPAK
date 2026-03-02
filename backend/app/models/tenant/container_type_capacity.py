"""ContainerTypeBoxCapacity — per-box-size capacity limits for container types.

Links a TransportConfig (container type definition) to a BoxSize with the
maximum number of boxes of that size the container can hold.  This follows
the same pattern as PalletTypeBoxCapacity.

Example:
    Reefer 20ft  ×  4 kg box  → max 5 280 boxes
    Reefer 20ft  ×  10 kg box → max 2 640 boxes
"""

import uuid

from sqlalchemy import ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import TenantBase


class ContainerTypeBoxCapacity(TenantBase):
    __tablename__ = "container_type_box_capacities"
    __table_args__ = (
        UniqueConstraint(
            "transport_config_id", "box_size_id",
            name="uq_container_cap_config_box",
        ),
    )

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    transport_config_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("transport_configs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    box_size_id: Mapped[str] = mapped_column(
        String(36),
        ForeignKey("box_sizes.id", ondelete="CASCADE"),
        nullable=False,
    )
    max_boxes: Mapped[int] = mapped_column(Integer, nullable=False)

    # Relationships
    transport_config = relationship("TransportConfig", back_populates="box_capacities")
    box_size = relationship("BoxSize", lazy="selectin")
