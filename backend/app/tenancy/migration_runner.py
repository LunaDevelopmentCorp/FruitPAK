"""Multi-tenant migration runner.

Loops over every active enterprise in the public schema and runs
`alembic upgrade head` against each tenant's schema.

Usage (inside the Docker container):
    docker compose exec backend python -m app.tenancy.migration_runner

SAFETY:
    Always take a database backup before running bulk migrations:

        pg_dump -Fc -h localhost -U fruitpak fruitpak > backup_$(date +%Y%m%d_%H%M%S).dump

    To restore:
        pg_restore -h localhost -U fruitpak -d fruitpak backup_XXXXXXXX_XXXXXX.dump

Rollback (single step, per-tenant):
    alembic -x schema=tenant -x tenant_schema=tenant_XXXXX downgrade -1
"""

import subprocess
import sys
from pathlib import Path

from sqlalchemy import create_engine, select, text

from app.config import settings
from app.models.public.enterprise import Enterprise

# Alembic project root (where alembic.ini lives)
_BACKEND_DIR = Path(__file__).resolve().parent.parent.parent


def _get_all_tenant_schemas() -> list[str]:
    """Fetch all active tenant_schema values from the public enterprises table."""
    engine = create_engine(settings.database_url_sync)
    with engine.connect() as conn:
        conn.execute(text("SET search_path TO public"))
        rows = conn.execute(
            select(Enterprise.tenant_schema).where(Enterprise.is_active.is_(True))
        ).fetchall()
    engine.dispose()
    return [row[0] for row in rows]


def _run_alembic(tenant_schema: str, direction: str = "upgrade", target: str = "head") -> bool:
    """Run alembic upgrade/downgrade for a single tenant schema.

    Returns True on success, False on failure.
    """
    cmd = [
        sys.executable, "-m", "alembic",
        "-x", "schema=tenant",
        "-x", f"tenant_schema={tenant_schema}",
        direction, target,
    ]
    result = subprocess.run(cmd, cwd=_BACKEND_DIR, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"  FAILED: {result.stderr.strip()}")
        return False
    return True


def _migrate_all(direction: str, target: str) -> None:
    """Run alembic upgrade/downgrade for all active tenant schemas."""
    schemas = _get_all_tenant_schemas()
    if not schemas:
        print("No active tenant schemas found.")
        return

    print(f"Found {len(schemas)} active tenant schema(s).\n")

    succeeded, failed = 0, 0
    for schema in schemas:
        print(f"[{direction}] {schema} ...", end=" ", flush=True)
        if _run_alembic(schema, direction, target):
            print("OK")
            succeeded += 1
        else:
            failed += 1

    print(f"\nDone: {succeeded} succeeded, {failed} failed out of {len(schemas)}.")
    if failed:
        sys.exit(1)


def upgrade_all_tenants(target: str = "head") -> None:
    """Run `alembic upgrade head` for every active tenant schema."""
    _migrate_all("upgrade", target)


def downgrade_all_tenants(target: str = "-1") -> None:
    """Roll back one migration step for every active tenant schema."""
    _migrate_all("downgrade", target)


if __name__ == "__main__":
    import argparse

    parser = argparse.ArgumentParser(description="Run Alembic migrations for all tenant schemas")
    parser.add_argument(
        "action",
        nargs="?",
        default="upgrade",
        choices=["upgrade", "downgrade"],
        help="Migration direction (default: upgrade)",
    )
    parser.add_argument(
        "--target",
        default=None,
        help="Alembic target revision (default: 'head' for upgrade, '-1' for downgrade)",
    )
    args = parser.parse_args()

    target = args.target or ("head" if args.action == "upgrade" else "-1")
    print(f"=== {args.action.title()} all tenant schemas → {target} ===")
    print("REMINDER: Ensure you have a database backup before proceeding.\n")

    if args.action == "upgrade":
        upgrade_all_tenants(target)
    else:
        downgrade_all_tenants(target)
