"""Tenant config export / import — copy reference data between tenants."""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Body, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import require_role
from app.database import get_tenant_db
from app.models.public.user import User, UserRole
from app.models.tenant.client import Client
from app.models.tenant.company_profile import CompanyProfile
from app.models.tenant.container_type_capacity import ContainerTypeBoxCapacity
from app.models.tenant.custom_role import CustomRole
from app.models.tenant.financial_config import FinancialConfig
from app.models.tenant.grower import Grower
from app.models.tenant.harvest_team import HarvestTeam
from app.models.tenant.pack_line import PackLine
from app.models.tenant.packhouse import Packhouse
from app.models.tenant.product_config import (
    BinType,
    BoxSize,
    PackSpec,
    PalletType,
    PalletTypeBoxCapacity,
    ProductConfig,
)
from app.models.tenant.shipping_agent import ShippingAgent
from app.models.tenant.shipping_line import ShippingLine
from app.models.tenant.supplier import Supplier
from app.models.tenant.tenant_config import TenantConfig
from app.models.tenant.transport_config import TransportConfig
from app.models.tenant.transporter import Transporter
from app.utils.activity import log_activity
from app.utils.cache import invalidate_cache

logger = logging.getLogger(__name__)
router = APIRouter()

# ── Helpers ──────────────────────────────────────────────────

def _row_dict(obj: Any, exclude: set[str] | None = None) -> dict:
    """Serialize a SQLAlchemy model row to dict, excluding specified columns."""
    skip = {"id", "created_at", "updated_at"} | (exclude or set())
    result = {}
    for col in obj.__table__.columns:
        if col.name in skip:
            continue
        result[col.name] = getattr(obj, col.name)
    return result


def _build_id_name_map(rows: list, key: str = "name") -> dict[str, str]:
    """Build {id: name} map from model rows."""
    return {r.id: getattr(r, key) for r in rows}


# ── Export ───────────────────────────────────────────────────

