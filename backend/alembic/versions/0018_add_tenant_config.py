"""Add tenant_config table and box_sizes specification columns.

Revision ID: 0018
Revises: 0017
Create Date: 2026-02-19
"""

revision = "0018"
down_revision = "0017"
branch_labels = None
depends_on = None

from alembic import op
import sqlalchemy as sa


def upgrade() -> None:
    # Create tenant_config table
    op.execute("""
        CREATE TABLE IF NOT EXISTS tenant_config (
            id VARCHAR(36) NOT NULL PRIMARY KEY,
            key VARCHAR(100) NOT NULL UNIQUE,
            value JSONB NOT NULL,
            updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL
        )
    """)

    # Add specification columns to box_sizes
    op.execute("ALTER TABLE box_sizes ADD COLUMN IF NOT EXISTS dimensions VARCHAR(100)")
    op.execute("ALTER TABLE box_sizes ADD COLUMN IF NOT EXISTS tare_weight_kg FLOAT DEFAULT 0")
    op.execute("ALTER TABLE box_sizes ADD COLUMN IF NOT EXISTS net_weight_target_kg FLOAT")
    op.execute("ALTER TABLE box_sizes ADD COLUMN IF NOT EXISTS min_weight_kg FLOAT")
    op.execute("ALTER TABLE box_sizes ADD COLUMN IF NOT EXISTS max_weight_kg FLOAT")


def downgrade() -> None:
    op.drop_column("box_sizes", "max_weight_kg")
    op.drop_column("box_sizes", "min_weight_kg")
    op.drop_column("box_sizes", "net_weight_target_kg")
    op.drop_column("box_sizes", "tare_weight_kg")
    op.drop_column("box_sizes", "dimensions")
    op.drop_table("tenant_config")
