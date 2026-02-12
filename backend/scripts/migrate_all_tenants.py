#!/usr/bin/env python
"""Migrate all tenant schemas to the latest Alembic revision.

This script:
1. Connects to the database
2. Finds all tenant schemas (tenant_*)
3. Switches to each schema and runs `alembic upgrade head`
4. Reports success/failure for each tenant

Usage:
    python scripts/migrate_all_tenants.py
    python scripts/migrate_all_tenants.py --schema tenant_abc123
    python scripts/migrate_all_tenants.py --yes

Environment variables:
    DATABASE_URL - PostgreSQL connection string
"""

import argparse
import asyncio
import os
import sys
from datetime import datetime
from pathlib import Path

# Add parent directory to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine

from app.config import settings
from app.tenancy import set_search_path


async def get_all_tenant_schemas(engine):
    """Fetch all tenant schema names from the database."""
    async with engine.connect() as conn:
        result = await conn.execute(
            text(
                """
                SELECT schema_name
                FROM information_schema.schemata
                WHERE schema_name LIKE 'tenant_%'
                ORDER BY schema_name
                """
            )
        )
        return [row[0] for row in result]


async def migrate_tenant_schema(engine, schema_name: str):
    """Run alembic upgrade for a single tenant schema."""
    from alembic import command
    from alembic.config import Config

    # Configure Alembic
    alembic_cfg = Config("alembic.ini")
    alembic_cfg.set_main_option("sqlalchemy.url", str(engine.url))

    # Set the schema in Alembic's environment
    # This is done by temporarily setting the search_path
    async with engine.connect() as conn:
        try:
            # Switch to tenant schema
            await conn.execute(text(f"SET search_path TO {schema_name}, public"))
            await conn.commit()

            print(f"  ✓ Search path set to {schema_name}")

            # Run migration (this will use the current search_path)
            # Note: This is a synchronous operation but Alembic handles it
            command.upgrade(alembic_cfg, "head")

            print(f"  ✓ Migration completed for {schema_name}")
            return True

        except Exception as e:
            print(f"  ✗ Error migrating {schema_name}: {e}")
            return False


async def main():
    """Main migration orchestration."""
    # Parse arguments
    parser = argparse.ArgumentParser(description="Migrate tenant schemas")
    parser.add_argument(
        "--schema",
        help="Migrate only this specific schema",
    )
    parser.add_argument(
        "--yes", "-y",
        action="store_true",
        help="Skip confirmation prompt",
    )
    args = parser.parse_args()

    print("=" * 70)
    print("  FruitPAK Multi-Tenant Migration Runner")
    print("=" * 70)
    print()

    # Create async engine
    engine = create_async_engine(
        settings.database_url,
        echo=False,
        pool_pre_ping=True,
    )

    try:
        # Get tenant schemas
        if args.schema:
            # Single schema mode
            tenant_schemas = [args.schema]
            print(f"📋 Migrating single schema: {args.schema}")
        else:
            # Multi-tenant mode
            print("📋 Fetching tenant schemas...")
            tenant_schemas = await get_all_tenant_schemas(engine)

            if not tenant_schemas:
                print("⚠️  No tenant schemas found (tenant_*)")
                return

            print(f"✓ Found {len(tenant_schemas)} tenant schema(s):")
            for schema in tenant_schemas:
                print(f"  - {schema}")

        print()

        # Confirm before proceeding
        if not args.yes:
            print("⚠️  IMPORTANT: Always backup your database before running migrations!")
            print()
            response = input("Continue with migration? [y/N]: ")
            if response.lower() != "y":
                print("Migration cancelled.")
                return

        print()
        print("🚀 Starting migrations...")
        print()

        # Track results
        results = {}
        start_time = datetime.now()

        # Migrate each tenant
        for schema in tenant_schemas:
            print(f"📦 Migrating {schema}...")
            success = await migrate_tenant_schema(engine, schema)
            results[schema] = success
            print()

        # Summary
        end_time = datetime.now()
        duration = (end_time - start_time).total_seconds()

        print("=" * 70)
        print("  Migration Summary")
        print("=" * 70)
        print()

        successful = sum(1 for v in results.values() if v)
        failed = len(results) - successful

        print(f"✓ Successful: {successful}/{len(results)}")
        print(f"✗ Failed:     {failed}/{len(results)}")
        print(f"⏱  Duration:   {duration:.2f}s")
        print()

        if failed > 0:
            print("Failed schemas:")
            for schema, success in results.items():
                if not success:
                    print(f"  - {schema}")
            print()

        # Reset search path
        async with engine.connect() as conn:
            await conn.execute(text("SET search_path TO public"))
            await conn.commit()

        print("✓ All done!")

    finally:
        await engine.dispose()


if __name__ == "__main__":
    asyncio.run(main())
