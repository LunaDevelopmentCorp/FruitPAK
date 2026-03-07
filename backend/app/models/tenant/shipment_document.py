"""ShipmentDocument — files attached to a container for export documentation.

Tracks uploaded documents (BL, phyto certificates) and generated packing list
PDFs stored in S3, enabling one-click email dispatch to clients.
"""

import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import TenantBase


class ShipmentDocument(TenantBase):
    __tablename__ = "shipment_documents"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    container_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("containers.id"), nullable=False, index=True
    )

    # "packing_list_shipping" | "packing_list_traceability" | "bill_of_lading"
    # | "phyto_certificate" | "fumigation_certificate" | "other"
    doc_type: Mapped[str] = mapped_column(String(50), nullable=False)
    filename: Mapped[str] = mapped_column(String(500), nullable=False)
    s3_key: Mapped[str] = mapped_column(String(1000), nullable=False)
    file_size: Mapped[int] = mapped_column(Integer, default=0)
    mime_type: Mapped[str] = mapped_column(String(100), default="application/octet-stream")

    uploaded_by: Mapped[str | None] = mapped_column(String(36))
    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    # ── Relationships ────────────────────────────────────────
    container = relationship("Container")
