"""Bulk CSV import for growers, harvest teams, and clients.

Endpoints:
    GET  /api/bulk-import/growers/template        Download grower CSV template
    POST /api/bulk-import/growers/upload           Upload grower CSV
    GET  /api/bulk-import/harvest-teams/template   Download harvest team CSV template
    POST /api/bulk-import/harvest-teams/upload     Upload harvest team CSV
    GET  /api/bulk-import/clients/template         Download client CSV template
    POST /api/bulk-import/clients/upload           Upload client CSV
"""

from fastapi import APIRouter, Depends, File, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.auth.deps import require_onboarded, require_permission
from app.database import get_tenant_db
from app.models.public.user import User
from app.models.tenant.client import Client
from app.models.tenant.grower import Grower
from app.models.tenant.harvest_team import HarvestTeam
from app.models.tenant.shipping_schedule import ShippingSchedule
from app.models.tenant.supplier import Supplier
from app.utils.activity import log_activity
from app.utils.cache import invalidate_cache
from app.utils.csv_import import (
    FieldDef,
    coerce_bool,
    coerce_float,
    coerce_int,
    coerce_json_list,
    generate_template_csv,
    generate_template_csv_multi,
    parse_csv,
)

router = APIRouter()


# ── Response schema ─────────────────────────────────────────


class RowErrorOut(BaseModel):
    row: int
    errors: list[str]


class BulkImportResult(BaseModel):
    total_rows: int
    created: int
    updated: int
    failed: int
    errors: list[RowErrorOut]


# ── Field definitions ───────────────────────────────────────

GROWER_FIELDS = [
    FieldDef(column="name", db_field="name", required=True),
    FieldDef(column="grower_code", db_field="grower_code"),
    FieldDef(column="contact_person", db_field="contact_person"),
    FieldDef(column="phone", db_field="phone"),
    FieldDef(column="email", db_field="email"),
    FieldDef(column="region", db_field="region"),
    FieldDef(column="total_hectares", db_field="total_hectares", coerce=coerce_float),
    FieldDef(column="estimated_volume_tons", db_field="estimated_volume_tons", coerce=coerce_float),
    FieldDef(column="globalg_ap_certified", db_field="globalg_ap_certified", coerce=coerce_bool),
    FieldDef(column="globalg_ap_number", db_field="globalg_ap_number"),
    FieldDef(column="notes", db_field="notes"),
    FieldDef(column="field_name", db_field="field_name"),
    FieldDef(column="field_code", db_field="field_code"),
    FieldDef(column="field_hectares", db_field="field_hectares", coerce=coerce_float),
    FieldDef(column="field_fruit_type", db_field="field_fruit_type"),
]

GROWER_SAMPLE_ROW1 = {
    "name": "Example Farm",
    "grower_code": "GRW-001",
    "contact_person": "John Smith",
    "phone": "+27 82 123 4567",
    "email": "john@example.com",
    "region": "Western Cape",
    "total_hectares": "150.5",
    "estimated_volume_tons": "2000",
    "globalg_ap_certified": "yes",
    "globalg_ap_number": "GGN-123456",
    "notes": "Citrus specialist",
    "field_name": "Block A",
    "field_code": "F001",
    "field_hectares": "50.5",
    "field_fruit_type": "citrus",
}

GROWER_SAMPLE_ROW2 = {
    "name": "Example Farm",
    "field_name": "Block B",
    "field_code": "F002",
    "field_hectares": "100",
    "field_fruit_type": "grapes",
}

HARVEST_TEAM_FIELDS = [
    FieldDef(column="name", db_field="name", required=True),
    FieldDef(column="team_leader", db_field="team_leader"),
    FieldDef(column="team_size", db_field="team_size", coerce=coerce_int),
    FieldDef(column="grower_name", db_field="grower_id", resolver="grower_name"),
    FieldDef(column="supplier_name", db_field="supplier_id", resolver="supplier_name"),
    FieldDef(column="estimated_volume_kg", db_field="estimated_volume_kg", coerce=coerce_float),
    FieldDef(column="fruit_types", db_field="fruit_types", coerce=coerce_json_list),
    FieldDef(column="assigned_fields", db_field="assigned_fields", coerce=coerce_json_list),
    FieldDef(column="notes", db_field="notes"),
]

HARVEST_TEAM_SAMPLE = {
    "name": "Team Alpha",
    "team_leader": "Jane Doe",
    "team_size": "12",
    "grower_name": "Example Farm",
    "supplier_name": "",
    "estimated_volume_kg": "50000",
    "fruit_types": "citrus|grapes",
    "assigned_fields": "Block A|Block B",
    "notes": "",
}

