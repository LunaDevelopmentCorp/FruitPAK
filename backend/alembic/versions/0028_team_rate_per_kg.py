"""Add rate_per_kg and rate_currency to harvest_teams.

TENANT MIGRATION — run via: python -m app.tenancy.migration_runner

Revision ID: 0028
Revises: 0027
"""

from alembic import op

revision = "0028"
down_revision = "0027"


def upgrade():
    op.execute("ALTER TABLE harvest_teams ADD COLUMN IF NOT EXISTS rate_per_kg FLOAT")
    op.execute("ALTER TABLE harvest_teams ADD COLUMN IF NOT EXISTS rate_currency VARCHAR(3) DEFAULT 'ZAR'")


def downgrade():
    op.execute("ALTER TABLE harvest_teams DROP COLUMN IF EXISTS rate_currency")
    op.execute("ALTER TABLE harvest_teams DROP COLUMN IF EXISTS rate_per_kg")
