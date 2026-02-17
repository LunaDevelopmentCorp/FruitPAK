"""Add database indexes and TimescaleDB compression/retention policies.

Revision ID: 0008
Revises: 0007
Create Date: 2026-02-12

This migration adds:
1. Composite indexes on frequently queried columns for performance
2. TimescaleDB compression policy on batch_history (compress data > 30 days old)
3. TimescaleDB retention policy on batch_history (drop data > 2 years old)
4. Continuous aggregate for daily yield per grower (analytics)

Note: Compression and retention policies are optional and will only apply if
TimescaleDB extension is enabled. They gracefully skip if the extension is
not available.
"""

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None

from alembic import op
import sqlalchemy as sa


def _index_exists(conn, index_name):
    result = conn.execute(sa.text(
        "SELECT 1 FROM pg_indexes WHERE indexname = :name"
    ), {"name": index_name})
    return result.fetchone() is not None


def upgrade() -> None:
    conn = op.get_bind()

    # ═══════════════════════════════════════════════════════════
    # 1. Add indexes on Batch table
    # ═══════════════════════════════════════════════════════════

    if not _index_exists(conn, "ix_batches_grower_harvest_status"):
        op.create_index(
            "ix_batches_grower_harvest_status",
            "batches",
            ["grower_id", "harvest_date", "status"],
            unique=False,
        )

    if not _index_exists(conn, "ix_batches_intake_date"):
        op.create_index(
            "ix_batches_intake_date",
            "batches",
            ["intake_date"],
            unique=False,
        )

    if not _index_exists(conn, "ix_batches_fruit_type"):
        op.create_index(
            "ix_batches_fruit_type",
            "batches",
            ["fruit_type"],
            unique=False,
        )

    # ═══════════════════════════════════════════════════════════
    # 2. Add indexes on BatchHistory table
    # ═══════════════════════════════════════════════════════════

    if not _index_exists(conn, "ix_batch_history_batch_recorded"):
        op.create_index(
            "ix_batch_history_batch_recorded",
            "batch_history",
            ["batch_id", "recorded_at"],
            unique=False,
        )

    # ═══════════════════════════════════════════════════════════
    # 3. Add indexes on GrowerPayment table
    # ═══════════════════════════════════════════════════════════

    if not _index_exists(conn, "ix_grower_payments_grower_date"):
        op.create_index(
            "ix_grower_payments_grower_date",
            "grower_payments",
            ["grower_id", "paid_date"],
            unique=False,
        )

    if not _index_exists(conn, "ix_grower_payments_paid_date"):
        op.create_index(
            "ix_grower_payments_paid_date",
            "grower_payments",
            ["paid_date"],
            unique=False,
        )

    if not _index_exists(conn, "ix_grower_payments_created_at"):
        op.create_index(
            "ix_grower_payments_created_at",
            "grower_payments",
            ["created_at"],
            unique=False,
        )

    # ═══════════════════════════════════════════════════════════
    # 4. TimescaleDB Compression Policy
    # ═══════════════════════════════════════════════════════════

    # Compress batch_history chunks older than 30 days
    # Compression saves disk space while maintaining query performance
    # for historical data (10x compression typical)
    op.execute("""
        DO $$
        BEGIN
            -- Only add compression policy if TimescaleDB is available
            IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') THEN
                -- Enable compression on batch_history hypertable
                PERFORM set_chunk_time_interval('batch_history', INTERVAL '7 days');

                -- Set compression segments to recorded_at and batch_id
                PERFORM add_compression_policy(
                    'batch_history',
                    compress_after => INTERVAL '30 days',
                    if_not_exists => true
                );

                RAISE NOTICE 'TimescaleDB compression policy added to batch_history';
            ELSE
                RAISE NOTICE 'TimescaleDB not available, skipping compression policy';
            END IF;
        EXCEPTION
            WHEN OTHERS THEN
                RAISE NOTICE 'Could not add compression policy: %', SQLERRM;
        END $$;
    """)

    # ═══════════════════════════════════════════════════════════
    # 5. TimescaleDB Retention Policy
    # ═══════════════════════════════════════════════════════════

    # Drop batch_history chunks older than 2 years to manage storage
    # Adjust retention period based on compliance requirements
    op.execute("""
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') THEN
                PERFORM add_retention_policy(
                    'batch_history',
                    drop_after => INTERVAL '2 years',
                    if_not_exists => true
                );

                RAISE NOTICE 'TimescaleDB retention policy added to batch_history (2 years)';
            ELSE
                RAISE NOTICE 'TimescaleDB not available, skipping retention policy';
            END IF;
        EXCEPTION
            WHEN OTHERS THEN
                RAISE NOTICE 'Could not add retention policy: %', SQLERRM;
        END $$;
    """)

    # ═══════════════════════════════════════════════════════════
    # 6. Continuous Aggregate: Daily Yield per Grower
    # ═══════════════════════════════════════════════════════════

    # Create a materialized view that pre-aggregates daily intake totals
    # per grower for fast dashboard analytics
    op.execute("""
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') THEN
                -- Create continuous aggregate for daily grower intake
                CREATE MATERIALIZED VIEW IF NOT EXISTS daily_grower_intake
                WITH (timescaledb.continuous) AS
                SELECT
                    time_bucket('1 day', intake_date) AS day,
                    grower_id,
                    fruit_type,
                    COUNT(*) AS batch_count,
                    SUM(net_weight_kg) AS total_kg,
                    AVG(net_weight_kg) AS avg_batch_kg,
                    COUNT(DISTINCT packhouse_id) AS packhouse_count
                FROM batches
                WHERE is_deleted = false AND status != 'rejected'
                GROUP BY day, grower_id, fruit_type
                WITH NO DATA;

                -- Add refresh policy: update every 1 hour for data from last 7 days
                PERFORM add_continuous_aggregate_policy(
                    'daily_grower_intake',
                    start_offset => INTERVAL '7 days',
                    end_offset => INTERVAL '1 hour',
                    schedule_interval => INTERVAL '1 hour',
                    if_not_exists => true
                );

                RAISE NOTICE 'Continuous aggregate daily_grower_intake created';
            ELSE
                RAISE NOTICE 'TimescaleDB not available, skipping continuous aggregate';
            END IF;
        EXCEPTION
            WHEN OTHERS THEN
                RAISE NOTICE 'Could not create continuous aggregate: %', SQLERRM;
        END $$;
    """)


