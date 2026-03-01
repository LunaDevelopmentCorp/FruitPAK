"""Onboarding wizard — 8-step progressive setup with save/resume.

Endpoints:
  GET  /api/wizard/         → current progress + draft data
  PATCH /api/wizard/{step}  → save partial or complete data for a step
  POST  /api/wizard/complete → finalize the wizard

Design:
  - Each step PATCHes data into real tenant tables (not a staging area).
  - WizardState tracks which steps are complete + holds draft JSON.
  - Steps have prerequisites (e.g. growers before harvest teams).
  - Step 8 (financials) is optional — wizard can complete without it.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import delete, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import get_current_user, require_permission
from app.database import get_db, get_tenant_db
from app.models.public.enterprise import Enterprise
from app.models.public.user import User
from app.models.tenant.batch import Batch
from app.models.tenant.company_profile import CompanyProfile
from app.models.tenant.financial_config import FinancialConfig
from app.models.tenant.grower import Grower
from app.models.tenant.harvest_team import HarvestTeam
from app.models.tenant.pack_line import PackLine
from app.models.tenant.packhouse import Packhouse
from app.models.tenant.lot import Lot
from app.models.tenant.packaging_stock import PackagingStock
from app.models.tenant.product_config import BinType, BoxSize, PackSpec, PalletType, PalletTypeBoxCapacity, ProductConfig
from app.models.tenant.tenant_config import TenantConfig
from app.models.tenant.supplier import Supplier
from app.models.tenant.shipping_agent import ShippingAgent
from app.models.tenant.shipping_line import ShippingLine
from app.models.tenant.transport_config import TransportConfig
from app.models.tenant.transporter import Transporter
from app.models.tenant.wizard_state import WizardState
from app.schemas.wizard import (
    Step1Complete,
    Step1Data,
    Step2Complete,
    Step2Data,
    Step3Data,
    Step4Complete,
    Step4Data,
    Step5Data,
    Step6Complete,
    Step6Data,
    Step7Data,
    Step8Data,
    WizardProgress,
)
from app.utils.cache import invalidate_cache

router = APIRouter()

TOTAL_STEPS = 8
REQUIRED_STEPS = {1, 2, 3, 4, 5, 6, 7}  # step 8 is optional

# Step prerequisites: {step: [must_be_completed_first]}
STEP_PREREQUISITES: dict[int, list[int]] = {
    1: [],
    2: [1],
    3: [1],
    4: [1],
    5: [4],        # harvest teams need growers
    6: [2, 4],     # packing config needs packhouses + growers
    7: [2],        # transport needs packhouse context
    8: [2],        # financials need packhouse context
}


# ── Helpers ──────────────────────────────────────────────────

async def _get_or_create_state(db: AsyncSession) -> WizardState:
    result = await db.execute(select(WizardState).limit(1))
    state = result.scalar_one_or_none()
    if not state:
        state = WizardState(completed_steps=[])
        db.add(state)
        await db.flush()
    return state


def _make_progress(state: WizardState) -> WizardProgress:
    """Build a WizardProgress response from current state."""
    return WizardProgress(
        current_step=state.current_step,
        completed_steps=state.completed_steps,
        is_complete=state.is_complete,
        draft_data=state.draft_data,
        completed_data=state.completed_data or {},
    )


async def _finish_step(
    db: AsyncSession,
    state: WizardState,
    step: int,
    data: dict,
    complete: bool,
    next_step: int,
) -> WizardProgress:
    """Mark step complete (or save draft) and return progress."""
    if complete:
        if step not in state.completed_steps:
            state.completed_steps = state.completed_steps + [step]
        # Store completed data so forms can reload it
        cd = dict(state.completed_data or {})
        cd[str(step)] = data
        state.completed_data = cd
        state.current_step = next_step
        state.draft_data = None
    else:
        state.current_step = step
        state.draft_data = data
    await db.flush()
    return _make_progress(state)


def _check_prerequisites(step: int, completed: list[int]) -> None:
    prereqs = STEP_PREREQUISITES.get(step, [])
    missing = [s for s in prereqs if s not in completed]
    if missing:
        names = {
            1: "Company basics",
            2: "Packhouse setup",
            3: "Suppliers",
            4: "Growers",
            5: "Harvest teams",
            6: "Product config",
            7: "Transport",
            8: "Financials",
        }
        missing_names = [f"Step {s} ({names.get(s, '?')})" for s in missing]
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Complete these first: {', '.join(missing_names)}",
        )


# ── GET /api/wizard/ ─────────────────────────────────────────

@router.get("/", response_model=WizardProgress)
async def get_progress(
    db: AsyncSession = Depends(get_tenant_db),
    user: User = Depends(require_permission("enterprise.manage")),
):
    state = await _get_or_create_state(db)
    return WizardProgress(
        current_step=state.current_step,
        completed_steps=state.completed_steps,
        is_complete=state.is_complete,
        draft_data=state.draft_data,
        completed_data=state.completed_data or {},
    )


# ── PATCH /api/wizard/{step} ─────────────────────────────────

@router.patch("/{step}")
async def save_step(
    step: int,
    db: AsyncSession = Depends(get_tenant_db),
    user: User = Depends(require_permission("enterprise.manage")),
    # Body is parsed per-step below
    **kwargs,
):
    # This is a dispatcher — we need the raw body.
    # FastAPI doesn't support dynamic body types on a single endpoint,
    # so we use per-step endpoints below instead.
    raise HTTPException(status_code=404, detail="Use /api/wizard/step/{n}")


# ── Per-step PATCH endpoints ─────────────────────────────────

@router.patch("/step/1", response_model=WizardProgress)
async def save_step_1(
    body: Step1Data,
    complete: bool = False,
    db: AsyncSession = Depends(get_tenant_db),
    user: User = Depends(require_permission("enterprise.manage")),
):
    """Save company & exporter basics. Pass ?complete=true to mark done."""
    state = await _get_or_create_state(db)
    _check_prerequisites(1, state.completed_steps)

    if complete:
        Step1Complete(**body.model_dump())  # validate required fields

    # Upsert CompanyProfile
    result = await db.execute(select(CompanyProfile).limit(1))
    profile = result.scalar_one_or_none()
    data = body.model_dump(exclude_unset=True)
    if profile:
        for k, v in data.items():
            setattr(profile, k, v)
    else:
        profile = CompanyProfile(**data)
        db.add(profile)
    await db.flush()

    return await _finish_step(db, state, 1, data, complete, next_step=2)


@router.patch("/step/2", response_model=WizardProgress)
async def save_step_2(
    body: Step2Data,
    complete: bool = False,
    db: AsyncSession = Depends(get_tenant_db),
    user: User = Depends(require_permission("enterprise.manage")),
):
    """Save packhouse setup (facilities, lines, stations)."""
    state = await _get_or_create_state(db)
    _check_prerequisites(2, state.completed_steps)

    if complete:
        Step2Complete(**body.model_dump())

    if body.packhouses:
        # Upsert by name — can't DELETE packhouses referenced by batches
        result = await db.execute(select(Packhouse))
        existing = {ph.name: ph for ph in result.scalars().all()}

        # Clear all pack lines (safe — no FK from batches)
        await db.execute(delete(PackLine))
        await db.flush()

        new_names: set[str] = set()
        for ph in body.packhouses:
            new_names.add(ph.name)
            if ph.name in existing:
                packhouse = existing[ph.name]
                packhouse.location = ph.location
                packhouse.capacity_tons_per_day = ph.capacity_tons_per_day
                packhouse.cold_rooms = ph.cold_rooms
            else:
                packhouse = Packhouse(
                    name=ph.name,
                    location=ph.location,
                    capacity_tons_per_day=ph.capacity_tons_per_day,
                    cold_rooms=ph.cold_rooms,
                )
                db.add(packhouse)
            await db.flush()

            if ph.pack_lines:
                for pl in ph.pack_lines:
                    line = PackLine(
                        packhouse_id=packhouse.id,
                        name=pl.name,
                        line_number=pl.line_number,
                        stations=[s.model_dump() if hasattr(s, "model_dump") else s for s in (pl.stations or [])],
                        custom_units=pl.custom_units,
                    )
                    db.add(line)
        await db.flush()

        # Remove packhouses no longer in the list (only if unreferenced)
        for name, ph in existing.items():
            if name not in new_names:
                ref = await db.execute(
                    select(Batch.id).where(Batch.packhouse_id == ph.id).limit(1)
                )
                if not ref.scalar_one_or_none():
                    await db.delete(ph)
        await db.flush()

    return await _finish_step(db, state, 2, body.model_dump(exclude_unset=True), complete, next_step=3)


@router.patch("/step/3", response_model=WizardProgress)
async def save_step_3(
    body: Step3Data,
    complete: bool = False,
    db: AsyncSession = Depends(get_tenant_db),
    user: User = Depends(require_permission("enterprise.manage")),
):
    """Save suppliers (packaging, services, labour)."""
    state = await _get_or_create_state(db)
    _check_prerequisites(3, state.completed_steps)

    if body.suppliers:
        await db.execute(delete(Supplier))
        await db.flush()
        for s in body.suppliers:
            db.add(Supplier(**s.model_dump()))
        await db.flush()

    return await _finish_step(db, state, 3, body.model_dump(exclude_unset=True), complete, next_step=4)


@router.patch("/step/4", response_model=WizardProgress)
async def save_step_4(
    body: Step4Data,
    complete: bool = False,
    db: AsyncSession = Depends(get_tenant_db),
    user: User = Depends(require_permission("enterprise.manage")),
):
    """Save growers with fields, size, volume, certification."""
    state = await _get_or_create_state(db)
    _check_prerequisites(4, state.completed_steps)

    if complete:
        Step4Complete(**body.model_dump())

    if body.growers:
        # Upsert by name OR grower_code — can't DELETE growers referenced by batches
        result = await db.execute(select(Grower))
        all_existing = result.scalars().all()
        existing_by_name = {g.name: g for g in all_existing}
        existing_by_code = {g.grower_code: g for g in all_existing if g.grower_code}

        seen_ids: set[str] = set()
        for g in body.growers:
            data = g.model_dump()
            if data.get("fields"):
                data["fields"] = [
                    f if isinstance(f, dict) else f.model_dump()
                    for f in data["fields"]
                ]
            # Match by name first, then by grower_code (handles renames)
            grower = existing_by_name.get(g.name) or existing_by_code.get(data.get("grower_code"))
            if grower:
                seen_ids.add(grower.id)
                for k, v in data.items():
                    setattr(grower, k, v)
            else:
                new_grower = Grower(**data)
                db.add(new_grower)
        await db.flush()

        # Remove growers no longer in the list (only if unreferenced)
        for grower in all_existing:
            if grower.id not in seen_ids:
                ref = await db.execute(
                    select(Batch.id).where(Batch.grower_id == grower.id).limit(1)
                )
                if not ref.scalar_one_or_none():
                    await db.delete(grower)
        await db.flush()

    return await _finish_step(db, state, 4, body.model_dump(exclude_unset=True), complete, next_step=5)


@router.patch("/step/5", response_model=WizardProgress)
async def save_step_5(
    body: Step5Data,
    complete: bool = False,
    db: AsyncSession = Depends(get_tenant_db),
    user: User = Depends(require_permission("enterprise.manage")),
):
    """Save harvest teams (planning, estimates, traceability)."""
    state = await _get_or_create_state(db)
    _check_prerequisites(5, state.completed_steps)

    if body.harvest_teams:
        # Upsert by name — can't DELETE teams referenced by batches
        result = await db.execute(select(HarvestTeam))
        existing = {t.name: t for t in result.scalars().all()}

        new_names: set[str] = set()
        for t in body.harvest_teams:
            data = t.model_dump()
            new_names.add(t.name)
            if t.name in existing:
                team = existing[t.name]
                for k, v in data.items():
                    if k != "name":
                        setattr(team, k, v)
            else:
                db.add(HarvestTeam(**data))
        await db.flush()

        # Remove teams no longer in the list (only if unreferenced)
        for name, team in existing.items():
            if name not in new_names:
                ref = await db.execute(
                    select(Batch.id).where(Batch.harvest_team_id == team.id).limit(1)
                )
                if not ref.scalar_one_or_none():
                    await db.delete(team)
        await db.flush()

    return await _finish_step(db, state, 5, body.model_dump(exclude_unset=True), complete, next_step=6)


@router.patch("/step/6", response_model=WizardProgress)
async def save_step_6(
    body: Step6Data,
    complete: bool = False,
    db: AsyncSession = Depends(get_tenant_db),
    user: User = Depends(require_permission("enterprise.manage")),
):
    """Save product & packing configuration (grades, sizes, pack specs)."""
    state = await _get_or_create_state(db)
    _check_prerequisites(6, state.completed_steps)

    if complete:
        Step6Complete(**body.model_dump())

    # ── Products (upsert by fruit_type+variety, safe-delete unreferenced) ──
    if body.products:
        result = await db.execute(select(ProductConfig))
        existing = {}
        for pc in result.scalars().all():
            key = (pc.fruit_type, pc.variety or "")
            existing[key] = pc

        new_keys: set[tuple[str, str]] = set()
        for p in body.products:
            data = p.model_dump()
            key = (data["fruit_type"], data.get("variety") or "")
            new_keys.add(key)
            if key in existing:
                obj = existing[key]
                for k, v in data.items():
                    setattr(obj, k, v)
            else:
                db.add(ProductConfig(**data))
        await db.flush()

        for key, obj in existing.items():
            if key not in new_keys:
                ref = await db.execute(
                    select(Lot.id).where(Lot.product_config_id == obj.id).limit(1)
                )
                if not ref.scalar_one_or_none():
                    await db.delete(obj)
        await db.flush()

    # ── Pack specs (upsert by name, safe-delete unreferenced) ──
    if body.pack_specs:
        result = await db.execute(select(PackSpec))
        existing = {ps.name: ps for ps in result.scalars().all()}

        new_names: set[str] = set()
        for ps in body.pack_specs:
            data = ps.model_dump()
            new_names.add(ps.name)
            if ps.name in existing:
                obj = existing[ps.name]
                for k, v in data.items():
                    if k != "name":
                        setattr(obj, k, v)
            else:
                db.add(PackSpec(**data))
        await db.flush()

        for name, obj in existing.items():
            if name not in new_names:
                ref = await db.execute(
                    select(Lot.id).where(Lot.pack_spec_id == obj.id).limit(1)
                )
                if not ref.scalar_one_or_none():
                    await db.delete(obj)
        await db.flush()

    # ── Box sizes (upsert by name, safe-delete unreferenced) ──
    if body.box_sizes:
        # Clear box capacities first — they'll be rebuilt with pallet types
        await db.execute(delete(PalletTypeBoxCapacity))
        await db.flush()

        result = await db.execute(select(BoxSize))
        existing = {bs.name: bs for bs in result.scalars().all()}

        new_names = set()
        for bs in body.box_sizes:
            data = bs.model_dump()
            new_names.add(bs.name)
            if bs.name in existing:
                obj = existing[bs.name]
                for k, v in data.items():
                    if k != "name":
                        setattr(obj, k, v)
            else:
                db.add(BoxSize(**data))
        await db.flush()

        for name, obj in existing.items():
            if name not in new_names:
                ref_lot = await db.execute(
                    select(Lot.id).where(Lot.box_size_id == obj.id).limit(1)
                )
                if ref_lot.scalar_one_or_none():
                    continue  # lots reference this box size — keep it
                # Clear packaging_stock references so the old entry can be deleted
                await db.execute(
                    update(PackagingStock)
                    .where(PackagingStock.box_size_id == obj.id)
                    .values(box_size_id=None)
                )
                await db.delete(obj)
        await db.flush()

    # ── Pallet types (upsert by name, safe-delete unreferenced) ──
    if body.pallet_types:
        # Clear box capacities (will be rebuilt below)
        if not body.box_sizes:  # already cleared above if box_sizes was processed
            await db.execute(delete(PalletTypeBoxCapacity))
            await db.flush()

        result = await db.execute(select(PalletType))
        existing = {pt.name: pt for pt in result.scalars().all()}

        # Build box_size name→id map for capacity resolution
        bs_result = await db.execute(select(BoxSize))
        bs_name_map = {bs.name: bs.id for bs in bs_result.scalars().all()}

        new_names = set()
        for pt in body.pallet_types:
            data = pt.model_dump(exclude={"box_capacities"})
            new_names.add(pt.name)
            if pt.name in existing:
                pallet_type = existing[pt.name]
                for k, v in data.items():
                    if k != "name":
                        setattr(pallet_type, k, v)
            else:
                pallet_type = PalletType(**data)
                db.add(pallet_type)
            await db.flush()

            # Rebuild box capacities for this pallet type
            if pt.box_capacities:
                for bc in pt.box_capacities:
                    box_size_id = bs_name_map.get(bc.box_size_name)
                    if box_size_id:
                        db.add(PalletTypeBoxCapacity(
                            pallet_type_id=pallet_type.id,
                            box_size_id=box_size_id,
                            capacity=bc.capacity,
                        ))
                await db.flush()

        for name, obj in existing.items():
            if name not in new_names:
                ref = await db.execute(
                    select(PackagingStock.id).where(PackagingStock.pallet_type_id == obj.id).limit(1)
                )
                if not ref.scalar_one_or_none():
                    await db.delete(obj)
        await db.flush()

    # ── Bin types (no FK references, safe to delete-all) ──
    if body.bin_types:
        await db.execute(delete(BinType))
        await db.flush()
        for bt in body.bin_types:
            db.add(BinType(**bt.model_dump()))
        await db.flush()

    # ── Pallet rules → tenant_config ──
    if body.pallet_rules:
        import uuid as _uuid
        rules_data = body.pallet_rules.model_dump()
        result = await db.execute(
            select(TenantConfig).where(TenantConfig.key == "mixed_pallet_rules")
        )
        existing_cfg = result.scalar_one_or_none()
        if existing_cfg:
            existing_cfg.value = rules_data
        else:
            db.add(TenantConfig(
                id=str(_uuid.uuid4()),
                key="mixed_pallet_rules",
                value=rules_data,
            ))
        await db.flush()

    # Invalidate cached config endpoints (box sizes, bin types, fruit types, pallet types)
    await invalidate_cache("config:*")

    return await _finish_step(db, state, 6, body.model_dump(exclude_unset=True), complete, next_step=7)


@router.patch("/step/7", response_model=WizardProgress)
async def save_step_7(
    body: Step7Data,
    complete: bool = False,
    db: AsyncSession = Depends(get_tenant_db),
    user: User = Depends(require_permission("enterprise.manage")),
):
    """Save transport & container standards."""
    state = await _get_or_create_state(db)
    _check_prerequisites(7, state.completed_steps)

    if body.transport_configs:
        await db.execute(delete(TransportConfig))
        await db.flush()
        for tc in body.transport_configs:
            db.add(TransportConfig(**tc.model_dump()))
        await db.flush()

    if body.shipping_lines:
        await db.execute(delete(ShippingLine))
        await db.flush()
        for sl in body.shipping_lines:
            db.add(ShippingLine(**sl.model_dump()))
        await db.flush()

    if body.transporters:
        await db.execute(delete(Transporter))
        await db.flush()
        for tr in body.transporters:
            db.add(Transporter(**tr.model_dump()))
        await db.flush()

    if body.shipping_agents:
        await db.execute(delete(ShippingAgent))
        await db.flush()
        for sa in body.shipping_agents:
            db.add(ShippingAgent(**sa.model_dump()))
        await db.flush()

    return await _finish_step(db, state, 7, body.model_dump(exclude_unset=True), complete, next_step=8)


@router.patch("/step/8", response_model=WizardProgress)
async def save_step_8(
    body: Step8Data,
    complete: bool = False,
    db: AsyncSession = Depends(get_tenant_db),
    user: User = Depends(require_permission("financials.write")),
):
    """Save financial basics (optional step, restricted to financials perm)."""
    state = await _get_or_create_state(db)
    _check_prerequisites(8, state.completed_steps)

    data = body.model_dump(exclude_unset=True)
    if data:
        result = await db.execute(select(FinancialConfig).limit(1))
        config = result.scalar_one_or_none()
        if config:
            for k, v in data.items():
                setattr(config, k, v)
        else:
            config = FinancialConfig(**data)
            db.add(config)
        await db.flush()
        await invalidate_cache("config:*")

    return await _finish_step(db, state, 8, data, complete, next_step=8)


# ── POST /api/wizard/complete ────────────────────────────────

@router.post("/complete", response_model=WizardProgress)
async def complete_wizard(
    db: AsyncSession = Depends(get_tenant_db),
    public_db: AsyncSession = Depends(get_db),
    user: User = Depends(require_permission("enterprise.manage")),
):
    """Finalize the wizard. All required steps (1-7) must be completed."""
    state = await _get_or_create_state(db)

    missing = REQUIRED_STEPS - set(state.completed_steps)
    if missing:
        names = {
            1: "Company basics", 2: "Packhouse setup", 3: "Suppliers",
            4: "Growers", 5: "Harvest teams", 6: "Product config",
            7: "Transport",
        }
        detail = [f"Step {s}: {names.get(s, '?')}" for s in sorted(missing)]
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Incomplete steps: {', '.join(detail)}",
        )

    state.is_complete = True
    state.draft_data = None
    await db.flush()

    # Mark the enterprise as onboarded in the public schema
    result = await public_db.execute(
        select(Enterprise).where(Enterprise.id == user.enterprise_id)
    )
    enterprise = result.scalar_one_or_none()
    if enterprise:
        enterprise.is_onboarded = True
        await public_db.flush()

    return _make_progress(state)
