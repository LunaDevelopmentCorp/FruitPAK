"""Add soft delete to pallet_lots for traceability preservation.

Revision ID: 0016
Revises: 0015
Create Date: 2026-02-18
"""

revision = "0016"
down_revision = "0015"
branch_labels = None
depends_on = None

from alembic import op
import sqlalchemy as sa


def upgrade() -> None:
    op.add_column("pallet_lots", sa.Column("is_deleted", sa.Boolean(), server_default="false", nullable=False))
    op.add_column("pallet_lots", sa.Column("deallocated_at", sa.DateTime(), nullable=True))
    op.create_index("ix_pallet_lots_is_deleted", "pallet_lots", ["is_deleted"])


def downgrade() -> None:
    op.drop_index("ix_pallet_lots_is_deleted", table_name="pallet_lots")
    op.drop_column("pallet_lots", "deallocated_at")
    op.drop_column("pallet_lots", "is_deleted")
