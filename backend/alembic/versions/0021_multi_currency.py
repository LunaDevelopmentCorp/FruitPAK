"""Rename financial_config.currency to base_currency and add export_currencies.

TENANT MIGRATION — run via: python -m app.tenancy.migration_runner

Revision ID: 0021
Revises: 0020
"""

from alembic import op
import sqlalchemy as sa

revision = "0021"
down_revision = "0020"


def _table_exists(conn, table_name):
    """Check if a table exists in the current search_path."""
    result = conn.execute(sa.text(
        "SELECT 1 FROM information_schema.tables "
        "WHERE table_name = :name AND table_schema = current_schema()"
    ), {"name": table_name})
    return result.scalar() is not None


def _column_exists(conn, table_name, column_name):
    """Check if a column exists on a table in the current schema."""
    result = conn.execute(sa.text(
        "SELECT 1 FROM information_schema.columns "
        "WHERE table_name = :table AND column_name = :col "
        "AND table_schema = current_schema()"
    ), {"table": table_name, "col": column_name})
    return result.scalar() is not None


def upgrade() -> None:
    conn = op.get_bind()
    if not _table_exists(conn, "financial_config"):
        return

    # Rename currency → base_currency (only if not already renamed)
    if _column_exists(conn, "financial_config", "currency"):
        op.alter_column(
            "financial_config", "currency",
            new_column_name="base_currency",
            existing_type=sa.String(3),
        )

    # Add export_currencies JSON column
    if not _column_exists(conn, "financial_config", "export_currencies"):
        op.add_column(
            "financial_config",
            sa.Column("export_currencies", sa.JSON, nullable=True),
        )


def downgrade() -> None:
    conn = op.get_bind()
    if not _table_exists(conn, "financial_config"):
        return

    if _column_exists(conn, "financial_config", "export_currencies"):
        op.drop_column("financial_config", "export_currencies")

    if _column_exists(conn, "financial_config", "base_currency"):
        op.alter_column(
            "financial_config", "base_currency",
            new_column_name="currency",
            existing_type=sa.String(3),
        )
