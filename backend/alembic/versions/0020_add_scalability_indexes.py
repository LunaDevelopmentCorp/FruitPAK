"""Add scalability indexes for high-volume packhouse operations.

TENANT MIGRATION — run via: python -m app.tenancy.migration_runner

Indexes added:
  - batches.created_at (list_batches ORDER BY)
  - batches.harvest_team_id (filter by harvest team)
  - pallet_lots (lot_id, is_deleted) composite (allocation queries)
  - pallets.created_at (list_pallets ORDER BY)
  - lots.created_at (list_lots ORDER BY)

Revision ID: 0020
Revises: 0019
"""

from alembic import op
import sqlalchemy as sa

revision = "0020"
down_revision = "0019"
branch_labels = None
depends_on = None


def _index_exists(conn, index_name):
    """Check if an index exists in the current search_path."""
    result = conn.execute(sa.text(
        "SELECT 1 FROM pg_indexes WHERE indexname = :name"
    ), {"name": index_name})
    return result.fetchone() is not None


def _table_exists(conn, table_name):
    """Check if a table exists in the current search_path."""
    result = conn.execute(sa.text(
        "SELECT 1 FROM information_schema.tables "
        "WHERE table_name = :name AND table_schema = current_schema()"
    ), {"name": table_name})
    return result.fetchone() is not None


def upgrade() -> None:
    conn = op.get_bind()

    # Guard: skip if tenant tables don't exist (e.g. running against public schema)
    if not _table_exists(conn, "batches"):
        return

    # batches.created_at — used by ORDER BY in list_batches
    if not _index_exists(conn, "ix_batches_created_at"):
        op.create_index(
            "ix_batches_created_at",
            "batches",
            ["created_at"],
        )

    # batches.harvest_team_id — used as filter, no index existed
    if not _index_exists(conn, "ix_batches_harvest_team_id"):
        op.create_index(
            "ix_batches_harvest_team_id",
            "batches",
            ["harvest_team_id"],
        )

    # pallet_lots (lot_id, is_deleted) — allocation queries always filter both
    if not _index_exists(conn, "ix_pallet_lots_lot_id_active"):
        op.create_index(
            "ix_pallet_lots_lot_id_active",
            "pallet_lots",
            ["lot_id", "is_deleted"],
        )

    # pallets.created_at — used by ORDER BY in list_pallets
    if not _index_exists(conn, "ix_pallets_created_at"):
        op.create_index(
            "ix_pallets_created_at",
            "pallets",
            ["created_at"],
        )

    # lots.created_at — used by ORDER BY in list_lots
    if not _index_exists(conn, "ix_lots_created_at"):
        op.create_index(
            "ix_lots_created_at",
            "lots",
            ["created_at"],
        )


def downgrade() -> None:
    conn = op.get_bind()

    # Guard: skip if tenant tables don't exist
    if not _table_exists(conn, "batches"):
        return

    if _index_exists(conn, "ix_lots_created_at"):
        op.drop_index("ix_lots_created_at", table_name="lots")
    if _index_exists(conn, "ix_pallets_created_at"):
        op.drop_index("ix_pallets_created_at", table_name="pallets")
    if _index_exists(conn, "ix_pallet_lots_lot_id_active"):
        op.drop_index("ix_pallet_lots_lot_id_active", table_name="pallet_lots")
    if _index_exists(conn, "ix_batches_harvest_team_id"):
        op.drop_index("ix_batches_harvest_team_id", table_name="batches")
    if _index_exists(conn, "ix_batches_created_at"):
        op.drop_index("ix_batches_created_at", table_name="batches")
