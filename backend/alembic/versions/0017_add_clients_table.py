"""Add clients table and container shipping_container_number + client_id.

Revision ID: 0017
Revises: 0016
Create Date: 2026-02-19
"""

revision = "0017"
down_revision = "0016"
branch_labels = None
depends_on = None

from alembic import op
import sqlalchemy as sa


def upgrade() -> None:
    # Create clients table (IF NOT EXISTS for idempotency)
    op.execute("""
        CREATE TABLE IF NOT EXISTS clients (
            id VARCHAR(36) NOT NULL PRIMARY KEY,
            name VARCHAR(255) NOT NULL UNIQUE,
            contact_person VARCHAR(255),
            email VARCHAR(255),
            phone VARCHAR(100),
            address TEXT,
            country VARCHAR(100),
            incoterm VARCHAR(10),
            payment_terms_days INTEGER,
            currency VARCHAR(3),
            credit_limit FLOAT,
            outstanding_balance FLOAT DEFAULT 0 NOT NULL,
            notes TEXT,
            is_active BOOLEAN DEFAULT true NOT NULL,
            created_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL,
            updated_at TIMESTAMP WITHOUT TIME ZONE DEFAULT now() NOT NULL
        )
    """)

    # Add client_id and shipping_container_number to containers (IF NOT EXISTS)
    op.execute("""
        ALTER TABLE containers ADD COLUMN IF NOT EXISTS client_id VARCHAR(36) REFERENCES clients(id)
    """)
    op.execute("""
        ALTER TABLE containers ADD COLUMN IF NOT EXISTS shipping_container_number VARCHAR(100)
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_containers_client_id ON containers (client_id)
    """)


def downgrade() -> None:
    op.drop_index("ix_containers_client_id", table_name="containers")
    op.drop_column("containers", "shipping_container_number")
    op.drop_column("containers", "client_id")
    op.drop_table("clients")
