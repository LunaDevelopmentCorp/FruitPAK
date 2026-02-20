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
from app.models.tenant.supplier import Supplier
from app.utils.activity import log_activity
from app.utils.csv_import import (
    FieldDef,
    coerce_bool,
    coerce_float,
    coerce_int,
    coerce_json_list,
    generate_template_csv,
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
]

GROWER_SAMPLE = {
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


# ══════════════════════════════════════════════════════════════
# GROWERS
# ══════════════════════════════════════════════════════════════


@router.get("/growers/template")
async def grower_template(
    _user: User = Depends(require_permission("batch.read")),
    _onboarded: User = Depends(require_onboarded),
):
    csv_text = generate_template_csv(GROWER_FIELDS, GROWER_SAMPLE)
    return _csv_response(csv_text, "growers_template.csv")


@router.post("/growers/upload", response_model=BulkImportResult)
async def upload_growers(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_tenant_db),
    user: User = Depends(require_permission("batch.write")),
    _onboarded: User = Depends(require_onboarded),
):
    parsed = await parse_csv(file, GROWER_FIELDS)
    created, updated = await _upsert_by_name(db, Grower, parsed.rows)

    await log_activity(
        db, user,
        action="bulk_import",
        entity_type="grower",
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
