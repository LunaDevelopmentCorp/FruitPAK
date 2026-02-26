"""Add payment_routing column to batches.

TENANT MIGRATION — run via: python -m app.tenancy.migration_runner

Revision ID: 0022
Revises: 0021
"""

from alembic import op
import sqlalchemy as sa

revision = "0022"
down_revision = "0021"


def _column_exists(conn, table_name, column_name):
    """Check if a column exists on a table in the current schema."""
    result = conn.execute(sa.text(
        "SELECT 1 FROM information_schema.columns "
        "WHERE table_name = :table AND column_name = :col "
        "AND table_schema = current_schema()"
    ), {"table": table_name, "col": column_name})
    return result.scalar() is not None


def upgrade():
    conn = op.get_bind()

    if not _column_exists(conn, "batches", "payment_routing"):
        op.add_column(
            "batches",
            sa.Column("payment_routing", sa.String(20), server_default="grower", nullable=False),
        )


def downgrade():
    conn = op.get_bind()

    if _column_exists(conn, "batches", "payment_routing"):
        op.drop_column("batches", "payment_routing")
