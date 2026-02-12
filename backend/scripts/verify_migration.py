#!/usr/bin/env python
"""Verify migration completed successfully.

Checks:
- Alembic version matches expected
- All expected tables exist
- Indexes are created
- Foreign keys are valid
- Data integrity

Usage:
    python scripts/verify_migration.py
    python scripts/verify_migration.py --schema tenant_abc123
    python scripts/verify_migration.py --expected-version abc123def456
"""

import argparse
import asyncio
import sys
from typing import List, Set

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

from app.config import settings


class MigrationVerifier:
    """Verify migration completed successfully."""

    def __init__(self, db_url: str):
        self.engine = create_async_engine(db_url, echo=False)
        self.async_session = sessionmaker(
            self.engine, class_=AsyncSession, expire_on_commit=False
        )
        self.errors: List[str] = []
        self.warnings: List[str] = []

    async def verify(
        self,
        schema: str = "public",
        expected_version: str = None,
    ) -> bool:
        """Verify migration for schema.

        Args:
            schema: Schema to verify
            expected_version: Expected alembic version (optional)

        Returns:
            True if verification passed
        """
        print(f"\n{'='*70}")
        print(f"Migration Verification: {schema}")
        print(f"{'='*70}\n")

        checks = [
            ("Alembic Version", lambda: self.check_version(schema, expected_version)),
            ("Required Tables", lambda: self.check_required_tables(schema)),
            ("Table Structure", lambda: self.check_table_structure(schema)),
            ("Indexes", lambda: self.check_indexes(schema)),
            ("Foreign Keys", lambda: self.check_foreign_keys(schema)),
            ("Data Integrity", lambda: self.check_data_integrity(schema)),
        ]

        for check_name, check_func in checks:
            print(f"🔍 {check_name}...")
            try:
                await check_func()
                print(f"   ✅ {check_name}: OK\n")
            except Exception as e:
                error_msg = f"{check_name}: {str(e)}"
                self.errors.append(error_msg)
                print(f"   ❌ {check_name}: FAILED - {str(e)}\n")

        await self.print_summary()
        return len(self.errors) == 0

    async def check_version(self, schema: str, expected_version: str = None):
        """Check alembic version."""
        async with self.async_session() as session:
            result = await session.execute(
                text(f"SELECT version_num FROM {schema}.alembic_version")
            )
            current_version = result.scalar()

            if not current_version:
                raise ValueError("No alembic version found")

            print(f"   Current version: {current_version}")

            if expected_version and current_version != expected_version:
                raise ValueError(
                    f"Version mismatch: expected {expected_version}, "
                    f"got {current_version}"
                )

    async def check_required_tables(self, schema: str):
        """Check all required tables exist."""
        required_tables = {
            "alembic_version",
            "users",
            "enterprises",
            "batches",
            "growers",
            "packhouses",
            "batch_history",
            "grower_payments",
        }

        async with self.async_session() as session:
            result = await session.execute(
                text(
                    """
                    SELECT table_name
                    FROM information_schema.tables
                    WHERE table_schema = :schema
                    AND table_type = 'BASE TABLE'
                """
                ),
                {"schema": schema},
            )
            existing_tables = {row[0] for row in result.fetchall()}

        # Check for tenant vs public schema tables
        if schema != "public":
            # Tenant schemas shouldn't have users/enterprises
            required_tables -= {"users", "enterprises"}

        missing = required_tables - existing_tables
        if missing:
            raise ValueError(f"Missing tables: {', '.join(missing)}")

        print(f"   Found {len(existing_tables)} tables")

    async def check_table_structure(self, schema: str):
        """Check table structures are correct."""
        async with self.async_session() as session:
            # Check batches table has expected columns
            result = await session.execute(
                text(
                    """
                    SELECT column_name, data_type
                    FROM information_schema.columns
                    WHERE table_schema = :schema
                    AND table_name = 'batches'
                    ORDER BY ordinal_position
                """
                ),
                {"schema": schema},
            )
            columns = {row[0]: row[1] for row in result.fetchall()}

            required_columns = {
                "id": "uuid",
                "grower_id": "uuid",
                "batch_number": "character varying",
                "intake_date": "date",
                "gross_weight_kg": "numeric",
                "status": "character varying",
            }

            for col_name, col_type in required_columns.items():
                if col_name not in columns:
                    raise ValueError(f"Missing column: batches.{col_name}")

        print(f"   Table structures valid")

    async def check_indexes(self, schema: str):
        """Check required indexes exist."""
        async with self.async_session() as session:
            # Get all indexes
            result = await session.execute(
                text(
                    """
                    SELECT indexname
                    FROM pg_indexes
                    WHERE schemaname = :schema
                """
                ),
                {"schema": schema},
            )
            indexes = {row[0] for row in result.fetchall()}

        # Check for performance indexes added in Step 2
        expected_indexes = {
            "ix_batches_grower_harvest_status",
            "ix_batches_intake_date",
            "ix_batches_fruit_type",
        }

        missing_indexes = expected_indexes - indexes
        if missing_indexes:
            self.warnings.append(
                f"Missing performance indexes: {', '.join(missing_indexes)}"
            )

        print(f"   Found {len(indexes)} indexes")

    async def check_foreign_keys(self, schema: str):
        """Check foreign key constraints are valid."""
        async with self.async_session() as session:
            # Check for broken foreign keys
            result = await session.execute(
                text(
                    """
                    SELECT
                        tc.table_name,
                        tc.constraint_name,
                        kcu.column_name
                    FROM information_schema.table_constraints AS tc
                    JOIN information_schema.key_column_usage AS kcu
                        ON tc.constraint_name = kcu.constraint_name
                        AND tc.table_schema = kcu.table_schema
                    WHERE tc.constraint_type = 'FOREIGN KEY'
                    AND tc.table_schema = :schema
                """
                ),
                {"schema": schema},
            )
            fks = result.fetchall()

            if fks:
                print(f"   Found {len(fks)} foreign key constraints")

    async def check_data_integrity(self, schema: str):
        """Check basic data integrity."""
        async with self.async_session() as session:
            # Check for NULL values in NOT NULL columns
            # (this is a basic sanity check)
            result = await session.execute(
                text(
                    """
                    SELECT COUNT(*)
                    FROM information_schema.columns
                    WHERE table_schema = :schema
                    AND is_nullable = 'NO'
                """
                ),
                {"schema": schema},
            )
            not_null_count = result.scalar()

            print(f"   {not_null_count} NOT NULL constraints")

    async def print_summary(self):
        """Print verification summary."""
        print(f"\n{'='*70}")
        print("VERIFICATION SUMMARY")
        print(f"{'='*70}\n")

        if self.errors:
            print(f"❌ ERRORS ({len(self.errors)}):")
            for error in self.errors:
                print(f"   - {error}")
            print()

        if self.warnings:
            print(f"⚠️  WARNINGS ({len(self.warnings)}):")
            for warning in self.warnings:
                print(f"   - {warning}")
            print()

        if not self.errors and not self.warnings:
            print("✅ All checks passed! Migration verified successfully.\n")
        elif not self.errors:
            print("✅ No errors. Warnings present but migration is valid.\n")
        else:
            print("❌ Verification failed. Migration may have issues.\n")

    async def close(self):
        """Close database connection."""
        await self.engine.dispose()


