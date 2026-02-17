"""Add box_size_id FK to lots table.

Revision ID: 0010
Revises: 0009
Create Date: 2026-02-17

Links each lot to the box size used for packing, enabling automatic
weight calculation and packaging stock tracking.
"""

revision = "0010"
down_revision = "0009"
branch_labels = None
depends_on = None

from alembic import op
import sqlalchemy as sa


def upgrade() -> None:
    op.add_column(
        "lots",
        sa.Column("box_size_id", sa.String(36), nullable=True),
    )
    op.create_foreign_key(
        "fk_lots_box_size_id",
        "lots",
        "box_sizes",
        ["box_size_id"],
        ["id"],
    )


def downgrade() -> None:
    op.drop_constraint("fk_lots_box_size_id", "lots", type_="foreignkey")
    op.drop_column("lots", "box_size_id")
