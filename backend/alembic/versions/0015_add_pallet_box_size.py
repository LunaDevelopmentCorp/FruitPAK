"""Add box_size_id and box_size_name to pallets table.

Revision ID: 0015
Revises: 0014
Create Date: 2026-02-18
"""

revision = "0015"
down_revision = "0014"
branch_labels = None
depends_on = None

from alembic import op
import sqlalchemy as sa


def upgrade() -> None:
    op.add_column("pallets", sa.Column("box_size_id", sa.String(36), nullable=True))
    op.add_column("pallets", sa.Column("box_size_name", sa.String(100), nullable=True))
    op.create_foreign_key(
        "fk_pallets_box_size_id",
        "pallets",
        "box_sizes",
        ["box_size_id"],
        ["id"],
    )
    op.create_index("ix_pallets_box_size_id", "pallets", ["box_size_id"])


def downgrade() -> None:
    op.drop_index("ix_pallets_box_size_id", table_name="pallets")
    op.drop_constraint("fk_pallets_box_size_id", "pallets", type_="foreignkey")
    op.drop_column("pallets", "box_size_name")
    op.drop_column("pallets", "box_size_id")
