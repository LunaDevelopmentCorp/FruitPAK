"""Add vehicle_reg and driver_name to batches table.

TENANT MIGRATION — run via: python -m app.tenancy.migration_runner

Revision ID: 0024
Revises: 0023
"""
from alembic import op
import sqlalchemy as sa

revision = "0024"
down_revision = "0023"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("batches", sa.Column("vehicle_reg", sa.String(30), nullable=True))
    op.add_column("batches", sa.Column("driver_name", sa.String(100), nullable=True))


def downgrade() -> None:
    op.drop_column("batches", "driver_name")
    op.drop_column("batches", "vehicle_reg")