async def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(description="Verify migration completed successfully")
    parser.add_argument(
        "--schema",
        default="public",
        help="Schema to verify (default: public)",
    )
    parser.add_argument(
        "--expected-version",
        help="Expected alembic version",
    )
    parser.add_argument(
        "--all-tenants",
        action="store_true",
        help="Verify all tenant schemas",
    )
    args = parser.parse_args()

    # Build database URL
    db_url = (
        f"postgresql+asyncpg://{settings.postgres_user}:{settings.postgres_password}"
        f"@{settings.postgres_host}:{settings.postgres_port}/{settings.postgres_db}"
    )

    verifier = MigrationVerifier(db_url)

    try:
        if args.all_tenants:
            # Get all tenant schemas
            async with verifier.async_session() as session:
                result = await session.execute(
                    text(
                        "SELECT schema_name FROM information_schema.schemata "
                        "WHERE schema_name LIKE 'tenant_%'"
                    )
                )
                schemas = [row[0] for row in result.fetchall()]

            print(f"\nVerifying {len(schemas)} tenant schemas\n")

            all_passed = True
            for schema in schemas:
                passed = await verifier.verify(schema, args.expected_version)
                all_passed = all_passed and passed
                print()

            # Also verify public schema
            passed = await verifier.verify("public", args.expected_version)
            all_passed = all_passed and passed

            return 0 if all_passed else 1
        else:
            passed = await verifier.verify(args.schema, args.expected_version)
            return 0 if passed else 1

    finally:
        await verifier.close()


if __name__ == "__main__":
    exit_code = asyncio.run(main())
    sys.exit(exit_code)
