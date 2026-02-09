"""Management CLI for tenant operations.

Usage:
    python -m app.cli migrate-tenants     # Run Alembic on every tenant schema
    python -m app.cli list-tenants        # Show all tenant schemas
"""

import subprocess
import sys

from sqlalchemy import create_engine, select, text

from app.config import settings
from app.database import PublicBase
from app.models.public.enterprise import Enterprise


def get_tenant_schemas() -> list[str]:
    engine = create_engine(settings.database_url_sync)
    with engine.connect() as conn:
        result = conn.execute(select(Enterprise.tenant_schema))
        return [row[0] for row in result]


def migrate_tenants():
    """Run Alembic upgrade head against every tenant schema."""
    schemas = get_tenant_schemas()
    if not schemas:
        print("No tenant schemas found.")
        return

    for schema in schemas:
        print(f"  Migrating {schema}...")
        result = subprocess.run(
            [
                sys.executable, "-m", "alembic", "upgrade", "head",
                "-x", "schema=tenant",
                "-x", f"tenant_schema={schema}",
            ],
            capture_output=True, text=True,
        )
        if result.returncode != 0:
            print(f"  FAILED: {result.stderr}")
        else:
            print(f"  OK")


def list_tenants():
    schemas = get_tenant_schemas()
    for s in schemas:
        print(f"  {s}")
    print(f"\n{len(schemas)} tenant(s)")


if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else ""
    if cmd == "migrate-tenants":
        migrate_tenants()
    elif cmd == "list-tenants":
        list_tenants()
    else:
        print("Usage: python -m app.cli [migrate-tenants|list-tenants]")
