"""Add shipping_schedules table and FK on exports.

TENANT MIGRATION — run via: python -m app.tenancy.migration_runner

Revision ID: 0027
Revises: 0026
"""

from alembic import op

revision = "0027"
down_revision = "0026"


def upgrade():
    op.execute("""
        CREATE TABLE IF NOT EXISTS shipping_schedules (
            id VARCHAR(36) NOT NULL PRIMARY KEY,
            shipping_line VARCHAR(100) NOT NULL,
            vessel_name VARCHAR(255) NOT NULL,
            voyage_number VARCHAR(100) NOT NULL,
            port_of_loading VARCHAR(255) NOT NULL,
            port_of_discharge VARCHAR(255) NOT NULL,
            etd DATE NOT NULL,
            eta DATE NOT NULL,
            booking_cutoff DATE,
            cargo_cutoff DATE,
            status VARCHAR(30) DEFAULT 'scheduled' NOT NULL,
            source VARCHAR(20) DEFAULT 'manual' NOT NULL,
            notes TEXT,
            is_deleted BOOLEAN DEFAULT false NOT NULL,
            created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL,
            updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL
        )
    """)

    op.execute("CREATE INDEX IF NOT EXISTS ix_shipping_schedules_shipping_line ON shipping_schedules (shipping_line)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_shipping_schedules_port_of_loading ON shipping_schedules (port_of_loading)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_shipping_schedules_port_of_discharge ON shipping_schedules (port_of_discharge)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_shipping_schedules_etd ON shipping_schedules (etd)")
    op.execute("CREATE INDEX IF NOT EXISTS ix_shipping_schedules_status ON shipping_schedules (status)")

    op.execute("""
        ALTER TABLE exports ADD COLUMN IF NOT EXISTS shipping_schedule_id VARCHAR(36)
            REFERENCES shipping_schedules(id)
    """)
    op.execute("CREATE INDEX IF NOT EXISTS ix_exports_shipping_schedule_id ON exports (shipping_schedule_id)")


def downgrade():
    op.execute("DROP INDEX IF EXISTS ix_exports_shipping_schedule_id")
    op.execute("ALTER TABLE exports DROP COLUMN IF EXISTS shipping_schedule_id")
    op.execute("DROP TABLE IF EXISTS shipping_schedules")
