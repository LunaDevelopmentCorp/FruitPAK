"""Add payment_type column to grower_payments.

Revision ID: 0007
Revises: 0006
"""

import sqlalchemy as sa
from alembic import op

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "grower_payments",
        sa.Column("payment_type", sa.String(20), server_default="final", nullable=False),
    )


def downgrade() -> None:
    op.drop_column("grower_payments", "payment_type")
