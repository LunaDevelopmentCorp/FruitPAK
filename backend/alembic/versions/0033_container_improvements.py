"""Add logistics fields to containers, new status workflow support,
and container_type_box_capacities table for box-level capacity config.

DUAL MIGRATION — affects tenant schemas only (no public changes).
Run via:
  - alembic upgrade head (safe no-op for public schema)
  - python -m app.tenancy.migration_runner (tenant schemas)

Revision ID: 0033
Revises: 0032
"""

import sqlalchemy as sa
from alembic import op

revision = "0033"
down_revision = "0032"

# New columns on containers table
_NEW_COLUMNS = [
    ("shipping_line_id", sa.String(36)),
    ("vessel_name", sa.String(255)),
    ("voyage_number", sa.String(100)),
    ("eta", sa.Date()),
    ("arrived_at", sa.DateTime()),
    ("delivered_at", sa.DateTime()),
]


def _current_schema() -> str:
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
    # Skip if running against public schema (no containers table)
    if not _table_exists("containers"):
        return

    # ── 1. Add new columns to containers ──────────────────────
    for col_name, col_type in _NEW_COLUMNS:
        if not _column_exists("containers", col_name):
            op.add_column("containers", sa.Column(col_name, col_type, nullable=True))

    # Add FK for shipping_line_id
    if _column_exists("containers", "shipping_line_id") and _table_exists("shipping_lines"):
        fk_name = "fk_containers_shipping_line_id"
        if not _constraint_exists(fk_name):
            op.create_foreign_key(
                fk_name, "containers", "shipping_lines",
                ["shipping_line_id"], ["id"],
            )
        idx_name = "ix_containers_shipping_line_id"
        if not _index_exists(idx_name):
            op.create_index(idx_name, "containers", ["shipping_line_id"])

    # Index on eta for overdue queries
    if _column_exists("containers", "eta"):
        idx_name = "ix_containers_eta"
        if not _index_exists(idx_name):
            op.create_index(idx_name, "containers", ["eta"])

    # ── 2. Create container_type_box_capacities table ─────────
    if not _table_exists("container_type_box_capacities"):
        op.create_table(
            "container_type_box_capacities",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column(
                "transport_config_id", sa.String(36),
                sa.ForeignKey("transport_configs.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column(
                "box_size_id", sa.String(36),
                sa.ForeignKey("box_sizes.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("max_boxes", sa.Integer(), nullable=False),
            sa.UniqueConstraint(
                "transport_config_id", "box_size_id",
                name="uq_container_cap_config_box",
            ),
        )
        op.create_index(
            "ix_container_type_box_cap_config",
            "container_type_box_capacities",
            ["transport_config_id"],
        )


def downgrade():
    if not _table_exists("containers"):
        return

    # Drop container_type_box_capacities table
    if _table_exists("container_type_box_capacities"):
        if _index_exists("ix_container_type_box_cap_config"):
            op.drop_index("ix_container_type_box_cap_config", "container_type_box_capacities")
        op.drop_table("container_type_box_capacities")

    # Drop new columns from containers (reverse order)
    for col_name, _ in reversed(_NEW_COLUMNS):
        if _column_exists("containers", col_name):
            if col_name == "shipping_line_id":
                if _index_exists("ix_containers_shipping_line_id"):
                    op.drop_index("ix_containers_shipping_line_id", "containers")
                if _constraint_exists("fk_containers_shipping_line_id"):
                    op.drop_constraint("fk_containers_shipping_line_id", "containers", type_="foreignkey")
            if col_name == "eta":
                if _index_exists("ix_containers_eta"):
                    op.drop_index("ix_containers_eta", "containers")
            op.drop_column("containers", col_name)
