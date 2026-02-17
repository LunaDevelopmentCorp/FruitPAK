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
    conn = op.get_bind()
    result = conn.execute(sa.text(
        "SELECT 1 FROM information_schema.columns "
        "WHERE table_name='grower_payments' AND column_name='payment_type'"
    ))
    if not result.fetchone():
        op.add_column(
            "grower_payments",
            sa.Column("payment_type", sa.String(20), server_default="final", nullable=False),
        )


def downgrade() -> None:
    op.drop_column("grower_payments", "payment_type")
