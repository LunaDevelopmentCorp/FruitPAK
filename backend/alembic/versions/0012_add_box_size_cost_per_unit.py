"""Add cost_per_unit to box_sizes table.

Revision ID: 0012
Revises: 0011
Create Date: 2026-02-17

Tracks the unit cost of each box size for packaging cost analysis.
"""

revision = "0012"
down_revision = "0011"
branch_labels = None
depends_on = None

from alembic import op
import sqlalchemy as sa


def upgrade() -> None:
    conn = op.get_bind()
    result = conn.execute(sa.text(
        "SELECT 1 FROM information_schema.columns "
        "WHERE table_name='box_sizes' AND column_name='cost_per_unit'"
    ))
    if not result.fetchone():
        op.add_column("box_sizes", sa.Column("cost_per_unit", sa.Float(), nullable=True))


def downgrade() -> None:
    op.drop_column("box_sizes", "cost_per_unit")
