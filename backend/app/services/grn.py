"""GRN (Goods Received Note) intake service.

Handles the creation of a new Batch at packhouse intake, including:
  - Auto-generating a unique batch_code (GRN-YYYYMMDD-NNN)
  - Computing net weight from gross - tare
  - Recording the intake event in BatchHistory
  - Linking any existing advance payment for the grower
"""

from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.tenant.batch import Batch
from app.models.tenant.batch_history import BatchHistory
from app.models.tenant.grower import Grower
from app.models.tenant.grower_payment import GrowerPayment
from app.models.tenant.packhouse import Packhouse
from app.schemas.batch import GRNRequest


async def _generate_batch_code(db: AsyncSession) -> str:
    """Generate GRN-YYYYMMDD-NNN where NNN resets daily."""
    today = datetime.utcnow().strftime("%Y%m%d")
    prefix = f"GRN-{today}-"

    result = await db.execute(
        select(func.count(Batch.id)).where(
            Batch.batch_code.like(f"{prefix}%")
        )
    )
    count = result.scalar() or 0
    return f"{prefix}{count + 1:03d}"


async def create_grn(
    body: GRNRequest,
    user_id: str,
    db: AsyncSession,
) -> dict:
    """Create a new batch from a GRN intake and return batch + metadata.

    Returns:
        {
            "batch": Batch,
            "advance_payment_linked": bool,
            "advance_payment_ref": str | None,
        }

    Raises:
        ValueError with a message suitable for HTTP 404 / 422.
    """
    # ── Validate grower exists ────────────────────────────────
    grower = (
        await db.execute(
            select(Grower).where(Grower.id == body.grower_id, Grower.is_active == True)  # noqa: E712
        )
    ).scalar_one_or_none()
    if not grower:
        raise ValueError(f"Grower not found or inactive: {body.grower_id}")

    # ── Validate packhouse exists ─────────────────────────────
    packhouse = (
        await db.execute(
            select(Packhouse).where(Packhouse.id == body.packhouse_id)
        )
    ).scalar_one_or_none()
    if not packhouse:
        raise ValueError(f"Packhouse not found: {body.packhouse_id}")

    # ── Create Batch ──────────────────────────────────────────
    batch_code = await _generate_batch_code(db)
    net_weight = (
        body.gross_weight_kg - body.tare_weight_kg
        if body.gross_weight_kg is not None
        else None
    )

    batch = Batch(
        batch_code=batch_code,
        grower_id=body.grower_id,
        harvest_team_id=body.harvest_team_id,
        packhouse_id=body.packhouse_id,
        fruit_type=body.fruit_type,
        variety=body.variety,
        harvest_date=body.harvest_date,
        gross_weight_kg=body.gross_weight_kg,
        tare_weight_kg=body.tare_weight_kg,
        net_weight_kg=net_weight,
        arrival_temp_c=body.arrival_temp_c,
        brix_reading=body.brix_reading,
        quality_assessment=body.quality_assessment,
        status="received",
        bin_count=body.bin_count,
        bin_type=body.bin_type,
        notes=body.delivery_notes,
        received_by=user_id,
    )
    db.add(batch)
    await db.flush()  # populate batch.id

    # ── Record intake event in BatchHistory ───────────────────
    history = BatchHistory(
        batch_id=batch.id,
        event_type="intake",
        event_subtype="grn_received",
        packhouse_id=body.packhouse_id,
        location_detail="Intake area",
        event_data={
            "gross_weight_kg": body.gross_weight_kg,
            "tare_weight_kg": body.tare_weight_kg,
            "net_weight_kg": net_weight,
            "bin_count": body.bin_count,
            "quality_grade": body.quality_grade,
            "arrival_temp_c": body.arrival_temp_c,
        },
        notes=body.delivery_notes,
        recorded_by=user_id,
    )
    db.add(history)

    # ── Link advance payment if one exists ────────────────────
    advance_linked = False
    advance_ref: str | None = None

    advance = (
        await db.execute(
            select(GrowerPayment).where(
                GrowerPayment.grower_id == body.grower_id,
                GrowerPayment.status == "pending",
                GrowerPayment.is_deleted == False,  # noqa: E712
            )
            .order_by(GrowerPayment.created_at.desc())
            .limit(1)
        )
    ).scalar_one_or_none()

    if advance:
        # Append this batch to the payment's batch_ids
        existing_ids = advance.batch_ids or []
        advance.batch_ids = existing_ids + [batch.id]
        if net_weight is not None:
            advance.total_kg = (advance.total_kg or 0) + net_weight
        advance_linked = True
        advance_ref = advance.payment_ref

    await db.flush()

    return {
        "batch": batch,
        "advance_payment_linked": advance_linked,
        "advance_payment_ref": advance_ref,
    }
