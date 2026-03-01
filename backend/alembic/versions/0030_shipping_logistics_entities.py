"""Add shipping_lines, transporters, shipping_agents tables and FK columns.

TENANT MIGRATION — run via: python -m app.tenancy.migration_runner

Revision ID: 0030
Revises: 0029
"""

import sqlalchemy as sa
from alembic import op

revision = "0030"
down_revision = "0029"


def _table_exists(table_name: str) -> bool:
    """Check if a table exists in the current schema."""
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
    """Check if a column exists on a table in the current schema."""
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
    # ── Create shipping_lines table ────────────────────────────
    if not _table_exists("shipping_lines"):
        op.create_table(
            "shipping_lines",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("name", sa.String(255), nullable=False, unique=True),
            sa.Column("code", sa.String(50), nullable=False, unique=True),
            sa.Column("contact_person", sa.String(255)),
            sa.Column("phone", sa.String(50)),
            sa.Column("email", sa.String(255)),
            sa.Column("address", sa.Text()),
            sa.Column("notes", sa.Text()),
            sa.Column("is_active", sa.Boolean(), server_default="true"),
            sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        )

    # ── Create transporters table ──────────────────────────────
    if not _table_exists("transporters"):
        op.create_table(
            "transporters",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("name", sa.String(255), nullable=False, unique=True),
            sa.Column("code", sa.String(50), nullable=False, unique=True),
            sa.Column("contact_person", sa.String(255)),
            sa.Column("phone", sa.String(50)),
            sa.Column("email", sa.String(255)),
            sa.Column("address", sa.Text()),
            sa.Column("notes", sa.Text()),
            sa.Column("is_active", sa.Boolean(), server_default="true"),
            sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        )

    # ── Create shipping_agents table ───────────────────────────
    if not _table_exists("shipping_agents"):
        op.create_table(
            "shipping_agents",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("name", sa.String(255), nullable=False, unique=True),
            sa.Column("code", sa.String(50), nullable=False, unique=True),
            sa.Column("contact_person", sa.String(255)),
            sa.Column("phone", sa.String(50)),
            sa.Column("email", sa.String(255)),
            sa.Column("address", sa.Text()),
            sa.Column("notes", sa.Text()),
            sa.Column("is_active", sa.Boolean(), server_default="true"),
            sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        )

    # ── Add FK to shipping_schedules ───────────────────────────
    if not _column_exists("shipping_schedules", "shipping_line_id"):
        op.add_column(
            "shipping_schedules",
            sa.Column("shipping_line_id", sa.String(36), sa.ForeignKey("shipping_lines.id")),
        )

    # ── Add FKs to containers ──────────────────────────────────
    if not _column_exists("containers", "transporter_id"):
        op.add_column(
            "containers",
            sa.Column("transporter_id", sa.String(36), sa.ForeignKey("transporters.id")),
        )
    if not _column_exists("containers", "shipping_agent_id"):
        op.add_column(
            "containers",
            sa.Column("shipping_agent_id", sa.String(36), sa.ForeignKey("shipping_agents.id")),
        )

    # ── Add FKs to exports ─────────────────────────────────────
    if not _column_exists("exports", "shipping_line_id"):
        op.add_column(
            "exports",
            sa.Column("shipping_line_id", sa.String(36), sa.ForeignKey("shipping_lines.id")),
        )
    if not _column_exists("exports", "transporter_id"):
        op.add_column(
            "exports",
            sa.Column("transporter_id", sa.String(36), sa.ForeignKey("transporters.id")),
        )
    if not _column_exists("exports", "shipping_agent_id"):
        op.add_column(
            "exports",
            sa.Column("shipping_agent_id", sa.String(36), sa.ForeignKey("shipping_agents.id")),
        )


def downgrade():
    op.drop_column("exports", "shipping_agent_id")
    op.drop_column("exports", "transporter_id")
    op.drop_column("exports", "shipping_line_id")
    op.drop_column("containers", "shipping_agent_id")
    op.drop_column("containers", "transporter_id")
    op.drop_column("shipping_schedules", "shipping_line_id")
    op.drop_table("shipping_agents")
    op.drop_table("transporters")
    op.drop_table("shipping_lines")
