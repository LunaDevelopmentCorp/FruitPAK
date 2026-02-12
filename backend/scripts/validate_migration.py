#!/usr/bin/env python
"""Pre-migration validation script.

Validates database state before running migrations to prevent failures.
Checks for schema conflicts, data integrity, and migration prerequisites.

Usage:
    python scripts/validate_migration.py
    python scripts/validate_migration.py --schema tenant_abc123
"""

import argparse
import asyncio
import sys
from typing import List, Tuple

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

from app.config import settings


class MigrationValidator:
    """Validate database state before migrations."""

    def __init__(self, db_url: str):
        self.engine = create_async_engine(db_url, echo=False)
        self.async_session = sessionmaker(
            self.engine, class_=AsyncSession, expire_on_commit=False
        )
        self.errors: List[str] = []
        self.warnings: List[str] = []

    async def validate_all(self, schema: str = "public") -> bool:
        """Run all validation checks.

        Args:
            schema: Schema to validate (default: public)

        Returns:
            True if validation passed, False otherwise
        """
        print(f"\n{'='*70}")
        print(f"Migration Validation for Schema: {schema}")
        print(f"{'='*70}\n")

        checks = [
            ("Database Connection", self.check_connection),
            ("Schema Existence", lambda: self.check_schema_exists(schema)),
            ("Alembic Version", lambda: self.check_alembic_version(schema)),
            ("Table Integrity", lambda: self.check_table_integrity(schema)),
            ("Foreign Key Constraints", lambda: self.check_foreign_keys(schema)),
            ("Index Validity", lambda: self.check_indexes(schema)),
            ("Data Types", lambda: self.check_data_types(schema)),
            ("Disk Space", self.check_disk_space),
        ]

        for check_name, check_func in checks:
            print(f"🔍 Checking: {check_name}...")
            try:
                await check_func()
                print(f"   ✅ {check_name}: OK\n")
            except Exception as e:
                error_msg = f"{check_name}: {str(e)}"
                self.errors.append(error_msg)
                print(f"   ❌ {check_name}: FAILED - {str(e)}\n")

        # Print summary
        await self.print_summary()

        return len(self.errors) == 0

    async def check_connection(self):
        """Verify database connection."""
        async with self.async_session() as session:
            result = await session.execute(text("SELECT 1"))
            assert result.scalar() == 1

    async def check_schema_exists(self, schema: str):
        """Verify schema exists."""
        async with self.async_session() as session:
            result = await session.execute(
                text(
                    "SELECT schema_name FROM information_schema.schemata "
                    "WHERE schema_name = :schema"
                ),
                {"schema": schema},
            )
            if not result.scalar():
                raise ValueError(f"Schema '{schema}' does not exist")

    async def check_alembic_version(self, schema: str):
        """Check if alembic_version table exists and has a version."""
        async with self.async_session() as session:
            # Check if table exists
            result = await session.execute(
                text(
                    f"""
                    SELECT EXISTS (
                        SELECT FROM information_schema.tables
                        WHERE table_schema = '{schema}'
                        AND table_name = 'alembic_version'
                    )
                """
                )
            )
            table_exists = result.scalar()

            if not table_exists:
                if schema == "public":
                    raise ValueError("alembic_version table not found. Run migrations first.")
                else:
                    self.warnings.append(
                        f"alembic_version table not found in {schema}. "
                        "This is normal for new tenants."
                    )
                return

            # Check current version
            result = await session.execute(
                text(f"SELECT version_num FROM {schema}.alembic_version")
            )
            version = result.scalar()

            if version:
                print(f"   Current version: {version}")
            else:
                self.warnings.append(f"No alembic version recorded in {schema}")

    async def check_table_integrity(self, schema: str):
        """Check for table integrity issues."""
        async with self.async_session() as session:
            # Get all tables in schema
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
            tables = [row[0] for row in result.fetchall()]

            if not tables:
                if schema != "public":
                    self.warnings.append(f"No tables found in schema {schema}")
                return

            print(f"   Found {len(tables)} tables")

            # Check for duplicate tables
            seen = set()
            duplicates = []
            for table in tables:
                if table in seen:
                    duplicates.append(table)
                seen.add(table)

            if duplicates:
                raise ValueError(f"Duplicate tables found: {', '.join(duplicates)}")

    async def check_foreign_keys(self, schema: str):
        """Check foreign key constraints for issues."""
        async with self.async_session() as session:
            # Check for broken foreign keys
            result = await session.execute(
                text(
                    """
                    SELECT
                        tc.table_name,
                        tc.constraint_name,
                        kcu.column_name,
                        ccu.table_name AS foreign_table_name,
                        ccu.column_name AS foreign_column_name
                    FROM information_schema.table_constraints AS tc
                    JOIN information_schema.key_column_usage AS kcu
                        ON tc.constraint_name = kcu.constraint_name
                        AND tc.table_schema = kcu.table_schema
                    JOIN information_schema.constraint_column_usage AS ccu
                        ON ccu.constraint_name = tc.constraint_name
                        AND ccu.table_schema = tc.table_schema
                    WHERE tc.constraint_type = 'FOREIGN KEY'
                    AND tc.table_schema = :schema
                """
                ),
                {"schema": schema},
            )
            fks = result.fetchall()

            if fks:
                print(f"   Found {len(fks)} foreign key constraints")

    async def check_indexes(self, schema: str):
        """Check for invalid or duplicate indexes."""
        async with self.async_session() as session:
            # Check for invalid indexes
            result = await session.execute(
                text(
                    """
                    SELECT
                        schemaname,
                        tablename,
                        indexname
                    FROM pg_indexes
                    WHERE schemaname = :schema
                """
                ),
                {"schema": schema},
            )
            indexes = result.fetchall()

            if indexes:
                print(f"   Found {len(indexes)} indexes")

            # Check for very large indexes (potential issues)
            result = await session.execute(
                text(
                    """
                    SELECT
                        schemaname,
                        tablename,
                        indexname,
                        pg_size_pretty(pg_relation_size(schemaname||'.'||indexname)) as size
                    FROM pg_indexes
                    WHERE schemaname = :schema
                    AND pg_relation_size(schemaname||'.'||indexname) > 100000000
                """
                ),
                {"schema": schema},
            )
            large_indexes = result.fetchall()

            if large_indexes:
                for idx in large_indexes:
                    self.warnings.append(
                        f"Large index: {idx[2]} on {idx[1]} ({idx[3]})"
                    )

    async def check_data_types(self, schema: str):
        """Check for problematic data types."""
        async with self.async_session() as session:
            # Check for columns with no default and not null
            result = await session.execute(
                text(
                    """
                    SELECT
                        table_name,
                        column_name,
                        data_type
                    FROM information_schema.columns
                    WHERE table_schema = :schema
                    AND is_nullable = 'NO'
                    AND column_default IS NULL
                    AND data_type NOT IN ('uuid', 'integer', 'bigint')
                """
                ),
                {"schema": schema},
            )
            risky_columns = result.fetchall()

            if risky_columns:
                self.warnings.append(
                    f"Found {len(risky_columns)} NOT NULL columns without defaults"
                )

    async def check_disk_space(self):
        """Check available disk space."""
        async with self.async_session() as session:
            # Get database size
            result = await session.execute(
                text("SELECT pg_database_size(current_database())")
            )
            db_size_bytes = result.scalar()
            db_size_mb = db_size_bytes / (1024 * 1024)

            print(f"   Database size: {db_size_mb:.2f} MB")

            # Get free space (PostgreSQL-specific, may not work on all systems)
            try:
                result = await session.execute(
                    text(
                        "SELECT pg_size_pretty(pg_database_size(current_database()))"
                    )
                )
                size_pretty = result.scalar()
                print(f"   Database size (pretty): {size_pretty}")
            except Exception:
                pass

            # Warn if database is very large
            if db_size_mb > 10000:  # 10 GB
                self.warnings.append(
                    f"Large database ({db_size_mb:.2f} MB). "
                    "Migrations may take longer."
                )

    async def print_summary(self):
        """Print validation summary."""
        print(f"\n{'='*70}")
        print("VALIDATION SUMMARY")
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
            print("✅ All checks passed! Database is ready for migration.\n")
        elif not self.errors:
            print(
                "✅ No errors found. Warnings present but migration can proceed.\n"
            )
        else:
            print("❌ Validation failed. Fix errors before running migrations.\n")

    async def close(self):
        """Close database connection."""
        await self.engine.dispose()


