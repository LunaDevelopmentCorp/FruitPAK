"""Add harvest_team_payments table.

Revision ID: 0019
Revises: 0018
"""

from alembic import op
import sqlalchemy as sa

revision = "0019"
down_revision = "0018"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "harvest_team_payments",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("payment_ref", sa.String(50), unique=True, nullable=False, index=True),
        sa.Column("harvest_team_id", sa.String(36), sa.ForeignKey("harvest_teams.id"), nullable=False, index=True),
        sa.Column("batch_ids", sa.JSON, server_default="[]"),
        sa.Column("currency", sa.String(3), server_default="ZAR"),
        sa.Column("amount", sa.Float, nullable=False),
        sa.Column("total_kg", sa.Float, nullable=True),
        sa.Column("total_bins", sa.Integer, nullable=True),
        sa.Column("payment_date", sa.Date, nullable=True, index=True),
        sa.Column("payment_type", sa.String(20), server_default="advance"),
        sa.Column("status", sa.String(30), server_default="paid", index=True),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("is_deleted", sa.Boolean, server_default="false"),
        sa.Column("created_at", sa.DateTime, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime, server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("harvest_team_payments")
