"""Add platform_admin to userrole enum.

Revision ID: 0022
Revises: 0021
"""
from alembic import op

revision = "0022"
down_revision = "0021"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # The enum may have uppercase or lowercase labels depending on how it was created.
    # Try uppercase first (create_all), fall back to lowercase (alembic migrations).
    from sqlalchemy import text
    conn = op.get_bind()
    result = conn.execute(text(
        "SELECT enumlabel FROM pg_enum JOIN pg_type ON pg_enum.enumtypid = pg_type.oid "
        "WHERE pg_type.typname = 'userrole' LIMIT 1"
    ))
    row = result.fetchone()
    if row and row[0].isupper():
        op.execute("ALTER TYPE userrole ADD VALUE IF NOT EXISTS 'PLATFORM_ADMIN' BEFORE 'ADMINISTRATOR'")
    else:
        op.execute("ALTER TYPE userrole ADD VALUE IF NOT EXISTS 'platform_admin' BEFORE 'administrator'")


def downgrade() -> None:
    # PostgreSQL doesn't support removing enum values; would need to recreate the type.
    pass
