"""Make gross_weight_kg nullable on batches table.

Revision ID: 0005
Revises: 0004
Create Date: 2026-02-10

Packhouses that receive by unit count (bins/crates) may not weigh
fruit at intake.  Weight can be added retrospectively after pack-out.
"""

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None

from alembic import op


def upgrade() -> None:
    op.alter_column(
        "batches",
        "gross_weight_kg",
        nullable=True,
    )


def downgrade() -> None:
    # Set any NULLs to 0 before re-adding the constraint
    op.execute("UPDATE batches SET gross_weight_kg = 0 WHERE gross_weight_kg IS NULL")
    op.alter_column(
        "batches",
        "gross_weight_kg",
        nullable=False,
    )
