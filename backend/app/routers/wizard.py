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
from app.database import get_tenant_db
from app.models.public.user import User
from app.models.tenant.company_profile import CompanyProfile
from app.models.tenant.financial_config import FinancialConfig
from app.models.tenant.grower import Grower
from app.models.tenant.harvest_team import HarvestTeam
from app.models.tenant.pack_line import PackLine
from app.models.tenant.packhouse import Packhouse
from app.models.tenant.product_config import PackSpec, ProductConfig
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

    if complete and 1 not in state.completed_steps:
        state.completed_steps = state.completed_steps + [1]
    state.current_step = 2 if complete else 1
    state.draft_data = None if complete else data
    await db.flush()

    return WizardProgress(
        current_step=state.current_step,
        completed_steps=state.completed_steps,
        is_complete=state.is_complete,
        draft_data=state.draft_data,
    )


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
        # Replace existing packhouses + lines for idempotent saves
        await db.execute(delete(PackLine))
        await db.execute(delete(Packhouse))
        await db.flush()

        for ph in body.packhouses:
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

    if complete and 2 not in state.completed_steps:
        state.completed_steps = state.completed_steps + [2]
    state.current_step = 3 if complete else 2
    state.draft_data = None if complete else body.model_dump(exclude_unset=True)
    await db.flush()

    return WizardProgress(
        current_step=state.current_step,
        completed_steps=state.completed_steps,
        is_complete=state.is_complete,
        draft_data=state.draft_data,
    )


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

    if complete and 3 not in state.completed_steps:
        state.completed_steps = state.completed_steps + [3]
    state.current_step = 4 if complete else 3
    state.draft_data = None if complete else body.model_dump(exclude_unset=True)
    await db.flush()

    return WizardProgress(
        current_step=state.current_step,
        completed_steps=state.completed_steps,
        is_complete=state.is_complete,
        draft_data=state.draft_data,
    )


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
        await db.execute(delete(Grower))
        await db.flush()
        for g in body.growers:
            data = g.model_dump()
            # Convert nested FieldInput dicts
            if data.get("fields"):
                data["fields"] = [
                    f if isinstance(f, dict) else f.model_dump()
                    for f in data["fields"]
                ]
            db.add(Grower(**data))
        await db.flush()

    if complete and 4 not in state.completed_steps:
        state.completed_steps = state.completed_steps + [4]
    state.current_step = 5 if complete else 4
    state.draft_data = None if complete else body.model_dump(exclude_unset=True)
    await db.flush()

    return WizardProgress(
        current_step=state.current_step,
        completed_steps=state.completed_steps,
        is_complete=state.is_complete,
        draft_data=state.draft_data,
    )


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
        await db.execute(delete(HarvestTeam))
        await db.flush()
        for t in body.harvest_teams:
            db.add(HarvestTeam(**t.model_dump()))
        await db.flush()

    if complete and 5 not in state.completed_steps:
        state.completed_steps = state.completed_steps + [5]
    state.current_step = 6 if complete else 5
    state.draft_data = None if complete else body.model_dump(exclude_unset=True)
    await db.flush()

    return WizardProgress(
        current_step=state.current_step,
        completed_steps=state.completed_steps,
        is_complete=state.is_complete,
        draft_data=state.draft_data,
    )


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

    if complete and 6 not in state.completed_steps:
        state.completed_steps = state.completed_steps + [6]
    state.current_step = 7 if complete else 6
    state.draft_data = None if complete else body.model_dump(exclude_unset=True)
    await db.flush()

    return WizardProgress(
        current_step=state.current_step,
        completed_steps=state.completed_steps,
        is_complete=state.is_complete,
        draft_data=state.draft_data,
    )


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

    if complete and 7 not in state.completed_steps:
        state.completed_steps = state.completed_steps + [7]
    state.current_step = 8 if complete else 7
    state.draft_data = None if complete else body.model_dump(exclude_unset=True)
    await db.flush()

    return WizardProgress(
        current_step=state.current_step,
        completed_steps=state.completed_steps,
        is_complete=state.is_complete,
        draft_data=state.draft_data,
    )


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

    if complete and 8 not in state.completed_steps:
        state.completed_steps = state.completed_steps + [8]
    state.draft_data = None if complete else data
    await db.flush()

    return WizardProgress(
        current_step=state.current_step,
        completed_steps=state.completed_steps,
        is_complete=state.is_complete,
        draft_data=state.draft_data,
    )


# ── POST /api/wizard/complete ────────────────────────────────

@router.post("/complete", response_model=WizardProgress)
async def complete_wizard(
    db: AsyncSession = Depends(get_tenant_db),
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

    return WizardProgress(
        current_step=state.current_step,
        completed_steps=state.completed_steps,
        is_complete=True,
        draft_data=None,
    )
