"""Config router — enterprise configuration endpoints.

Endpoints:
    GET  /api/config/bin-types                              List bin types
    GET  /api/config/product-configs                        List product configs (fruit/variety/grades)
    GET  /api/config/pallet-type-capacities/{pallet_type_id}  Box capacities for a pallet type
    GET  /api/config/fruit-types                            Aggregated fruit type → varieties/grades/sizes
    GET  /api/config/box-sizes                              Box sizes with specification fields
    GET  /api/config/financial-summary                      Base currency + export currencies
    GET  /api/config/tenant-settings                        Get all tenant config settings
    PUT  /api/config/tenant-settings                        Update tenant config settings
    GET  /api/config/transport-configs                      List transport configs with box capacities
    GET  /api/config/transport-configs/{id}                 Single transport config with capacities
    PATCH /api/config/transport-configs/{id}                Update transport config fields
    PUT  /api/config/transport-configs/{id}/box-capacities  Replace box capacity matrix
"""

import uuid
from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth.deps import require_onboarded, require_permission
from app.database import get_tenant_db
from app.models.public.user import User
from app.utils.cache import cached, invalidate_cache
from app.models.tenant.container_type_capacity import ContainerTypeBoxCapacity
from app.models.tenant.financial_config import FinancialConfig
from app.models.tenant.product_config import BinType, BoxSize, PalletType, PalletTypeBoxCapacity, ProductConfig
from app.models.tenant.tenant_config import TenantConfig
from app.models.tenant.transport_config import TransportConfig
from app.schemas.config import (
    BinTypeOut,
    BoxCapacityOut,
    BoxSizeSpecOut,
    FinancialSummaryOut,
    FruitTypeConfig,
    PalletTypeCapacityOut,
    ProductConfigOut,
    TenantSettingsUpdate,
)
from app.schemas.container import (
    BoxCapacityInput,
    BoxCapacityOut as ContainerBoxCapacityOut,
    TransportConfigOut,
    TransportConfigUpdate,
)

router = APIRouter()


@router.get("/bin-types", response_model=list[BinTypeOut])
@cached(ttl=600, prefix="config")
async def list_bin_types(
    db: AsyncSession = Depends(get_tenant_db),
    _user: User = Depends(require_onboarded),
):
    """List all active bin types for this enterprise."""
    result = await db.execute(
        select(BinType).where(BinType.is_active == True).order_by(BinType.name)  # noqa: E712
    )
    return [BinTypeOut.model_validate(bt) for bt in result.scalars().all()]


@router.get("/product-configs", response_model=list[ProductConfigOut])
@cached(ttl=600, prefix="config")
async def list_product_configs(
    db: AsyncSession = Depends(get_tenant_db),
    _user: User = Depends(require_onboarded),
):
    """List all product configs (fruit type + variety + grades + sizes)."""
    result = await db.execute(select(ProductConfig).order_by(ProductConfig.fruit_type))
    return [ProductConfigOut.model_validate(pc) for pc in result.scalars().all()]


@router.get(
    "/pallet-type-capacities/{pallet_type_id}",
    response_model=PalletTypeCapacityOut,
)
async def get_pallet_type_capacities(
    pallet_type_id: str,
    db: AsyncSession = Depends(get_tenant_db),
    _user: User = Depends(require_onboarded),
):
    """Get box-size-specific capacities for a pallet type."""
    result = await db.execute(
        select(PalletType)
        .where(PalletType.id == pallet_type_id)
        .options(selectinload(PalletType.box_capacities).selectinload(PalletTypeBoxCapacity.box_size))
    )
    pt = result.scalar_one_or_none()
    if not pt:
        raise HTTPException(status_code=404, detail="Pallet type not found")

    caps = []
    for bc in pt.box_capacities:
        caps.append(BoxCapacityOut(
            box_size_id=bc.box_size_id,
            box_size_name=bc.box_size.name if bc.box_size else None,
            capacity=bc.capacity,
        ))

    return PalletTypeCapacityOut(
        pallet_type_id=pt.id,
        pallet_type_name=pt.name,
        default_capacity=pt.capacity_boxes,
        box_capacities=caps,
    )