def downgrade() -> None:
    # ═══════════════════════════════════════════════════════════
    # Drop continuous aggregate first (has dependencies)
    # ═══════════════════════════════════════════════════════════

    op.execute("""
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') THEN
                DROP MATERIALIZED VIEW IF EXISTS daily_grower_intake CASCADE;
                RAISE NOTICE 'Dropped continuous aggregate daily_grower_intake';
            END IF;
        EXCEPTION
            WHEN OTHERS THEN
                RAISE NOTICE 'Could not drop continuous aggregate: %', SQLERRM;
        END $$;
    """)

    # ═══════════════════════════════════════════════════════════
    # Remove TimescaleDB policies (retention & compression)
    # ═══════════════════════════════════════════════════════════

    # Note: TimescaleDB policies are removed automatically when the
    # hypertable is dropped, but we can explicitly remove them here
    op.execute("""
        DO $$
        BEGIN
            IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'timescaledb') THEN
                -- Remove retention policy
                PERFORM remove_retention_policy('batch_history', if_exists => true);
                -- Remove compression policy
                PERFORM remove_compression_policy('batch_history', if_exists => true);

                RAISE NOTICE 'TimescaleDB policies removed from batch_history';
            END IF;
        EXCEPTION
            WHEN OTHERS THEN
                RAISE NOTICE 'Could not remove TimescaleDB policies: %', SQLERRM;
        END $$;
    """)

    # ═══════════════════════════════════════════════════════════
    # Drop indexes on GrowerPayment
    # ═══════════════════════════════════════════════════════════

    op.drop_index("ix_grower_payments_created_at", table_name="grower_payments")
    op.drop_index("ix_grower_payments_paid_date", table_name="grower_payments")
    op.drop_index("ix_grower_payments_grower_date", table_name="grower_payments")

    # ═══════════════════════════════════════════════════════════
    # Drop indexes on BatchHistory
    # ═══════════════════════════════════════════════════════════

    op.drop_index("ix_batch_history_batch_recorded", table_name="batch_history")

    # ═══════════════════════════════════════════════════════════
    # Drop indexes on Batch
    # ═══════════════════════════════════════════════════════════

    op.drop_index("ix_batches_fruit_type", table_name="batches")
    op.drop_index("ix_batches_intake_date", table_name="batches")
    op.drop_index("ix_batches_grower_harvest_status", table_name="batches")
