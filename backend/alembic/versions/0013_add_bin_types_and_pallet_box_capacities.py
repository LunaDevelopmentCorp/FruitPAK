"""Add bin_types and pallet_type_box_capacities tables.

Revision ID: 0013
Revises: 0012
Create Date: 2026-02-17

BinType: config table for bin types used at GRN intake (name, tare_weight_kg).
PalletTypeBoxCapacity: M2M linking pallet_types to box_sizes with per-box capacity.
"""

revision = "0013"
down_revision = "0012"
branch_labels = None
depends_on = None

from alembic import op
import sqlalchemy as sa


def _table_exists(conn, table_name):
    result = conn.execute(sa.text(
        "SELECT 1 FROM information_schema.tables WHERE table_name = :name"
    ), {"name": table_name})
    return result.fetchone() is not None


def upgrade() -> None:
    conn = op.get_bind()

    if not _table_exists(conn, "bin_types"):
        op.create_table(
            "bin_types",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("name", sa.String(100), nullable=False),
            sa.Column("tare_weight_kg", sa.Float(), nullable=False, server_default="0"),
            sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        )

    if not _table_exists(conn, "pallet_type_box_capacities"):
        op.create_table(
            "pallet_type_box_capacities",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("pallet_type_id", sa.String(36), sa.ForeignKey("pallet_types.id"), nullable=False),
            sa.Column("box_size_id", sa.String(36), sa.ForeignKey("box_sizes.id"), nullable=False),
            sa.Column("capacity", sa.Integer(), nullable=False),
        )
        op.create_index(
            "ix_ptbc_pallet_type_id",
            "pallet_type_box_capacities",
            ["pallet_type_id"],
        )
        op.create_index(
            "ix_ptbc_unique",
            "pallet_type_box_capacities",
            ["pallet_type_id", "box_size_id"],
            unique=True,
        )


def downgrade() -> None:
    op.drop_index("ix_ptbc_unique", "pallet_type_box_capacities")
    op.drop_index("ix_ptbc_pallet_type_id", "pallet_type_box_capacities")
    op.drop_table("pallet_type_box_capacities")
    op.drop_table("bin_types")
