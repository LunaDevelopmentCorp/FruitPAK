"""Convert batch_history to a TimescaleDB hypertable.

Revision ID: 0004
Revises: 0003
Create Date: 2026-02-10

TimescaleDB must be installed as a PostgreSQL extension (already in our
docker-compose via the timescale/timescaledb image).  The hypertable
enables automatic time-based partitioning and efficient range queries
on the batch_history event log.
"""

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None

from alembic import op


def upgrade() -> None:
    # Ensure TimescaleDB extension is available
    op.execute("CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE")

    # Convert batch_history into a hypertable partitioned on recorded_at.
    # migrate_data => true handles any rows already present.
    # if_not_exists => true makes it safe to re-run.
    op.execute(
        "SELECT create_hypertable('batch_history', 'recorded_at', "
        "migrate_data => true, if_not_exists => true)"
    )


def downgrade() -> None:
    # TimescaleDB does not support converting a hypertable back to a
    # regular table.  The table structure remains intact; you simply
    # lose the automatic chunking benefits if the extension is removed.
    pass