CLIENT_FIELDS = [
    FieldDef(column="name", db_field="name", required=True),
    FieldDef(column="contact_person", db_field="contact_person"),
    FieldDef(column="email", db_field="email"),
    FieldDef(column="phone", db_field="phone"),
    FieldDef(column="address", db_field="address"),
    FieldDef(column="country", db_field="country"),
    FieldDef(column="incoterm", db_field="incoterm"),
    FieldDef(column="payment_terms_days", db_field="payment_terms_days", coerce=coerce_int),
    FieldDef(column="currency", db_field="currency"),
    FieldDef(column="credit_limit", db_field="credit_limit", coerce=coerce_float),
    FieldDef(column="notes", db_field="notes"),
]

CLIENT_SAMPLE = {
    "name": "Fresh Fruits Ltd",
    "contact_person": "Alice Brown",
    "email": "alice@freshfruits.com",
    "phone": "+44 20 7946 0958",
    "address": "123 Market St, London",
    "country": "United Kingdom",
    "incoterm": "FOB",
    "payment_terms_days": "30",
    "currency": "GBP",
    "credit_limit": "50000",
    "notes": "Premium buyer",
}

SHIPPING_SCHEDULE_FIELDS = [
    FieldDef(column="shipping_line", db_field="shipping_line", required=True),
    FieldDef(column="vessel_name", db_field="vessel_name", required=True),
    FieldDef(column="voyage_number", db_field="voyage_number", required=True),
    FieldDef(column="port_of_loading", db_field="port_of_loading", required=True),
    FieldDef(column="port_of_discharge", db_field="port_of_discharge", required=True),
    FieldDef(column="etd", db_field="etd", required=True),
    FieldDef(column="eta", db_field="eta", required=True),
    FieldDef(column="booking_cutoff", db_field="booking_cutoff"),
    FieldDef(column="cargo_cutoff", db_field="cargo_cutoff"),
    FieldDef(column="status", db_field="status"),
    FieldDef(column="notes", db_field="notes"),
]

SHIPPING_SCHEDULE_SAMPLE = {
    "shipping_line": "MSC",
    "vessel_name": "MSC AURORA",
    "voyage_number": "FE409A",
    "port_of_loading": "Cape Town",
    "port_of_discharge": "Rotterdam",
    "etd": "2026-04-15",
    "eta": "2026-05-10",
    "booking_cutoff": "2026-04-10",
    "cargo_cutoff": "2026-04-12",
    "status": "scheduled",
    "notes": "",
}


# ── Helpers ─────────────────────────────────────────────────


