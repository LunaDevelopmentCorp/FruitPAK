"""Add is_onboarded column to enterprises table.

Revision ID: 0003
Revises: 0002
Create Date: 2026-02-10
"""

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None

from alembic import op
import sqlalchemy as sa


def upgrade() -> None:
    op.add_column(
        "enterprises",
        sa.Column("is_onboarded", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        schema="public",
    )


def downgrade() -> None:
    op.drop_column("enterprises", "is_onboarded", schema="public")
