"""Reports router — production, grower, packout, performance, and packing list reports.

Endpoints:
    GET  /api/reports/production              Production throughput report
    GET  /api/reports/grower-summary          Grower delivery summary
    GET  /api/reports/packout/{batch_id}      Packout breakdown per batch
    GET  /api/reports/performance             Daily performance metrics
    GET  /api/reports/packing-list/{id}       Packing list for a container
"""

import csv
import io
from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import case, func, select, cast, Date
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.auth.deps import require_onboarded
from app.database import get_tenant_db
from app.models.public.user import User
from app.models.tenant.batch import Batch
from app.models.tenant.container import Container
from app.models.tenant.grower import Grower
from app.models.tenant.lot import Lot
from app.models.tenant.pallet import Pallet, PalletLot
from app.models.tenant.product_config import BoxSize

router = APIRouter()


# ── Helpers ──────────────────────────────────────────────────

def _csv_response(csv_text: str, filename: str) -> StreamingResponse:
    return StreamingResponse(
        iter([csv_text]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


def _rows_to_csv(headers: list[str], rows: list[list]) -> str:
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(headers)
    writer.writerows(rows)
    return buf.getvalue()


def _default_dates(
    date_from: date | None, date_to: date | None
) -> tuple[date, date]:
    if not date_to:
        date_to = date.today()
    if not date_from:
        date_from = date_to - timedelta(days=30)
    return date_from, date_to


# ── Schemas ──────────────────────────────────────────────────

class ProductionRow(BaseModel):
    batch_code: str
    grower_name: str
    grower_code: str | None
    fruit_type: str
    variety: str | None
    net_weight_kg: float | None
    lot_count: int
    carton_count: int
    waste_kg: float
    class2_lots: int
    class2_cartons: int
    returned_lots: int
    returned_kg: float
    status: str
    created_at: str


class GrowerSummaryRow(BaseModel):
    grower_name: str
    grower_code: str | None
    delivery_count: int
    total_gross_kg: float
    total_net_kg: float
    total_waste_kg: float
    waste_pct: float
    class2_cartons: int
    class2_kg: float
    returned_kg: float


class PackoutRow(BaseModel):
    lot_code: str
    grade: str | None
    size: str | None
    box_size_name: str | None
    carton_count: int
    weight_kg: float | None
    pack_date: str | None
    waste_kg: float
    quality_data: dict | None
    target_market: str | None


class PerformanceRow(BaseModel):
    date: str
    batches_received: int
    lots_packed: int
    pallets_built: int
    total_waste_kg: float
    total_cartons: int


class PackingListPalletLot(BaseModel):
    lot_code: str
    grower_name: str
    grower_code: str | None
    grower_ggn: str | None
    batch_code: str
    harvest_date: str | None
    carton_count: int
    weight_kg: float | None
    size: str | None


class PackingListPallet(BaseModel):
    pallet_number: str
    position: str | None
    fruit_type: str | None
    variety: str | None
    grade: str | None
    size: str | None
    box_size: str | None
    boxes: int
    net_weight_kg: float | None
    gross_weight_kg: float | None
    lots: list[PackingListPalletLot]


class PackingListResponse(BaseModel):
    container_number: str
    container_type: str
    shipping_container_number: str | None
    customer_name: str | None
    destination: str | None
    seal_number: str | None
    vessel_name: str | None
    voyage_number: str | None
    export_date: str | None
    transporter_name: str | None
    shipping_agent_name: str | None
    pallet_count: int
    total_cartons: int
    total_gross_weight_kg: float
    pallets: list[PackingListPallet]


# ── 1. Production Report ─────────────────────────────────────

@router.get("/production")
async def production_report(
    date_from: date | None = None,
    date_to: date | None = None,
    packhouse_id: str | None = None,
    format: str = Query("json", regex="^(json|csv)$"),
    db: AsyncSession = Depends(get_tenant_db),
    _user: User = Depends(require_onboarded),
):
    d_from, d_to = _default_dates(date_from, date_to)
    dt_from = datetime.combine(d_from, datetime.min.time())
    dt_to = datetime.combine(d_to, datetime.max.time())

    is_class2 = Lot.grade.regexp_match(r"(?i)^2$|class\s*2|industrial")

    # Subquery for lot aggregates per batch
    lot_agg = (
        select(
            Lot.batch_id,
            func.count(Lot.id).label("lot_count"),
            func.coalesce(func.sum(Lot.carton_count), 0).label("carton_count"),
            func.coalesce(func.sum(case((is_class2, 1), else_=0)), 0).label("class2_lots"),
            func.coalesce(func.sum(case((is_class2, Lot.carton_count), else_=0)), 0).label("class2_cartons"),
            func.coalesce(func.sum(case((Lot.status == "returned", 1), else_=0)), 0).label("returned_lots"),
            func.coalesce(func.sum(case((Lot.status == "returned", Lot.weight_kg), else_=0)), 0).label("returned_kg"),
        )
        .where(Lot.is_deleted == False)  # noqa: E712
        .group_by(Lot.batch_id)
        .subquery()
    )

    stmt = (
        select(
            Batch, Grower.name, Grower.grower_code,
            lot_agg.c.lot_count, lot_agg.c.carton_count,
            lot_agg.c.class2_lots, lot_agg.c.class2_cartons,
            lot_agg.c.returned_lots, lot_agg.c.returned_kg,
        )
        .join(Grower, Batch.grower_id == Grower.id)
        .outerjoin(lot_agg, Batch.id == lot_agg.c.batch_id)
        .where(Batch.is_deleted == False)  # noqa: E712
        .where(Batch.created_at >= dt_from, Batch.created_at <= dt_to)
        .order_by(Batch.created_at.desc())
    )
    if packhouse_id:
        stmt = stmt.where(Batch.packhouse_id == packhouse_id)

    result = await db.execute(stmt)
    rows = []
    for (batch, grower_name, grower_code, lot_count, carton_count,
         c2_lots, c2_cartons, ret_lots, ret_kg) in result.all():
        rows.append(ProductionRow(
            batch_code=batch.batch_code,
            grower_name=grower_name,
            grower_code=grower_code,
            fruit_type=batch.fruit_type,
            variety=batch.variety,
            net_weight_kg=batch.net_weight_kg,
            lot_count=lot_count or 0,
            carton_count=carton_count or 0,
            waste_kg=batch.waste_kg,
            class2_lots=c2_lots or 0,
            class2_cartons=c2_cartons or 0,
            returned_lots=ret_lots or 0,
            returned_kg=round(ret_kg or 0, 1),
            status=batch.status,
            created_at=batch.created_at.isoformat(),
        ))

    if format == "csv":
        headers = [
            "Batch Code", "Grower", "Grower Code", "Fruit Type", "Variety",
            "Net Weight (kg)", "Lots", "Cartons", "Waste (kg)",
            "Class 2 Lots", "Class 2 Cartons", "Returned Lots", "Returned (kg)",
            "Status", "Date",
        ]
        csv_rows = [[r.batch_code, r.grower_name, r.grower_code or "", r.fruit_type,
                      r.variety or "", r.net_weight_kg or "", r.lot_count, r.carton_count,
                      r.waste_kg, r.class2_lots, r.class2_cartons, r.returned_lots,
                      r.returned_kg, r.status, r.created_at] for r in rows]
        return _csv_response(
            _rows_to_csv(headers, csv_rows),
            f"production_report_{d_from}_{d_to}.csv",
        )

    return rows


# ── 2. Grower Summary ────────────────────────────────────────

@router.get("/grower-summary")
async def grower_summary_report(
    date_from: date | None = None,
    date_to: date | None = None,
    packhouse_id: str | None = None,
    format: str = Query("json", regex="^(json|csv)$"),
    db: AsyncSession = Depends(get_tenant_db),
    _user: User = Depends(require_onboarded),
):
    d_from, d_to = _default_dates(date_from, date_to)
    dt_from = datetime.combine(d_from, datetime.min.time())
    dt_to = datetime.combine(d_to, datetime.max.time())

    # Batch-level aggregates per grower
    batch_stmt = (
        select(
            Grower.id,
            Grower.name,
            Grower.grower_code,
            func.count(Batch.id).label("delivery_count"),
            func.coalesce(func.sum(Batch.gross_weight_kg), 0).label("total_gross"),
            func.coalesce(func.sum(Batch.net_weight_kg), 0).label("total_net"),
            func.coalesce(func.sum(Batch.waste_kg), 0).label("total_waste"),
        )
        .join(Batch, Grower.id == Batch.grower_id)
        .where(Batch.is_deleted == False)  # noqa: E712
        .where(Batch.created_at >= dt_from, Batch.created_at <= dt_to)
        .group_by(Grower.id, Grower.name, Grower.grower_code)
        .order_by(func.sum(Batch.net_weight_kg).desc())
    )
    if packhouse_id:
        batch_stmt = batch_stmt.where(Batch.packhouse_id == packhouse_id)

    # Lot-level aggregates per grower: class2 + returned
    is_class2 = Lot.grade.regexp_match(r"(?i)^2$|class\s*2|industrial")
    lot_stmt = (
        select(
            Lot.grower_id,
            func.coalesce(func.sum(case((is_class2, Lot.carton_count), else_=0)), 0).label("c2_cartons"),
            func.coalesce(func.sum(case((is_class2, Lot.weight_kg), else_=0)), 0).label("c2_kg"),
            func.coalesce(func.sum(case((Lot.status == "returned", Lot.weight_kg), else_=0)), 0).label("ret_kg"),
        )
        .join(Batch, Lot.batch_id == Batch.id)
        .where(Lot.is_deleted == False)  # noqa: E712
        .where(Batch.is_deleted == False)  # noqa: E712
        .where(Batch.created_at >= dt_from, Batch.created_at <= dt_to)
        .group_by(Lot.grower_id)
    )
    if packhouse_id:
        lot_stmt = lot_stmt.where(Lot.packhouse_id == packhouse_id)

    batch_result, lot_result = await db.execute(batch_stmt), await db.execute(lot_stmt)

    # Build lookup from lot aggregates
    lot_data: dict[str, tuple[int, float, float]] = {}
    for grower_id, c2_cartons, c2_kg, ret_kg in lot_result.all():
        lot_data[grower_id] = (c2_cartons, c2_kg, ret_kg)

    rows = []
    for grower_id, name, code, count, gross, net, waste in batch_result.all():
        waste_pct = round((waste / net * 100) if net > 0 else 0, 1)
        c2_cartons, c2_kg, ret_kg = lot_data.get(grower_id, (0, 0.0, 0.0))
        rows.append(GrowerSummaryRow(
            grower_name=name,
            grower_code=code,
            delivery_count=count,
            total_gross_kg=round(gross, 1),
            total_net_kg=round(net, 1),
            total_waste_kg=round(waste, 1),
            waste_pct=waste_pct,
            class2_cartons=c2_cartons,
            class2_kg=round(c2_kg, 1),
            returned_kg=round(ret_kg, 1),
        ))

    if format == "csv":
        headers = [
            "Grower", "Code", "Deliveries", "Gross (kg)", "Net (kg)",
            "Waste (kg)", "Waste %", "Class 2 Cartons", "Class 2 (kg)", "Returned (kg)",
        ]
        csv_rows = [[r.grower_name, r.grower_code or "", r.delivery_count,
                      r.total_gross_kg, r.total_net_kg, r.total_waste_kg,
                      f"{r.waste_pct}%", r.class2_cartons, r.class2_kg,
                      r.returned_kg] for r in rows]
        return _csv_response(
            _rows_to_csv(headers, csv_rows),
            f"grower_summary_{d_from}_{d_to}.csv",
        )

    return rows


# ── 3. Packout Report ────────────────────────────────────────

@router.get("/packout/{batch_id}")
async def packout_report(
    batch_id: str,
    db: AsyncSession = Depends(get_tenant_db),
    _user: User = Depends(require_onboarded),
):
    # Verify batch exists
    batch_result = await db.execute(
        select(Batch).where(Batch.id == batch_id, Batch.is_deleted == False)  # noqa: E712
    )
    batch = batch_result.scalar_one_or_none()
    if not batch:
        raise HTTPException(status_code=404, detail="Batch not found")

    stmt = (
        select(Lot, BoxSize.name.label("box_size_name"))
        .outerjoin(BoxSize, Lot.box_size_id == BoxSize.id)
        .where(Lot.batch_id == batch_id, Lot.is_deleted == False)  # noqa: E712
        .order_by(Lot.grade, Lot.size)
    )
    result = await db.execute(stmt)

    lots = []
    for lot, bs_name in result.all():
        lots.append(PackoutRow(
            lot_code=lot.lot_code,
            grade=lot.grade,
            size=lot.size,
            box_size_name=bs_name,
            carton_count=lot.carton_count,
            weight_kg=lot.weight_kg,
            pack_date=lot.pack_date.isoformat() if lot.pack_date else None,
            waste_kg=lot.waste_kg,
            quality_data=lot.quality_data,
            target_market=lot.target_market,
        ))

    return {
        "batch_code": batch.batch_code,
        "fruit_type": batch.fruit_type,
        "variety": batch.variety,
        "grower_id": batch.grower_id,
        "net_weight_kg": batch.net_weight_kg,
        "status": batch.status,
        "lots": lots,
    }


# ── 4. Performance Report ────────────────────────────────────

@router.get("/performance")
async def performance_report(
    date_from: date | None = None,
    date_to: date | None = None,
    packhouse_id: str | None = None,
    format: str = Query("json", regex="^(json|csv)$"),
    db: AsyncSession = Depends(get_tenant_db),
    _user: User = Depends(require_onboarded),
):
    d_from, d_to = _default_dates(date_from, date_to)
    dt_from = datetime.combine(d_from, datetime.min.time())
    dt_to = datetime.combine(d_to, datetime.max.time())

    # Batches per day
    batch_stmt = (
        select(
            cast(Batch.created_at, Date).label("day"),
            func.count(Batch.id).label("cnt"),
            func.coalesce(func.sum(Batch.waste_kg), 0).label("waste"),
        )
        .where(Batch.is_deleted == False)  # noqa: E712
        .where(Batch.created_at >= dt_from, Batch.created_at <= dt_to)
        .group_by(cast(Batch.created_at, Date))
    )
    if packhouse_id:
        batch_stmt = batch_stmt.where(Batch.packhouse_id == packhouse_id)

    # Lots per day
    lot_stmt = (
        select(
            cast(Lot.created_at, Date).label("day"),
            func.count(Lot.id).label("cnt"),
            func.coalesce(func.sum(Lot.carton_count), 0).label("cartons"),
        )
        .where(Lot.is_deleted == False)  # noqa: E712
        .where(Lot.created_at >= dt_from, Lot.created_at <= dt_to)
        .group_by(cast(Lot.created_at, Date))
    )
    if packhouse_id:
        lot_stmt = lot_stmt.where(Lot.packhouse_id == packhouse_id)

    # Pallets per day
    pallet_stmt = (
        select(
            cast(Pallet.created_at, Date).label("day"),
            func.count(Pallet.id).label("cnt"),
        )
        .where(Pallet.is_deleted == False)  # noqa: E712
        .where(Pallet.created_at >= dt_from, Pallet.created_at <= dt_to)
        .group_by(cast(Pallet.created_at, Date))
    )
    if packhouse_id:
        pallet_stmt = pallet_stmt.where(Pallet.packhouse_id == packhouse_id)

    batch_res = await db.execute(batch_stmt)
    lot_res = await db.execute(lot_stmt)
    pallet_res = await db.execute(pallet_stmt)

    batches_by_day = {str(r.day): (r.cnt, r.waste) for r in batch_res.all()}
    lots_by_day = {str(r.day): (r.cnt, r.cartons) for r in lot_res.all()}
    pallets_by_day = {str(r.day): r.cnt for r in pallet_res.all()}

    # Merge all days
    all_days = sorted(set(list(batches_by_day) + list(lots_by_day) + list(pallets_by_day)))

    rows = []
    for day in all_days:
        b_cnt, b_waste = batches_by_day.get(day, (0, 0))
        l_cnt, l_cartons = lots_by_day.get(day, (0, 0))
        p_cnt = pallets_by_day.get(day, 0)
        rows.append(PerformanceRow(
            date=day,
            batches_received=b_cnt,
            lots_packed=l_cnt,
            pallets_built=p_cnt,
            total_waste_kg=round(b_waste, 1),
            total_cartons=l_cartons,
        ))

    if format == "csv":
        headers = ["Date", "Batches", "Lots", "Pallets", "Waste (kg)", "Cartons"]
        csv_rows = [[r.date, r.batches_received, r.lots_packed, r.pallets_built,
                      r.total_waste_kg, r.total_cartons] for r in rows]
        return _csv_response(
            _rows_to_csv(headers, csv_rows),
            f"performance_{d_from}_{d_to}.csv",
        )

    return rows


# ── 5. Packing List ──────────────────────────────────────────

@router.get("/packing-list/{container_id}")
async def packing_list(
    container_id: str,
    format: str = Query("json", regex="^(json|csv)$"),
    db: AsyncSession = Depends(get_tenant_db),
    _user: User = Depends(require_onboarded),
):
    stmt = (
        select(Container)
        .where(Container.id == container_id, Container.is_deleted == False)  # noqa: E712
        .options(
            selectinload(Container.pallets)
            .selectinload(Pallet.pallet_lots)
            .selectinload(PalletLot.lot)
            .selectinload(Lot.batch),
        )
    )
    result = await db.execute(stmt)
    container = result.scalar_one_or_none()
    if not container:
        raise HTTPException(status_code=404, detail="Container not found")

    # Build grower lookup for lots
    grower_ids = set()
    for p in container.pallets:
        for pl in (p.pallet_lots or []):
            if pl.lot and pl.lot.grower_id:
                grower_ids.add(pl.lot.grower_id)

    grower_map: dict[str, tuple[str, str | None, str | None]] = {}
    if grower_ids:
        g_result = await db.execute(
            select(Grower.id, Grower.name, Grower.grower_code, Grower.globalg_ap_number)
            .where(Grower.id.in_(grower_ids))
        )
        for gid, gname, gcode, gggn in g_result.all():
            grower_map[gid] = (gname, gcode, gggn)

    # Also load box sizes for weight estimation when pallet weight is NULL
    box_size_weights: dict[str, float] = {}
    if any(p.net_weight_kg is None and p.box_size_id for p in container.pallets if not p.is_deleted):
        bs_ids = {p.box_size_id for p in container.pallets if p.box_size_id and not p.is_deleted}
        if bs_ids:
            bs_result = await db.execute(
                select(BoxSize.id, BoxSize.weight_kg).where(BoxSize.id.in_(bs_ids))
            )
            for bsid, bsw in bs_result.all():
                box_size_weights[bsid] = bsw

    # Build pallet list
    pallets_out: list[PackingListPallet] = []
    total_cartons = 0
    total_gross = 0.0

    for p in sorted(container.pallets, key=lambda x: x.pallet_number):
        if p.is_deleted:
            continue
        lots_out: list[PackingListPalletLot] = []
        lot_weight_sum = 0.0
        for pl in (p.pallet_lots or []):
            if pl.is_deleted or not pl.lot:
                continue
            lot = pl.lot
            gname, gcode, gggn = grower_map.get(lot.grower_id, ("Unknown", None, None))
            # Estimate weight for this lot's contribution
            lot_wt = None
            if lot.weight_kg and lot.carton_count and lot.carton_count > 0:
                lot_wt = round(lot.weight_kg / lot.carton_count * pl.box_count, 2)
            lot_weight_sum += lot_wt or 0
            lots_out.append(PackingListPalletLot(
                lot_code=lot.lot_code,
                grower_name=gname,
                grower_code=gcode,
                grower_ggn=gggn,
                batch_code=lot.batch.batch_code if lot.batch else "",
                harvest_date=lot.batch.harvest_date.isoformat() if lot.batch and lot.batch.harvest_date else None,
                carton_count=pl.box_count,
                weight_kg=lot_wt,
                size=pl.size,
            ))

        # Use stored weight, or estimate from box size, or from lot data
        net_wt = p.net_weight_kg
        if net_wt is None and lot_weight_sum > 0:
            net_wt = round(lot_weight_sum, 2)
        elif net_wt is None and p.box_size_id and p.box_size_id in box_size_weights:
            net_wt = round(box_size_weights[p.box_size_id] * p.current_boxes, 2)

        gross_wt = p.gross_weight_kg
        if gross_wt is None and net_wt is not None:
            gross_wt = net_wt  # best estimate when no tare data

        pallets_out.append(PackingListPallet(
            pallet_number=p.pallet_number,
            position=p.position_in_container,
            fruit_type=p.fruit_type,
            variety=p.variety,
            grade=p.grade,
            size=p.size,
            box_size=p.box_size_name,
            boxes=p.current_boxes,
            net_weight_kg=net_wt,
            gross_weight_kg=gross_wt,
            lots=lots_out,
        ))
        total_cartons += p.current_boxes
        total_gross += gross_wt or 0

    resp = PackingListResponse(
        container_number=container.container_number,
        container_type=container.container_type,
        shipping_container_number=container.shipping_container_number,
        customer_name=container.customer_name,
        destination=container.destination,
        seal_number=container.seal_number,
        vessel_name=container.vessel_name,
        voyage_number=container.voyage_number,
        export_date=container.export_date.isoformat() if container.export_date else None,
        transporter_name=container.transporter.name if container.transporter else None,
        shipping_agent_name=container.shipping_agent.name if container.shipping_agent else None,
        pallet_count=len(pallets_out),
        total_cartons=total_cartons,
        total_gross_weight_kg=round(total_gross, 1),
        pallets=pallets_out,
    )

    if format == "csv":
        headers = [
            "Pallet #", "Position", "Fruit Type", "Variety", "Grade", "Size",
            "Box Size", "Boxes", "Net Weight (kg)", "Gross Weight (kg)",
            "Lot Code", "Grower", "Grower Code", "GGN", "Batch Code",
            "Harvest Date", "Cartons", "Lot Weight (kg)",
        ]
        csv_rows = []
        for pal in resp.pallets:
            if not pal.lots:
                csv_rows.append([
                    pal.pallet_number, pal.position or "", pal.fruit_type or "",
                    pal.variety or "", pal.grade or "", pal.size or "",
                    pal.box_size or "", pal.boxes, pal.net_weight_kg or "",
                    pal.gross_weight_kg or "", "", "", "", "", "", "", "", "",
                ])
            else:
                for i, lot in enumerate(pal.lots):
                    csv_rows.append([
                        pal.pallet_number if i == 0 else "",
                        pal.position or "" if i == 0 else "",
                        pal.fruit_type or "" if i == 0 else "",
                        pal.variety or "" if i == 0 else "",
                        pal.grade or "" if i == 0 else "",
                        pal.size or "" if i == 0 else "",
                        pal.box_size or "" if i == 0 else "",
                        pal.boxes if i == 0 else "",
                        pal.net_weight_kg or "" if i == 0 else "",
                        pal.gross_weight_kg or "" if i == 0 else "",
                        lot.lot_code, lot.grower_name, lot.grower_code or "",
                        lot.grower_ggn or "", lot.batch_code,
                        lot.harvest_date or "", lot.carton_count, lot.weight_kg or "",
                    ])
        return _csv_response(
            _rows_to_csv(headers, csv_rows),
            f"packing_list_{container.container_number}.csv",
        )

    return resp
