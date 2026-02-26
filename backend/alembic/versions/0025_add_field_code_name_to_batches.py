"""Add field_code and field_name to batches table.

TENANT MIGRATION — run via: python -m app.tenancy.migration_runner

Revision ID: 0025
Revises: 0024
"""
from alembic import op
import sqlalchemy as sa

revision = "0025"
down_revision = "0024"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("batches", sa.Column("field_code", sa.String(50), nullable=True))
    op.add_column("batches", sa.Column("field_name", sa.String(200), nullable=True))


def downgrade() -> None:
    op.drop_column("batches", "field_name")
    op.drop_column("batches", "field_code")