def _csv_response(csv_text: str, filename: str) -> StreamingResponse:
    return StreamingResponse(
        iter([csv_text]),
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


async def _upsert_by_name(
    db: AsyncSession,
    model_class,
    rows: list[dict],
    name_field: str = "name",
) -> tuple[int, int]:
    """Upsert parsed rows by name. Returns (created_count, updated_count)."""
    result = await db.execute(select(model_class))
    existing = {getattr(r, name_field): r for r in result.scalars().all()}

    created = 0
    updated = 0

    for row_data in rows:
        name = row_data.get(name_field)
        if not name:
            continue

        if name in existing:
            record = existing[name]
            for key, value in row_data.items():
                if key != "id" and value is not None:
                    setattr(record, key, value)
            updated += 1
        else:
            record = model_class(**row_data)
            db.add(record)
            existing[name] = record
            created += 1

    await db.flush()
    return created, updated


# ── Grower-specific import (no-overwrite, merge fields) ─────


# Grower-level columns (everything except field_* columns)
_GROWER_LEVEL_KEYS = {
    "name", "grower_code", "contact_person", "phone", "email",
    "region", "total_hectares", "estimated_volume_tons",
    "globalg_ap_certified", "globalg_ap_number", "notes",
}


async def _upsert_growers(
    db: AsyncSession,
    rows: list[dict],
) -> tuple[int, int]:
    """Import growers with field merging and no-overwrite on existing growers.

    - Groups CSV rows by (name, globalg_ap_number) to identify the same grower.
    - Collects field entries from all rows in a group.
    - Existing growers: only merges new fields (no overwrite of grower data).
    - New growers: creates with all data + fields.
    """
    from collections import defaultdict

    # Group rows by grower identity: (name_lower, globalg_ap_number or "")
    groups: dict[tuple[str, str], list[dict]] = defaultdict(list)
    for row in rows:
        name = (row.get("name") or "").strip()
        if not name:
            continue
        ggn = (row.get("globalg_ap_number") or "").strip()
        groups[(name.lower(), ggn.lower())].append(row)

    # Load existing growers
    result = await db.execute(select(Grower))
    existing: dict[tuple[str, str], Grower] = {}
    for g in result.scalars().all():
        key = ((g.name or "").lower(), (g.globalg_ap_number or "").lower())
        existing[key] = g

    created = 0
    updated = 0

    for (name_lower, ggn_lower), group_rows in groups.items():
        # Extract field entries from all rows in this group
        new_fields = []
        for row in group_rows:
            field_name = row.get("field_name")
            field_code = row.get("field_code")
            # Accept a field if either name or code is provided
            if field_name or field_code:
                new_fields.append({
                    "name": field_name or field_code,  # use code as name if name is empty
                    "code": field_code or None,
                    "hectares": row.get("field_hectares"),
                    "fruit_type": row.get("field_fruit_type") or None,
                })

        if (name_lower, ggn_lower) in existing:
            # Existing grower — DO NOT overwrite grower data, only merge fields
            grower = existing[(name_lower, ggn_lower)]
            if not new_fields:
                continue
            current_fields = list(grower.fields or [])  # copy for mutation detection

            # Build set of existing field identifiers for dedup
            existing_ids = set()
            for f in current_fields:
                if f.get("code"):
                    existing_ids.add(("code", f["code"]))
                elif f.get("name"):
                    existing_ids.add(("name", f["name"]))

            # Append only truly new fields
            added = False
            for nf in new_fields:
                if nf.get("code") and ("code", nf["code"]) in existing_ids:
                    continue
                if ("name", nf["name"]) in existing_ids:
                    continue
                current_fields.append(nf)
                existing_ids.add(
                    ("code", nf["code"]) if nf.get("code") else ("name", nf["name"])
                )
                added = True

            if added:
                # Assign new list so SQLAlchemy detects the JSON change
                grower.fields = current_fields
                updated += 1
        else:
            # New grower — take grower-level data from first row
            first = group_rows[0]
            grower_data: dict = {"id": first.get("id")}
            for key in _GROWER_LEVEL_KEYS:
                val = first.get(key)
                if val is not None:
                    grower_data[key] = val
            grower_data["fields"] = new_fields if new_fields else []

            grower = Grower(**grower_data)
            db.add(grower)
            existing[(name_lower, ggn_lower)] = grower
            created += 1

    await db.flush()
    return created, updated


# ══════════════════════════════════════════════════════════════
# GROWERS
# ══════════════════════════════════════════════════════════════


@router.get("/growers/template")
async def grower_template(
    _user: User = Depends(require_permission("batch.read")),
    _onboarded: User = Depends(require_onboarded),
):
    csv_text = generate_template_csv_multi(
        GROWER_FIELDS, [GROWER_SAMPLE_ROW1, GROWER_SAMPLE_ROW2]
    )
    return _csv_response(csv_text, "growers_template.csv")


@router.post("/growers/upload", response_model=BulkImportResult)
async def upload_growers(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_tenant_db),
    user: User = Depends(require_permission("batch.write")),
    _onboarded: User = Depends(require_onboarded),
):
    parsed = await parse_csv(file, GROWER_FIELDS)
    created, updated = await _upsert_growers(db, parsed.rows)

    await log_activity(
        db, user,
        action="bulk_import",
        entity_type="grower",
        summary=f"CSV import: {created} created, {updated} updated, {len(parsed.errors)} failed",
    )
    await invalidate_cache("growers:*")

    return BulkImportResult(
        total_rows=parsed.total_rows,
        created=created,
        updated=updated,
        failed=len(parsed.errors),
        errors=[RowErrorOut(row=e.row, errors=e.errors) for e in parsed.errors],
    )


# ══════════════════════════════════════════════════════════════
# HARVEST TEAMS
# ══════════════════════════════════════════════════════════════


@router.get("/harvest-teams/template")
async def harvest_team_template(
    _user: User = Depends(require_permission("batch.read")),
    _onboarded: User = Depends(require_onboarded),
):
    csv_text = generate_template_csv(HARVEST_TEAM_FIELDS, HARVEST_TEAM_SAMPLE)
    return _csv_response(csv_text, "harvest_teams_template.csv")


@router.post("/harvest-teams/upload", response_model=BulkImportResult)
async def upload_harvest_teams(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_tenant_db),
    user: User = Depends(require_permission("batch.write")),
    _onboarded: User = Depends(require_onboarded),
):
    grower_result = await db.execute(select(Grower))
    grower_map = {g.name: g.id for g in grower_result.scalars().all()}

    supplier_result = await db.execute(select(Supplier))
    supplier_map = {s.name: s.id for s in supplier_result.scalars().all()}

    resolvers = {
        "grower_name": grower_map,
        "supplier_name": supplier_map,
    }

    parsed = await parse_csv(file, HARVEST_TEAM_FIELDS, resolvers)
    created, updated = await _upsert_by_name(db, HarvestTeam, parsed.rows)

    await log_activity(
        db, user,
        action="bulk_import",
        entity_type="harvest_team",
        summary=f"CSV import: {created} created, {updated} updated, {len(parsed.errors)} failed",
    )

    return BulkImportResult(
        total_rows=parsed.total_rows,
        created=created,
        updated=updated,
        failed=len(parsed.errors),
        errors=[RowErrorOut(row=e.row, errors=e.errors) for e in parsed.errors],
    )