# ── Fruit Types (aggregated from product_configs) ────────────

@router.get("/fruit-types", response_model=list[FruitTypeConfig])
@cached(ttl=600, prefix="config")
async def list_fruit_types(
    db: AsyncSession = Depends(get_tenant_db),
    _user: User = Depends(require_onboarded),
):
    """Aggregated fruit types with varieties, grades, and sizes.

    Merges all product_configs by fruit_type so each fruit type shows
    the union of its varieties, grades, and sizes across all entries.
    """
    result = await db.execute(select(ProductConfig).order_by(ProductConfig.fruit_type))
    configs = result.scalars().all()

    # Aggregate by fruit type
    grouped: dict[str, dict] = defaultdict(lambda: {"varieties": set(), "grades": set(), "sizes": set()})
    for pc in configs:
        g = grouped[pc.fruit_type]
        if pc.variety:
            g["varieties"].add(pc.variety)
        g["grades"].update(pc.grades or [])
        g["sizes"].update(pc.sizes or [])

    return [
        FruitTypeConfig(
            fruit_type=ft,
            varieties=sorted(data["varieties"]),
            grades=sorted(data["grades"]),
            sizes=sorted(data["sizes"]),
        )
        for ft, data in sorted(grouped.items())
    ]


# ── Box Sizes with specs ─────────────────────────────────────

@router.get("/box-sizes", response_model=list[BoxSizeSpecOut])
@cached(ttl=600, prefix="config")
async def list_box_sizes(
    db: AsyncSession = Depends(get_tenant_db),
    _user: User = Depends(require_onboarded),
):
    """List all box sizes with specification fields."""
    result = await db.execute(select(BoxSize).order_by(BoxSize.name))
    return [BoxSizeSpecOut.model_validate(bs) for bs in result.scalars().all()]


# ── Financial Summary ────────────────────────────────────────

@router.get("/financial-summary", response_model=FinancialSummaryOut)
@cached(ttl=600, prefix="config")
async def get_financial_summary(
    db: AsyncSession = Depends(get_tenant_db),
    _user: User = Depends(require_onboarded),
):
    """Return base currency and export currencies from financial config."""
    result = await db.execute(select(FinancialConfig).limit(1))
    config = result.scalar_one_or_none()
    if not config:
        return FinancialSummaryOut(base_currency="ZAR", export_currencies=[])
    return FinancialSummaryOut(
        base_currency=config.base_currency,
        export_currencies=config.export_currencies or [],
    )


# ── Tenant Settings ──────────────────────────────────────────

@router.get("/tenant-settings")
async def get_tenant_settings(
    db: AsyncSession = Depends(get_tenant_db),
    _user: User = Depends(require_onboarded),
):
    """Get all tenant configuration settings as a key-value dict."""
    result = await db.execute(select(TenantConfig))
    configs = result.scalars().all()
    return {c.key: c.value for c in configs}


@router.put("/tenant-settings")
async def update_tenant_settings(
    body: TenantSettingsUpdate,
    db: AsyncSession = Depends(get_tenant_db),
    _user: User = Depends(require_permission("enterprise.manage")),
):
    """Upsert tenant configuration settings."""
    for key, value in body.settings.items():
        result = await db.execute(
            select(TenantConfig).where(TenantConfig.key == key)
        )
        existing = result.scalar_one_or_none()
        if existing:
            existing.value = value
        else:
            db.add(TenantConfig(id=str(uuid.uuid4()), key=key, value=value))

    await db.flush()

    # Return updated settings
    result = await db.execute(select(TenantConfig))
    configs = result.scalars().all()
    return {c.key: c.value for c in configs}


# ── Transport Configs ─────────────────────────────────────────


