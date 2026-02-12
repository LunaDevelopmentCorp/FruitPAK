"""Add missing indexes and TimescaleDB hypertable for batch_history.

New indexes:
  - batches.grower_id
  - batches.harvest_date
  - grower_payments.grower_id
  - grower_payments.paid_date

TimescaleDB:
  - Convert batch_history to hypertable (partitioned by recorded_at)
  - Enable compression after 30 days
  - Add retention policy to drop chunks older than 2 years

Revision ID: 0003
Revises: 0002
Create Date: 2026-02-12
"""

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None

from alembic import op
from sqlalchemy import text


def upgrade() -> None:
    # ── New indexes on batches ────────────────────────────────
    op.create_index("ix_batch_grower_id", "batches", ["grower_id"])
    op.create_index("ix_batch_harvest_date", "batches", ["harvest_date"])

    # ── New indexes on grower_payments ────────────────────────
    op.create_index("ix_grower_payment_grower_id", "grower_payments", ["grower_id"])
    op.create_index("ix_grower_payment_paid_date", "grower_payments", ["paid_date"])

    # ── TimescaleDB: convert batch_history to hypertable ──────
    # Requires the TimescaleDB extension (already enabled in our image).
    # create_hypertable partitions by recorded_at for fast time-range queries.
    # migrate_data => true moves existing rows into the new chunked structure.
    conn = op.get_bind()
    conn.execute(text("CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE"))
    conn.execute(text(
        "SELECT create_hypertable('batch_history', 'recorded_at', "
        "migrate_data => true, if_not_exists => true)"
    ))

    # Enable compression on chunks older than 30 days
    conn.execute(text(
        "ALTER TABLE batch_history SET ("
        "  timescaledb.compress,"
        "  timescaledb.compress_segmentby = 'batch_id',"
        "  timescaledb.compress_orderby = 'recorded_at DESC'"
        ")"
    ))
    conn.execute(text(
        "SELECT add_compression_policy('batch_history', "
        "INTERVAL '30 days', if_not_exists => true)"
    ))

    # Drop chunks older than 2 years
    conn.execute(text(
        "SELECT add_retention_policy('batch_history', "
        "INTERVAL '2 years', if_not_exists => true)"
    ))


def downgrade() -> None:
    # ── Remove TimescaleDB policies ───────────────────────────
    conn = op.get_bind()
    conn.execute(text(
        "SELECT remove_retention_policy('batch_history', if_exists => true)"
    ))
    conn.execute(text(
        "SELECT remove_compression_policy('batch_history', if_exists => true)"
    ))
    # Note: Cannot revert hypertable back to regular table.
    # To fully undo, drop and recreate the table.

    # ── Drop indexes ──────────────────────────────────────────
    op.drop_index("ix_grower_payment_paid_date", table_name="grower_payments")
    op.drop_index("ix_grower_payment_grower_id", table_name="grower_payments")
    op.drop_index("ix_batch_harvest_date", table_name="batches")
    op.drop_index("ix_batch_grower_id", table_name="batches")