# ══════════════════════════════════════════════════════════════
# CLIENTS
# ══════════════════════════════════════════════════════════════


@router.get("/clients/template")
async def client_template(
    _user: User = Depends(require_onboarded),
):
    csv_text = generate_template_csv(CLIENT_FIELDS, CLIENT_SAMPLE)
    return _csv_response(csv_text, "clients_template.csv")


@router.post("/clients/upload", response_model=BulkImportResult)
async def upload_clients(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_tenant_db),
    user: User = Depends(require_permission("batch.write")),
    _onboarded: User = Depends(require_onboarded),
):
    parsed = await parse_csv(file, CLIENT_FIELDS)
    created, updated = await _upsert_by_name(db, Client, parsed.rows)

    await log_activity(
        db, user,
        action="bulk_import",
        entity_type="client",
        summary=f"CSV import: {created} created, {updated} updated, {len(parsed.errors)} failed",
    )

    return BulkImportResult(
        total_rows=parsed.total_rows,
        created=created,
        updated=updated,
        failed=len(parsed.errors),
        errors=[RowErrorOut(row=e.row, errors=e.errors) for e in parsed.errors],
    )


# ══════════════════════════════════════════════════════════════
# SHIPPING SCHEDULES
# ══════════════════════════════════════════════════════════════


async def _upsert_shipping_schedules(
    db: AsyncSession,
    rows: list[dict],
) -> tuple[int, int]:
    """Upsert by (vessel_name, voyage_number). Returns (created, updated)."""
    from datetime import date as date_type

    result = await db.execute(select(ShippingSchedule).where(ShippingSchedule.is_deleted == False))  # noqa: E712
    existing: dict[tuple[str, str], ShippingSchedule] = {}
    for s in result.scalars().all():
        existing[(s.vessel_name.lower(), s.voyage_number.lower())] = s

    created = 0
    updated = 0

    for row_data in rows:
        vessel = (row_data.get("vessel_name") or "").strip()
        voyage = (row_data.get("voyage_number") or "").strip()
        if not vessel or not voyage:
            continue

        # Parse date strings to date objects
        for date_field in ("etd", "eta", "booking_cutoff", "cargo_cutoff"):
            val = row_data.get(date_field)
            if val and isinstance(val, str):
                try:
                    row_data[date_field] = date_type.fromisoformat(val)
                except ValueError:
                    row_data[date_field] = None

        key = (vessel.lower(), voyage.lower())
        if key in existing:
            record = existing[key]
            for k, v in row_data.items():
                if k != "id" and v is not None:
                    setattr(record, k, v)
            updated += 1
        else:
            row_data["source"] = "manual"
            record = ShippingSchedule(**row_data)
            db.add(record)
            existing[key] = record
            created += 1

    await db.flush()
    return created, updated


@router.get("/shipping-schedules/template")
async def shipping_schedule_template(
    _user: User = Depends(require_permission("export.read")),
    _onboarded: User = Depends(require_onboarded),
):
    csv_text = generate_template_csv(SHIPPING_SCHEDULE_FIELDS, SHIPPING_SCHEDULE_SAMPLE)
    return _csv_response(csv_text, "shipping_schedules_template.csv")


@router.post("/shipping-schedules/upload", response_model=BulkImportResult)
async def upload_shipping_schedules(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_tenant_db),
    user: User = Depends(require_permission("export.write")),
    _onboarded: User = Depends(require_onboarded),
):
    parsed = await parse_csv(file, SHIPPING_SCHEDULE_FIELDS)
    created, updated = await _upsert_shipping_schedules(db, parsed.rows)

    await log_activity(
        db, user,
        action="bulk_import",
        entity_type="shipping_schedule",
        summary=f"CSV import: {created} created, {updated} updated, {len(parsed.errors)} failed",
    )
    await invalidate_cache("shipping_schedules:*")

    return BulkImportResult(
        total_rows=parsed.total_rows,
        created=created,
        updated=updated,
        failed=len(parsed.errors),
        errors=[RowErrorOut(row=e.row, errors=e.errors) for e in parsed.errors],
    )
