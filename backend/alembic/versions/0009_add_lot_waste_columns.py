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
    conn = op.get_bind()
    result = conn.execute(sa.text(
        "SELECT column_name FROM information_schema.columns "
        "WHERE table_name='lots' AND column_name IN ('waste_kg', 'waste_reason')"
    ))
    existing = {row[0] for row in result.fetchall()}
    if "waste_kg" not in existing:
        op.add_column("lots", sa.Column("waste_kg", sa.Float(), nullable=False, server_default="0.0"))
    if "waste_reason" not in existing:
        op.add_column("lots", sa.Column("waste_reason", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("lots", "waste_reason")
    op.drop_column("lots", "waste_kg")
