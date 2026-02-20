"""Generic CSV parsing + validation for bulk import."""

import csv
import io
import uuid
from dataclasses import dataclass, field
from typing import Any, Callable

from fastapi import UploadFile


@dataclass
class FieldDef:
    """Definition for a single CSV column."""
    column: str
    db_field: str
    required: bool = False
    coerce: Callable[[str], Any] | None = None
    resolver: str | None = None


@dataclass
class RowError:
    row: int
    errors: list[str]


@dataclass
class ParseResult:
    rows: list[dict[str, Any]] = field(default_factory=list)
    errors: list[RowError] = field(default_factory=list)
    total_rows: int = 0


def coerce_int(val: str) -> int | None:
    if not val.strip():
        return None
    return int(val)


def coerce_float(val: str) -> float | None:
    if not val.strip():
        return None
    return float(val)


def coerce_bool(val: str) -> bool:
    return val.strip().lower() in ("true", "yes", "1", "y")


def coerce_json_list(val: str) -> list[str] | None:
    """Parse pipe-separated string into list: 'citrus|grapes' -> ['citrus', 'grapes']"""
    if not val.strip():
        return None
    return [item.strip() for item in val.split("|") if item.strip()]


async def parse_csv(
    file: UploadFile,
    field_defs: list[FieldDef],
    resolvers: dict[str, dict[str, str]] | None = None,
) -> ParseResult:
    """Parse uploaded CSV, validate, coerce types, resolve FK names."""
    resolvers = resolvers or {}
    content = await file.read()
    text = content.decode("utf-8-sig")  # handle BOM from Excel
    reader = csv.DictReader(io.StringIO(text))

    result = ParseResult()

    for row_num, raw_row in enumerate(reader, start=2):  # row 1 = header
        result.total_rows += 1
        row_errors: list[str] = []
        parsed: dict[str, Any] = {"id": str(uuid.uuid4())}

        for fd in field_defs:
            raw_val = raw_row.get(fd.column, "").strip()

            if fd.required and not raw_val:
                row_errors.append(f"'{fd.column}' is required")
                continue

            if not raw_val:
                parsed[fd.db_field] = None
                continue

            # Resolve FK by name
            if fd.resolver:
                resolver_map = resolvers.get(fd.resolver, {})
                resolved_id = resolver_map.get(raw_val)
                if not resolved_id:
                    row_errors.append(f"'{fd.column}': '{raw_val}' not found")
                    continue
                parsed[fd.db_field] = resolved_id
                continue

            # Type coercion
            if fd.coerce:
                try:
                    parsed[fd.db_field] = fd.coerce(raw_val)
                except (ValueError, TypeError):
                    row_errors.append(f"'{fd.column}': invalid value '{raw_val}'")
                    continue
            else:
                parsed[fd.db_field] = raw_val

        if row_errors:
            result.errors.append(RowError(row=row_num, errors=row_errors))
        else:
            result.rows.append(parsed)

    return result


def generate_template_csv(
    field_defs: list[FieldDef],
    sample_row: dict[str, str] | None = None,
) -> str:
    """Generate CSV template string with headers and optional sample row."""
    output = io.StringIO()
    headers = [fd.column for fd in field_defs]
    writer = csv.writer(output)
    writer.writerow(headers)
    if sample_row:
        writer.writerow([sample_row.get(h, "") for h in headers])
    return output.getvalue()
