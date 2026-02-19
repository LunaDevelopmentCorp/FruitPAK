"""Shared number generation utility.

Reads format templates from tenant_config and generates sequential codes.

Format tokens:
  {date}       → YYYYMMDD (default)
  {seq:N}      → zero-padded sequence number, N digits, resets daily per prefix
  {batch}      → parent batch code (lots only)

Default formats:
  batch:     GRN-{date}-{seq:3}
  pallet:    PAL-{date}-{seq:3}
  lot:       {batch}-L{seq:2}
  container: CONT-{date}-{seq:3}
"""

import re
from datetime import date

from sqlalchemy import func, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.tenant.tenant_config import TenantConfig

DEFAULT_FORMATS = {
    "batch": "GRN-{date}-{seq:3}",
    "pallet": "PAL-{date}-{seq:3}",
    "lot": "{batch}-L{seq:2}",
    "container": "CONT-{date}-{seq:3}",
}

# Map entity types to their table and code column for counting
ENTITY_TABLE_MAP = {
    "batch": ("batches", "batch_code"),
    "pallet": ("pallets", "pallet_number"),
    "lot": ("lots", "lot_code"),
    "container": ("containers", "container_number"),
}


async def _get_format(db: AsyncSession, entity: str) -> str:
    """Get the format template for an entity type from tenant_config."""
    result = await db.execute(
        select(TenantConfig).where(TenantConfig.key == "number_formats")
    )
    config = result.scalar_one_or_none()
    if config and config.value and entity in config.value:
        return config.value[entity]
    return DEFAULT_FORMATS[entity]


def _build_prefix(fmt: str, today_str: str, batch_code: str | None = None) -> str:
    """Build the prefix portion of the code (everything before {seq:N}).

    Returns the static prefix so we can count existing codes with this prefix.
    """
    # Replace {date} with today
    prefix = fmt.replace("{date}", today_str)
    # Replace {batch} if present
    if batch_code is not None:
        prefix = prefix.replace("{batch}", batch_code)
    # Remove the {seq:N} part and everything after it
    prefix = re.sub(r"\{seq:\d+\}.*$", "", prefix)
    return prefix


async def _count_existing(db: AsyncSession, entity: str, prefix: str) -> int:
    """Count existing codes with the given prefix."""
    table_name, column_name = ENTITY_TABLE_MAP[entity]
    # Use raw SQL to count matching codes across entity table
    safe_prefix = prefix.replace("'", "''")
    result = await db.execute(
        text(f"SELECT COUNT(*) FROM {table_name} WHERE {column_name} LIKE '{safe_prefix}%'")
    )
    return result.scalar() or 0


async def generate_code(
    db: AsyncSession,
    entity: str,
    batch_code: str | None = None,
) -> str:
    """Generate a sequential code based on tenant config.

    Args:
        db: Database session (tenant-scoped)
        entity: One of "batch", "pallet", "lot", "container"
        batch_code: Parent batch code (required for lots)

    Returns:
        Generated code string, e.g. "GRN-20260219-001"
    """
    fmt = await _get_format(db, entity)
    today_str = date.today().strftime("%Y%m%d")

    # Build the prefix (everything before {seq:N})
    prefix = _build_prefix(fmt, today_str, batch_code)

    # Count existing codes with this prefix
    count = await _count_existing(db, entity, prefix)
    seq_num = count + 1

    # Extract sequence digit width from format
    seq_match = re.search(r"\{seq:(\d+)\}", fmt)
    seq_width = int(seq_match.group(1)) if seq_match else 3

    # Build the full code
    code = fmt.replace("{date}", today_str)
    if batch_code is not None:
        code = code.replace("{batch}", batch_code)
    code = re.sub(r"\{seq:\d+\}", f"{seq_num:0{seq_width}d}", code)

    return code
