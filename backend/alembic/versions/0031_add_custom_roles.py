"""Add custom_roles table and user.custom_role_id column.

DUAL MIGRATION — affects both tenant and public schemas.
Run via:
  - alembic upgrade head (public schema)
  - python -m app.tenancy.migration_runner (tenant schemas)

Revision ID: 0031
Revises: 0030
"""

import sqlalchemy as sa
from alembic import op

revision = "0031"
down_revision = "0030"


def _table_exists(table_name: str) -> bool:
    conn = op.get_bind()
    result = conn.execute(
        sa.text(
            "SELECT EXISTS ("
            "  SELECT 1 FROM information_schema.tables "
            "  WHERE table_name = :tbl"
            ")"
        ),
        {"tbl": table_name},
    )
    return result.scalar()


def _column_exists(table_name: str, column_name: str) -> bool:
    conn = op.get_bind()
    result = conn.execute(
        sa.text(
            "SELECT EXISTS ("
            "  SELECT 1 FROM information_schema.columns "
            "  WHERE table_name = :tbl AND column_name = :col"
            ")"
        ),
        {"tbl": table_name, "col": column_name},
    )
    return result.scalar()


def upgrade():
    # ── Tenant: create custom_roles table ──────────────────────
    if not _table_exists("custom_roles"):
        op.create_table(
            "custom_roles",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("name", sa.String(100), nullable=False, unique=True),
            sa.Column("description", sa.Text()),
            sa.Column("permissions", sa.JSON(), nullable=False, server_default="[]"),
            sa.Column("is_system", sa.Boolean(), server_default="false"),
            sa.Column("is_active", sa.Boolean(), server_default="true"),
            sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now()),
        )

    # ── Public: add custom_role_id to users ────────────────────
    if _table_exists("users") and not _column_exists("users", "custom_role_id"):
        op.add_column("users", sa.Column("custom_role_id", sa.String(36)))


def downgrade():
    if _column_exists("users", "custom_role_id"):
        op.drop_column("users", "custom_role_id")
    if _table_exists("custom_roles"):
        op.drop_table("custom_roles")
