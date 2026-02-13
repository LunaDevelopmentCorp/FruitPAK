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
from sqlalchemy import delete, select
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
from app.models.tenant.product_config import BoxSize, PackSpec, PalletType, ProductConfig
from app.models.tenant.supplier import Supplier
from app.models.tenant.transport_config import TransportConfig
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
        # Upsert by name — can't DELETE growers referenced by batches
        result = await db.execute(select(Grower))
        existing = {g.name: g for g in result.scalars().all()}

        new_names: set[str] = set()
        for g in body.growers:
            data = g.model_dump()
            if data.get("fields"):
                data["fields"] = [
                    f if isinstance(f, dict) else f.model_dump()
                    for f in data["fields"]
                ]
            new_names.add(g.name)
            if g.name in existing:
                grower = existing[g.name]
                for k, v in data.items():
                    if k != "name":
                        setattr(grower, k, v)
            else:
                db.add(Grower(**data))
        await db.flush()

        # Remove growers no longer in the list (only if unreferenced)
        for name, grower in existing.items():
            if name not in new_names:
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

    if body.products:
        await db.execute(delete(ProductConfig))
        await db.flush()
        for p in body.products:
            db.add(ProductConfig(**p.model_dump()))
        await db.flush()

    if body.pack_specs:
        await db.execute(delete(PackSpec))
        await db.flush()
        for ps in body.pack_specs:
            db.add(PackSpec(**ps.model_dump()))
        await db.flush()

    if body.box_sizes:
        await db.execute(delete(BoxSize))
        await db.flush()
        for bs in body.box_sizes:
            db.add(BoxSize(**bs.model_dump()))
        await db.flush()

    if body.pallet_types:
        await db.execute(delete(PalletType))
        await db.flush()
        for pt in body.pallet_types:
            db.add(PalletType(**pt.model_dump()))
        await db.flush()

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