@router.get("/tenant-export")
async def export_tenant_config(
    user: User = Depends(require_role(UserRole.PLATFORM_ADMIN)),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Export all reference/config data from the current tenant as JSON."""

    # Load all reference tables
    packhouses = (await db.execute(select(Packhouse))).scalars().all()
    pack_lines = (await db.execute(select(PackLine))).scalars().all()
    product_configs = (await db.execute(select(ProductConfig))).scalars().all()
    box_sizes = (await db.execute(select(BoxSize))).scalars().all()
    bin_types = (await db.execute(select(BinType))).scalars().all()
    pack_specs = (await db.execute(select(PackSpec))).scalars().all()
    pallet_types = (await db.execute(select(PalletType))).scalars().all()
    pallet_type_caps = (await db.execute(select(PalletTypeBoxCapacity))).scalars().all()
    transport_configs = (await db.execute(select(TransportConfig))).scalars().all()
    container_caps = (await db.execute(select(ContainerTypeBoxCapacity))).scalars().all()
    growers = (await db.execute(select(Grower))).scalars().all()
    suppliers = (await db.execute(select(Supplier))).scalars().all()
    harvest_teams = (await db.execute(select(HarvestTeam))).scalars().all()
    clients = (await db.execute(select(Client))).scalars().all()
    shipping_lines = (await db.execute(select(ShippingLine))).scalars().all()
    transporters = (await db.execute(select(Transporter))).scalars().all()
    shipping_agents = (await db.execute(select(ShippingAgent))).scalars().all()
    custom_roles = (await db.execute(select(CustomRole))).scalars().all()
    tenant_configs = (await db.execute(select(TenantConfig))).scalars().all()

    # Singletons
    company = (await db.execute(select(CompanyProfile))).scalars().first()
    financial = (await db.execute(select(FinancialConfig))).scalars().first()

    # Build FK name maps for resolving IDs → names in export
    ph_map = _build_id_name_map(packhouses)
    pt_map = _build_id_name_map(pallet_types)
    bs_map = _build_id_name_map(box_sizes)
    tc_map = _build_id_name_map(transport_configs)
    gr_map = _build_id_name_map(growers)
    su_map = _build_id_name_map(suppliers)

    # Serialize pack_lines with packhouse name
    def _export_pack_line(pl: PackLine) -> dict:
        d = _row_dict(pl, exclude={"packhouse_id"})
        d["packhouse_name"] = ph_map.get(pl.packhouse_id, "")
        return d

    # Serialize pallet_type_box_capacities with names
    def _export_pt_cap(cap: PalletTypeBoxCapacity) -> dict:
        return {
            "pallet_type_name": pt_map.get(cap.pallet_type_id, ""),
            "box_size_name": bs_map.get(cap.box_size_id, ""),
            "capacity": cap.capacity,
        }

    # Serialize container_type_box_capacities with names
    def _export_ct_cap(cap: ContainerTypeBoxCapacity) -> dict:
        return {
            "transport_config_name": tc_map.get(cap.transport_config_id, ""),
            "box_size_name": bs_map.get(cap.box_size_id, ""),
            "max_boxes": cap.max_boxes,
        }

    # Serialize grower with packhouse name
    def _export_grower(g: Grower) -> dict:
        d = _row_dict(g, exclude={"packhouse_id"})
        d["packhouse_name"] = ph_map.get(g.packhouse_id, "") if g.packhouse_id else None
        return d

    # Serialize supplier with packhouse name
    def _export_supplier(s: Supplier) -> dict:
        d = _row_dict(s, exclude={"packhouse_id"})
        d["packhouse_name"] = ph_map.get(s.packhouse_id, "") if s.packhouse_id else None
        return d

    # Serialize harvest_team with FK names
    def _export_harvest_team(ht: HarvestTeam) -> dict:
        d = _row_dict(ht, exclude={"grower_id", "supplier_id", "packhouse_id"})
        d["grower_name"] = gr_map.get(ht.grower_id, "") if ht.grower_id else None
        d["supplier_name"] = su_map.get(ht.supplier_id, "") if ht.supplier_id else None
        d["packhouse_name"] = ph_map.get(ht.packhouse_id, "") if ht.packhouse_id else None
        return d

    export_data = {
        "version": 1,
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "company_profile": _row_dict(company) if company else None,
        "financial_config": _row_dict(financial) if financial else None,
        "tenant_configs": [_row_dict(tc, exclude=set()) for tc in tenant_configs],
        "packhouses": [_row_dict(ph) for ph in packhouses],
        "pack_lines": [_export_pack_line(pl) for pl in pack_lines],
        "product_configs": [_row_dict(pc) for pc in product_configs],
        "box_sizes": [_row_dict(bs) for bs in box_sizes],
        "bin_types": [_row_dict(bt) for bt in bin_types],
        "pack_specs": [_row_dict(ps) for ps in pack_specs],
        "pallet_types": [_row_dict(pt) for pt in pallet_types],
        "pallet_type_box_capacities": [_export_pt_cap(c) for c in pallet_type_caps],
        "transport_configs": [_row_dict(tc) for tc in transport_configs],
        "container_type_box_capacities": [_export_ct_cap(c) for c in container_caps],
        "growers": [_export_grower(g) for g in growers],
        "suppliers": [_export_supplier(s) for s in suppliers],
        "harvest_teams": [_export_harvest_team(ht) for ht in harvest_teams],
        "clients": [_row_dict(c) for c in clients],
        "shipping_lines": [_row_dict(sl) for sl in shipping_lines],
        "transporters": [_row_dict(t) for t in transporters],
        "shipping_agents": [_row_dict(sa) for sa in shipping_agents],
        "custom_roles": [_row_dict(cr) for cr in custom_roles],
    }

    await log_activity(
        db, user,
        action="exported",
        entity_type="tenant_config",
        summary="Exported tenant config data",
    )

    return export_data


# ── Import ───────────────────────────────────────────────────

async def _upsert_singleton(
    db: AsyncSession,
    model_class: type,
    data: dict | None,
) -> str:
    """Upsert a singleton config row. Returns 'created', 'updated', or 'skipped'."""
    if not data:
        return "skipped"
    existing = (await db.execute(select(model_class))).scalars().first()
    if existing:
        for key, value in data.items():
            if value is not None:
                setattr(existing, key, value)
        return "updated"
    db.add(model_class(**data))
    return "created"


async def _upsert_by_key(
    db: AsyncSession,
    model_class: type,
    rows: list[dict],
    key_field: str = "name",
    resolve_fks: dict[str, dict[str, str]] | None = None,
) -> dict[str, int]:
    """Upsert rows by a unique key field. Returns {created, updated, skipped, errors}."""
    counts: dict[str, int] = {"created": 0, "updated": 0, "skipped": 0, "errors": 0}
    if not rows:
        return counts

    # Load existing records keyed by the key_field
    result = await db.execute(select(model_class))
    existing_map = {getattr(r, key_field): r for r in result.scalars().all()}

    for row_data in rows:
        try:
            # Resolve FK names → IDs
            if resolve_fks:
                for fk_name_field, resolver in resolve_fks.items():
                    fk_id_field = fk_name_field.replace("_name", "_id")
                    name_val = row_data.pop(fk_name_field, None)
                    if name_val:
                        resolved_id = resolver.get(name_val)
                        if resolved_id:
                            row_data[fk_id_field] = resolved_id
                        else:
                            logger.warning(
                                "FK resolution failed: %s='%s' not found",
                                fk_name_field, name_val,
                            )

            key_val = row_data.get(key_field)
            if not key_val:
                counts["errors"] += 1
                continue

            if key_val in existing_map:
                # Update existing — don't overwrite with None
                record = existing_map[key_val]
                for k, v in row_data.items():
                    if k != "id" and v is not None:
                        setattr(record, k, v)
                counts["updated"] += 1
            else:
                db.add(model_class(**row_data))
                counts["created"] += 1
        except Exception:
            logger.exception("Error importing %s row: %s", model_class.__name__, row_data.get(key_field, "?"))
            counts["errors"] += 1

    await db.flush()
    return counts


async def _upsert_junction(
    db: AsyncSession,
    model_class: type,
    rows: list[dict],
    fk1_name_field: str,
    fk1_id_field: str,
    fk1_resolver: dict[str, str],
    fk2_name_field: str,
    fk2_id_field: str,
    fk2_resolver: dict[str, str],
    value_fields: list[str],
) -> dict[str, int]:
    """Upsert junction/capacity rows by resolving two FK names."""
    counts: dict[str, int] = {"created": 0, "updated": 0, "skipped": 0, "errors": 0}
    if not rows:
        return counts

    # Load existing keyed by (fk1_id, fk2_id)
    result = await db.execute(select(model_class))
    existing_map = {
        (getattr(r, fk1_id_field), getattr(r, fk2_id_field)): r
        for r in result.scalars().all()
    }

    for row_data in rows:
        try:
            name1 = row_data.get(fk1_name_field)
            name2 = row_data.get(fk2_name_field)
            id1 = fk1_resolver.get(name1 or "")
            id2 = fk2_resolver.get(name2 or "")
            if not id1 or not id2:
                logger.warning(
                    "Junction FK resolution failed: %s='%s', %s='%s'",
                    fk1_name_field, name1, fk2_name_field, name2,
                )
                counts["errors"] += 1
                continue

            key = (id1, id2)
            values = {f: row_data[f] for f in value_fields if f in row_data}

            if key in existing_map:
                record = existing_map[key]
                for k, v in values.items():
                    setattr(record, k, v)
                counts["updated"] += 1
            else:
                db.add(model_class(**{fk1_id_field: id1, fk2_id_field: id2, **values}))
                counts["created"] += 1
        except Exception:
            logger.exception("Error importing junction row")
            counts["errors"] += 1

    await db.flush()
    return counts


@router.post("/tenant-import")
async def import_tenant_config(
    data: dict = Body(...),
    user: User = Depends(require_role(UserRole.PLATFORM_ADMIN)),
    db: AsyncSession = Depends(get_tenant_db),
):
    """Import reference/config data into the current tenant from a JSON export."""

    version = data.get("version", 0)
    if version != 1:
        return {"error": f"Unsupported export version: {version}"}

    summary: dict[str, Any] = {}
    errors: list[str] = []

    try:
        # ── Phase 1: Singletons ──────────────────────────────
        summary["company_profile"] = await _upsert_singleton(
            db, CompanyProfile, data.get("company_profile"),
        )
        summary["financial_config"] = await _upsert_singleton(
            db, FinancialConfig, data.get("financial_config"),
        )

        # Tenant configs (key-value pairs)
        tc_rows = data.get("tenant_configs", [])
        tc_counts = await _upsert_by_key(db, TenantConfig, tc_rows, key_field="key")
        summary["tenant_configs"] = tc_counts

        # ── Phase 2: Packhouses (no FK deps) ─────────────────
        ph_counts = await _upsert_by_key(db, Packhouse, data.get("packhouses", []))
        summary["packhouses"] = ph_counts
        await db.flush()

        # Build packhouse name→id resolver
        ph_result = await db.execute(select(Packhouse))
        ph_resolver = {ph.name: ph.id for ph in ph_result.scalars().all()}

        # ── Phase 3: Pack lines (FK → packhouse) ─────────────
        pl_counts = await _upsert_by_key(
            db, PackLine, data.get("pack_lines", []),
            resolve_fks={"packhouse_name": ph_resolver},
        )
        summary["pack_lines"] = pl_counts

        # ── Phase 4: Product config (no FK deps) ─────────────
        # ProductConfig uses fruit_type as key (may have duplicates with variety)
        pc_rows = data.get("product_configs", [])
        pc_counts = await _upsert_by_key(db, ProductConfig, pc_rows, key_field="fruit_type")
        summary["product_configs"] = pc_counts

        bs_counts = await _upsert_by_key(db, BoxSize, data.get("box_sizes", []))
        summary["box_sizes"] = bs_counts

        bt_counts = await _upsert_by_key(db, BinType, data.get("bin_types", []))
        summary["bin_types"] = bt_counts

        ps_counts = await _upsert_by_key(db, PackSpec, data.get("pack_specs", []))
        summary["pack_specs"] = ps_counts

        # ── Phase 5: Pallet types (no FK deps) ───────────────
        ptc = await _upsert_by_key(db, PalletType, data.get("pallet_types", []))
        summary["pallet_types"] = ptc
        await db.flush()

        # Build pallet_type and box_size name→id resolvers
        pt_result = await db.execute(select(PalletType))
        pt_resolver = {pt.name: pt.id for pt in pt_result.scalars().all()}
        bs_result = await db.execute(select(BoxSize))
        bs_resolver = {bs.name: bs.id for bs in bs_result.scalars().all()}

        # ── Phase 6: Pallet type box capacities ──────────────
        ptbc = await _upsert_junction(
            db, PalletTypeBoxCapacity, data.get("pallet_type_box_capacities", []),
            fk1_name_field="pallet_type_name", fk1_id_field="pallet_type_id", fk1_resolver=pt_resolver,
            fk2_name_field="box_size_name", fk2_id_field="box_size_id", fk2_resolver=bs_resolver,
            value_fields=["capacity"],
        )
        summary["pallet_type_box_capacities"] = ptbc

        # ── Phase 7: Transport configs (no FK deps) ──────────
        tcc = await _upsert_by_key(db, TransportConfig, data.get("transport_configs", []))
        summary["transport_configs"] = tcc
        await db.flush()

        # Build transport_config name→id resolver
        tc_result = await db.execute(select(TransportConfig))
        tc_resolver = {tc.name: tc.id for tc in tc_result.scalars().all()}

        # ── Phase 8: Container type box capacities ────────────
        ctbc = await _upsert_junction(
            db, ContainerTypeBoxCapacity, data.get("container_type_box_capacities", []),
            fk1_name_field="transport_config_name", fk1_id_field="transport_config_id", fk1_resolver=tc_resolver,
            fk2_name_field="box_size_name", fk2_id_field="box_size_id", fk2_resolver=bs_resolver,
            value_fields=["max_boxes"],
        )
        summary["container_type_box_capacities"] = ctbc

        # ── Phase 9: Growers & Suppliers (FK → packhouse) ────
        gr_counts = await _upsert_by_key(
            db, Grower, data.get("growers", []),
            resolve_fks={"packhouse_name": ph_resolver},
        )
        summary["growers"] = gr_counts

        su_counts = await _upsert_by_key(
            db, Supplier, data.get("suppliers", []),
            resolve_fks={"packhouse_name": ph_resolver},
        )
        summary["suppliers"] = su_counts
        await db.flush()

        # Build grower and supplier name→id resolvers
        gr_result = await db.execute(select(Grower))
        gr_resolver = {g.name: g.id for g in gr_result.scalars().all()}
        su_result = await db.execute(select(Supplier))
        su_resolver = {s.name: s.id for s in su_result.scalars().all()}

        # ── Phase 10: Harvest teams (FK → grower, supplier, packhouse)
        ht_counts = await _upsert_by_key(
            db, HarvestTeam, data.get("harvest_teams", []),
            resolve_fks={
                "grower_name": gr_resolver,
                "supplier_name": su_resolver,
                "packhouse_name": ph_resolver,
            },
        )
        summary["harvest_teams"] = ht_counts

        # ── Phase 11: Clients, Shipping, Custom Roles ─────────
        cl_counts = await _upsert_by_key(db, Client, data.get("clients", []))
        summary["clients"] = cl_counts

        sl_counts = await _upsert_by_key(db, ShippingLine, data.get("shipping_lines", []))
        summary["shipping_lines"] = sl_counts

        tr_counts = await _upsert_by_key(db, Transporter, data.get("transporters", []))
        summary["transporters"] = tr_counts

        sa_counts = await _upsert_by_key(db, ShippingAgent, data.get("shipping_agents", []))
        summary["shipping_agents"] = sa_counts

        cr_counts = await _upsert_by_key(db, CustomRole, data.get("custom_roles", []))
        summary["custom_roles"] = cr_counts

        await log_activity(
            db, user,
            action="imported",
            entity_type="tenant_config",
            summary="Imported tenant config data",
        )

        await db.commit()

        # Invalidate all caches for this tenant
        try:
            await invalidate_cache("*")
        except Exception:
            pass

    except Exception as e:
        await db.rollback()
        logger.exception("Tenant import failed")
        return {"error": str(e), "summary": summary}

    return {"status": "ok", "summary": summary, "errors": errors}