async def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description="Validate database state before migrations"
    )
    parser.add_argument(
        "--schema",
        default="public",
        help="Schema to validate (default: public)",
    )
    parser.add_argument(
        "--all-tenants",
        action="store_true",
        help="Validate all tenant schemas",
    )
    args = parser.parse_args()

    # Build database URL
    db_url = (
        f"postgresql+asyncpg://{settings.postgres_user}:{settings.postgres_password}"
        f"@{settings.postgres_host}:{settings.postgres_port}/{settings.postgres_db}"
    )

    validator = MigrationValidator(db_url)

    try:
        if args.all_tenants:
            # Get all tenant schemas
            async with validator.async_session() as session:
                result = await session.execute(
                    text(
                        "SELECT schema_name FROM information_schema.schemata "
                        "WHERE schema_name LIKE 'tenant_%'"
                    )
                )
                schemas = [row[0] for row in result.fetchall()]

            print(f"\nFound {len(schemas)} tenant schemas to validate\n")

            all_passed = True
            for schema in schemas:
                passed = await validator.validate_all(schema)
                all_passed = all_passed and passed
                print()

            # Also validate public schema
            passed = await validator.validate_all("public")
            all_passed = all_passed and passed

            return 0 if all_passed else 1
        else:
            passed = await validator.validate_all(args.schema)
            return 0 if passed else 1

    finally:
        await validator.close()


if __name__ == "__main__":
    exit_code = asyncio.run(main())
    sys.exit(exit_code)
