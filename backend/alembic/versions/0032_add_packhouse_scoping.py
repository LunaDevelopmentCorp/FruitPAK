"""Add packhouse_id to growers, harvest_teams, suppliers, packaging_stock,
grower_payments, and harvest_team_payments for per-packhouse data scoping.

DUAL MIGRATION — affects tenant schemas only (no public changes).
Run via:
  - alembic upgrade head (safe no-op for public schema)
  - python -m app.tenancy.migration_runner (tenant schemas)

Revision ID: 0032
Revises: 0031
"""

import sqlalchemy as sa
from alembic import op

revision = "0032"
down_revision = "0031"

# Tables that need a packhouse_id FK column
_TABLES = [
    "growers",
    "harvest_teams",
    "suppliers",
    "packaging_stock",
    "grower_payments",
    "harvest_team_payments",
]


def _current_schema() -> str:
    """Return the current schema name from search_path."""
    conn = op.get_bind()
    return conn.execute(sa.text("SELECT current_schema()")).scalar()


def _table_exists(table_name: str) -> bool:
    conn = op.get_bind()
    result = conn.execute(
        sa.text(
            "SELECT EXISTS ("
            "  SELECT 1 FROM information_schema.tables "
            "  WHERE table_schema = :schema AND table_name = :tbl"
            ")"
        ),
        {"schema": _current_schema(), "tbl": table_name},
    )
    return result.scalar()


def _column_exists(table_name: str, column_name: str) -> bool:
    conn = op.get_bind()
    result = conn.execute(
        sa.text(
            "SELECT EXISTS ("
            "  SELECT 1 FROM information_schema.columns "
            "  WHERE table_schema = :schema AND table_name = :tbl AND column_name = :col"
            ")"
        ),
        {"schema": _current_schema(), "tbl": table_name, "col": column_name},
    )
    return result.scalar()


def _constraint_exists(constraint_name: str) -> bool:
    conn = op.get_bind()
    result = conn.execute(
        sa.text(
            "SELECT EXISTS ("
            "  SELECT 1 FROM information_schema.table_constraints "
            "  WHERE constraint_schema = :schema AND constraint_name = :name"
            ")"
        ),
        {"schema": _current_schema(), "name": constraint_name},
    )
    return result.scalar()


def _index_exists(index_name: str) -> bool:
    conn = op.get_bind()
    result = conn.execute(
        sa.text(
            "SELECT EXISTS ("
            "  SELECT 1 FROM pg_indexes "
            "  WHERE schemaname = :schema AND indexname = :name"
            ")"
        ),
        {"schema": _current_schema(), "name": index_name},
    )
    return result.scalar()


def upgrade():
    # Skip if this is running against public schema (no packhouses table)
    if not _table_exists("packhouses"):
        return

    # ── 1. Add packhouse_id column to each table ────────────────
    for table in _TABLES:
        if not _table_exists(table):
            continue
        if _column_exists(table, "packhouse_id"):
            continue

        op.add_column(
            table,
            sa.Column("packhouse_id", sa.String(36), sa.ForeignKey("packhouses.id"), nullable=True),
        )
        idx_name = f"ix_{table}_packhouse_id"
        if not _index_exists(idx_name):
            op.create_index(idx_name, table, ["packhouse_id"])

    # ── 2. Fix packaging_stock unique constraints ────────────────
    # Drop individual unique constraints, add composite ones
    if _table_exists("packaging_stock") and _column_exists("packaging_stock", "packhouse_id"):
        # Drop old unique constraints (names vary by DB, try common patterns)
        for col in ("box_size_id", "pallet_type_id"):
            # SQLAlchemy auto-generates names like "packaging_stock_box_size_id_key"
            old_name = f"packaging_stock_{col}_key"
            if _constraint_exists(old_name):
                op.drop_constraint(old_name, "packaging_stock", type_="unique")

        # Add composite unique constraints
        if not _constraint_exists("uq_packaging_stock_box_packhouse"):
            op.create_unique_constraint(
                "uq_packaging_stock_box_packhouse",
                "packaging_stock",
                ["box_size_id", "packhouse_id"],
            )
        if not _constraint_exists("uq_packaging_stock_pallet_packhouse"):
            op.create_unique_constraint(
                "uq_packaging_stock_pallet_packhouse",
                "packaging_stock",
                ["pallet_type_id", "packhouse_id"],
            )

    # ── 3. Backfill: if tenant has exactly 1 packhouse, assign it ─
    conn = op.get_bind()
    result = conn.execute(sa.text("SELECT id FROM packhouses LIMIT 2"))
    rows = result.fetchall()
    if len(rows) == 1:
        ph_id = rows[0][0]
        for table in _TABLES:
            if _table_exists(table) and _column_exists(table, "packhouse_id"):
                conn.execute(
                    sa.text(f'UPDATE "{table}" SET packhouse_id = :ph WHERE packhouse_id IS NULL'),
                    {"ph": ph_id},
                )


def downgrade():
    for table in reversed(_TABLES):
        if _table_exists(table) and _column_exists(table, "packhouse_id"):
            idx_name = f"ix_{table}_packhouse_id"
            if _index_exists(idx_name):
                op.drop_index(idx_name, table)
            op.drop_column(table, "packhouse_id")

    # Restore individual unique constraints on packaging_stock
    if _table_exists("packaging_stock"):
        if _constraint_exists("uq_packaging_stock_box_packhouse"):
            op.drop_constraint("uq_packaging_stock_box_packhouse", "packaging_stock")
        if _constraint_exists("uq_packaging_stock_pallet_packhouse"):
            op.drop_constraint("uq_packaging_stock_pallet_packhouse", "packaging_stock")
        # Re-add individual uniques
        for col in ("box_size_id", "pallet_type_id"):
            op.create_unique_constraint(f"packaging_stock_{col}_key", "packaging_stock", [col])
