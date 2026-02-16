"""Add waste_kg and waste_reason columns to lots table.

Revision ID: 0009
Revises: 0008
Create Date: 2026-02-12

Adds per-lot waste tracking fields so waste can be recorded at the
individual lot level (in addition to batch-level waste).
"""

revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None

from alembic import op
import sqlalchemy as sa


def upgrade() -> None:
    op.add_column("lots", sa.Column("waste_kg", sa.Float(), nullable=False, server_default="0.0"))
    op.add_column("lots", sa.Column("waste_reason", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("lots", "waste_reason")
    op.drop_column("lots", "waste_kg")
