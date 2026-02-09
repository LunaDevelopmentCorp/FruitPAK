"""Add reconciliation_alerts table to tenant schemas.

Revision ID: 0002
Revises: 0001
Create Date: 2026-02-09
"""

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None

from alembic import op
import sqlalchemy as sa


def upgrade() -> None:
    op.create_table(
        "reconciliation_alerts",
        sa.Column("id", sa.String(36), primary_key=True),
        # Classification
        sa.Column("alert_type", sa.String(50), nullable=False),
        sa.Column("severity", sa.String(20), nullable=False),
        # Mismatch details
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("expected_value", sa.Float()),
        sa.Column("actual_value", sa.Float()),
        sa.Column("variance", sa.Float()),
        sa.Column("variance_pct", sa.Float()),
        sa.Column("unit", sa.String(20)),
        # Entity references
        sa.Column("entity_refs", sa.JSON()),
        # Period
        sa.Column("period_start", sa.DateTime()),
        sa.Column("period_end", sa.DateTime()),
        # Status
        sa.Column("status", sa.String(20), server_default="open"),
        sa.Column("resolved_at", sa.DateTime()),
        sa.Column("resolved_by", sa.String(36)),
        sa.Column("resolution_note", sa.Text()),
        # Run metadata
        sa.Column("run_id", sa.String(36)),
        sa.Column("is_deleted", sa.Boolean(), server_default="false"),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_index("ix_recon_alerts_alert_type", "reconciliation_alerts", ["alert_type"])
    op.create_index("ix_recon_alerts_severity", "reconciliation_alerts", ["severity"])
    op.create_index("ix_recon_alerts_status", "reconciliation_alerts", ["status"])
    op.create_index("ix_recon_alerts_run_id", "reconciliation_alerts", ["run_id"])


def downgrade() -> None:
    op.drop_table("reconciliation_alerts")
