"""Add completed_data column to wizard_state.

Revision ID: 0006
Revises: 0005
Create Date: 2026-02-10

Stores each step's submitted data when marked complete, allowing
forms to reload saved values when revisiting completed steps.
"""

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None

import sqlalchemy as sa
from alembic import op


def upgrade() -> None:
    op.add_column(
        "wizard_state",
        sa.Column("completed_data", sa.JSON(), server_default="{}", nullable=False),
    )


def downgrade() -> None:
    op.drop_column("wizard_state", "completed_data")
