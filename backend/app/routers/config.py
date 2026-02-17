"""Config router — enterprise configuration endpoints.

Endpoints:
    GET  /api/config/bin-types          List bin types
    GET  /api/config/product-configs    List product configs (fruit/variety/grades)
    GET  /api/config/pallet-type-capacities/{pallet_type_id}  Box capacities for a pallet type
"""

from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth.deps import require_onboarded
from app.database import get_tenant_db
from app.models.public.user import User
from app.models.tenant.product_config import BinType, PalletType, PalletTypeBoxCapacity, ProductConfig
from app.schemas.config import BinTypeOut, PalletTypeCapacityOut, BoxCapacityOut, ProductConfigOut

router = APIRouter()


@router.get("/bin-types", response_model=list[BinTypeOut])
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
        from fastapi import HTTPException
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
