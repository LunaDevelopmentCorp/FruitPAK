"""Add harvest_rate_per_kg to batches for variable per-batch pricing.

TENANT MIGRATION — run via: python -m app.tenancy.migration_runner

Revision ID: 0029
Revises: 0028
"""

from alembic import op

revision = "0029"
down_revision = "0028"


def upgrade():
    op.execute("ALTER TABLE batches ADD COLUMN IF NOT EXISTS harvest_rate_per_kg FLOAT")


def downgrade():
    op.execute("ALTER TABLE batches DROP COLUMN IF EXISTS harvest_rate_per_kg")
