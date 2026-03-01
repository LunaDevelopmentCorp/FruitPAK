"""GRN (Goods Received Note) intake service.

Handles the creation of a new Batch at packhouse intake, including:
  - Auto-generating a unique batch_code (GRN-YYYYMMDD-NNN)
  - Computing net weight from gross - tare
  - Recording the intake event in BatchHistory
  - Linking any existing advance payment for the grower
"""

from datetime import datetime

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.tenant.batch import Batch
from app.models.tenant.batch_history import BatchHistory
from app.models.tenant.grower import Grower
from app.models.tenant.grower_payment import GrowerPayment
from app.models.tenant.harvest_team import HarvestTeam
from app.models.tenant.harvest_team_payment import HarvestTeamPayment
from app.models.tenant.packhouse import Packhouse
from app.schemas.batch import GRNRequest
from app.utils.numbering import generate_code


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
    batch_code = await generate_code(db, "batch")
    net_weight = (
        body.gross_weight_kg - body.tare_weight_kg
        if body.gross_weight_kg is not None
        else None
    )

    # Auto-populate harvest rate from team's default rate_per_kg
    harvest_rate = None
    if body.harvest_team_id:
        team = (
            await db.execute(
                select(HarvestTeam).where(HarvestTeam.id == body.harvest_team_id)
            )
        ).scalar_one_or_none()
        if team and team.rate_per_kg is not None:
            harvest_rate = team.rate_per_kg

    batch = Batch(
        batch_code=batch_code,
        grower_id=body.grower_id,
        harvest_team_id=body.harvest_team_id,
        payment_routing="grower",  # default — financial user changes via batch detail
        harvest_rate_per_kg=harvest_rate,
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
        field_code=body.field_code,
        field_name=body.field_name,
        vehicle_reg=body.vehicle_reg,
        driver_name=body.driver_name,
        notes=body.delivery_notes,
        received_by=user_id,
    )
    db.add(batch)
    await db.flush()  # populate batch.id
    batch.grower = grower  # ensure relationship is available for serialization

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

    if False:  # advance linking is now grower-only at intake (routing set later)
        # Link to harvest team advance payment
        team_advance = (
            await db.execute(
                select(HarvestTeamPayment).where(
                    HarvestTeamPayment.harvest_team_id == body.harvest_team_id,
                    HarvestTeamPayment.status == "pending",
                    HarvestTeamPayment.is_deleted == False,  # noqa: E712
                )
                .order_by(HarvestTeamPayment.created_at.desc())
                .limit(1)
            )
        ).scalar_one_or_none()

        if team_advance:
            existing_ids = team_advance.batch_ids or []
            team_advance.batch_ids = existing_ids + [batch.id]
            if net_weight is not None:
                team_advance.total_kg = (team_advance.total_kg or 0) + net_weight
            advance_linked = True
            advance_ref = team_advance.payment_ref
    else:
        # Link to grower advance payment
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