def _transport_config_to_out(tc: TransportConfig) -> TransportConfigOut:
    """Convert a TransportConfig ORM instance to the output schema."""
    caps = []
    for bc in tc.box_capacities:
        caps.append(ContainerBoxCapacityOut(
            box_size_id=bc.box_size_id,
            box_size_name=bc.box_size.name if bc.box_size else None,
            max_boxes=bc.max_boxes,
        ))
    return TransportConfigOut(
        id=tc.id,
        name=tc.name,
        container_type=tc.container_type,
        temp_setpoint_c=tc.temp_setpoint_c,
        temp_min_c=tc.temp_min_c,
        temp_max_c=tc.temp_max_c,
        pallet_capacity=tc.pallet_capacity,
        max_weight_kg=tc.max_weight_kg,
        box_capacities=caps,
    )


@router.get("/transport-configs", response_model=list[TransportConfigOut])
@cached(ttl=600, prefix="config")
async def list_transport_configs(
    db: AsyncSession = Depends(get_tenant_db),
    _user: User = Depends(require_onboarded),
):
    """List all transport configs with box capacities."""
    result = await db.execute(
        select(TransportConfig)
        .options(
            selectinload(TransportConfig.box_capacities)
            .selectinload(ContainerTypeBoxCapacity.box_size)
        )
        .order_by(TransportConfig.name)
    )
    return [_transport_config_to_out(tc) for tc in result.scalars().all()]


@router.get("/transport-configs/{config_id}", response_model=TransportConfigOut)
async def get_transport_config(
    config_id: str,
    db: AsyncSession = Depends(get_tenant_db),
    _user: User = Depends(require_onboarded),
):
    """Get a single transport config with box capacities."""
    result = await db.execute(
        select(TransportConfig)
        .where(TransportConfig.id == config_id)
        .options(
            selectinload(TransportConfig.box_capacities)
            .selectinload(ContainerTypeBoxCapacity.box_size)
        )
    )
    tc = result.scalar_one_or_none()
    if not tc:
        raise HTTPException(status_code=404, detail="Transport config not found")
    return _transport_config_to_out(tc)


@router.patch("/transport-configs/{config_id}", response_model=TransportConfigOut)
async def update_transport_config(
    config_id: str,
    body: TransportConfigUpdate,
    db: AsyncSession = Depends(get_tenant_db),
    _user: User = Depends(require_permission("config.write")),
):
    """Update fields on a transport config."""
    result = await db.execute(
        select(TransportConfig)
        .where(TransportConfig.id == config_id)
        .options(
            selectinload(TransportConfig.box_capacities)
            .selectinload(ContainerTypeBoxCapacity.box_size)
        )
    )
    tc = result.scalar_one_or_none()
    if not tc:
        raise HTTPException(status_code=404, detail="Transport config not found")

    updates = body.model_dump(exclude_unset=True)
    for key, value in updates.items():
        setattr(tc, key, value)

    await db.flush()
    await db.refresh(tc)
    await invalidate_cache("config")
    return _transport_config_to_out(tc)


@router.put(
    "/transport-configs/{config_id}/box-capacities",
    response_model=TransportConfigOut,
)
async def replace_box_capacities(
    config_id: str,
    body: list[BoxCapacityInput],
    db: AsyncSession = Depends(get_tenant_db),
    _user: User = Depends(require_permission("config.write")),
):
    """Replace the box capacity matrix for a transport config."""
    result = await db.execute(
        select(TransportConfig)
        .where(TransportConfig.id == config_id)
        .options(
            selectinload(TransportConfig.box_capacities)
            .selectinload(ContainerTypeBoxCapacity.box_size)
        )
    )
    tc = result.scalar_one_or_none()
    if not tc:
        raise HTTPException(status_code=404, detail="Transport config not found")

    # Delete existing capacities
    for cap in list(tc.box_capacities):
        await db.delete(cap)
    await db.flush()

    # Create new capacities
    for item in body:
        db.add(ContainerTypeBoxCapacity(
            id=str(uuid.uuid4()),
            transport_config_id=tc.id,
            box_size_id=item.box_size_id,
            max_boxes=item.max_boxes,
        ))

    await db.flush()
    await db.refresh(tc)
    await invalidate_cache("config")
    return _transport_config_to_out(tc)
