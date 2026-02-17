"""Add packaging_stock and packaging_movements tables.

Revision ID: 0011
Revises: 0010
Create Date: 2026-02-17

Adds inventory tracking for packaging items (boxes and pallets).
PackagingStock holds current quantity per packaging type.
PackagingMovement is an audit ledger for receipts, consumption, and adjustments.
"""

revision = "0011"
down_revision = "0010"
branch_labels = None
depends_on = None

from alembic import op
import sqlalchemy as sa


def upgrade() -> None:
    op.create_table(
        "packaging_stock",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("box_size_id", sa.String(36), sa.ForeignKey("box_sizes.id"), unique=True, nullable=True),
        sa.Column("pallet_type_id", sa.String(36), sa.ForeignKey("pallet_types.id"), unique=True, nullable=True),
        sa.Column("current_quantity", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("min_stock_level", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )

    op.create_table(
        "packaging_movements",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("stock_id", sa.String(36), sa.ForeignKey("packaging_stock.id"), nullable=False),
        sa.Column("movement_type", sa.String(30), nullable=False),
        sa.Column("quantity", sa.Integer(), nullable=False),
        sa.Column("cost_per_unit", sa.Float(), nullable=True),
        sa.Column("reference_type", sa.String(30), nullable=True),
        sa.Column("reference_id", sa.String(36), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("recorded_by", sa.String(36), nullable=True),
        sa.Column("recorded_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )

    op.create_index("ix_packaging_movements_stock_id", "packaging_movements", ["stock_id"])
    op.create_index("ix_packaging_movements_recorded_at", "packaging_movements", ["recorded_at"])


def downgrade() -> None:
    op.drop_index("ix_packaging_movements_recorded_at", "packaging_movements")
    op.drop_index("ix_packaging_movements_stock_id", "packaging_movements")
    op.drop_table("packaging_movements")
    op.drop_table("packaging_stock")
