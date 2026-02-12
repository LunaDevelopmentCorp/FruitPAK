#!/usr/bin/env python
"""Safe migration runner with automatic backup and rollback.

Creates a backup before migration, runs migration, and rolls back on failure.

Usage:
    python scripts/safe_migrate.py --message "add new indexes"
    python scripts/safe_migrate.py --schema tenant_abc123
    python scripts/safe_migrate.py --all-tenants --backup-only
"""

import argparse
import asyncio
import subprocess
import sys
from datetime import datetime
from pathlib import Path
from typing import Optional

from sqlalchemy import text
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker

from app.config import settings


class SafeMigration:
    """Safe migration runner with backup and rollback."""

    def __init__(self, db_url: str, backup_dir: str = "backups"):
        self.engine = create_async_engine(db_url, echo=False)
        self.async_session = sessionmaker(
            self.engine, class_=AsyncSession, expire_on_commit=False
        )
        self.backup_dir = Path(backup_dir)
        self.backup_dir.mkdir(exist_ok=True)
        self.backup_file: Optional[Path] = None
        self.pre_migration_version: Optional[str] = None

    async def create_backup(self, schema: str = "public") -> Path:
        """Create database backup.

        Args:
            schema: Schema to backup (or "all" for full database)

        Returns:
            Path to backup file
        """
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")

        if schema == "all":
            backup_file = self.backup_dir / f"fruitpak_full_{timestamp}.sql"
            print(f"\n📦 Creating full database backup: {backup_file}")

            cmd = [
                "pg_dump",
                "-h", settings.postgres_host,
                "-p", str(settings.postgres_port),
                "-U", settings.postgres_user,
                "-d", settings.postgres_db,
                "-F", "p",  # Plain text format
                "-f", str(backup_file),
            ]
        else:
            backup_file = self.backup_dir / f"fruitpak_{schema}_{timestamp}.sql"
            print(f"\n📦 Creating backup for schema '{schema}': {backup_file}")

            cmd = [
                "pg_dump",
                "-h", settings.postgres_host,
                "-p", str(settings.postgres_port),
                "-U", settings.postgres_user,
                "-d", settings.postgres_db,
                "-n", schema,  # Only this schema
                "-F", "p",
                "-f", str(backup_file),
            ]

        # Set password env var
        env = {
            "PGPASSWORD": settings.postgres_password,
        }

        try:
            result = subprocess.run(
                cmd,
                env=env,
                capture_output=True,
                text=True,
                check=True,
            )

            # Check file was created and has content
            if not backup_file.exists():
                raise RuntimeError("Backup file was not created")

            size_mb = backup_file.stat().st_size / (1024 * 1024)
            print(f"✅ Backup created: {size_mb:.2f} MB")

            self.backup_file = backup_file
            return backup_file

        except subprocess.CalledProcessError as e:
            print(f"❌ Backup failed: {e.stderr}")
            raise RuntimeError(f"Backup failed: {e.stderr}")

    async def get_current_version(self, schema: str = "public") -> Optional[str]:
        """Get current alembic version.

        Args:
            schema: Schema to check

        Returns:
            Current version or None
        """
        async with self.async_session() as session:
            try:
                result = await session.execute(
                    text(f"SELECT version_num FROM {schema}.alembic_version")
                )
                return result.scalar()
            except Exception:
                return None

    async def run_migration(self, schema: str = "public", message: Optional[str] = None) -> bool:
        """Run alembic migration.

        Args:
            schema: Schema to migrate
            message: Migration message (for new migrations)

        Returns:
            True if successful, False otherwise
        """
        print(f"\n🔄 Running migration for schema: {schema}")

        # Get current version
        self.pre_migration_version = await self.get_current_version(schema)
        if self.pre_migration_version:
            print(f"   Current version: {self.pre_migration_version}")
        else:
            print(f"   No current version (new schema)")

        # Run migration
        try:
            if schema == "public":
                # Public schema: use alembic directly
                cmd = ["alembic", "upgrade", "head"]
            else:
                # Tenant schema: use custom migration script
                cmd = ["python", "scripts/migrate_all_tenants.py", "--schema", schema]

            print(f"   Running: {' '.join(cmd)}")

            result = subprocess.run(
                cmd,
                cwd=Path(__file__).parent.parent,
                capture_output=True,
                text=True,
                check=True,
            )

            print(result.stdout)

            # Verify migration succeeded
            new_version = await self.get_current_version(schema)
            if new_version != self.pre_migration_version:
                print(f"✅ Migration successful: {self.pre_migration_version} → {new_version}")
                return True
            else:
                print(f"⚠️  Migration ran but version unchanged")
                return True  # May be no new migrations

        except subprocess.CalledProcessError as e:
            print(f"❌ Migration failed:")
            print(e.stdout)
            print(e.stderr)
            return False

    async def rollback(self, backup_file: Path, schema: str = "public") -> bool:
        """Rollback database from backup.

        Args:
            backup_file: Path to backup file
            schema: Schema to restore

        Returns:
            True if successful, False otherwise
        """
        print(f"\n🔙 Rolling back from backup: {backup_file}")

        if not backup_file.exists():
            print(f"❌ Backup file not found: {backup_file}")
            return False

        try:
            # Drop schema first (if not public)
            if schema != "public":
                async with self.async_session() as session:
                    await session.execute(
                        text(f"DROP SCHEMA IF EXISTS {schema} CASCADE")
                    )
                    await session.commit()
                    print(f"   Dropped schema: {schema}")

            # Restore from backup
            cmd = [
                "psql",
                "-h", settings.postgres_host,
                "-p", str(settings.postgres_port),
                "-U", settings.postgres_user,
                "-d", settings.postgres_db,
                "-f", str(backup_file),
            ]

            env = {
                "PGPASSWORD": settings.postgres_password,
            }

            result = subprocess.run(
                cmd,
                env=env,
                capture_output=True,
                text=True,
                check=True,
            )

            print(f"✅ Rollback successful")
            return True

        except subprocess.CalledProcessError as e:
            print(f"❌ Rollback failed: {e.stderr}")
            return False

    async def safe_migrate(
        self,
        schema: str = "public",
        message: Optional[str] = None,
        auto_rollback: bool = True,
    ) -> bool:
        """Safely run migration with backup and optional rollback.

        Args:
            schema: Schema to migrate
            message: Migration message
            auto_rollback: Whether to rollback on failure

        Returns:
            True if successful, False otherwise
        """
        print(f"\n{'='*70}")
        print(f"Safe Migration: {schema}")
        print(f"{'='*70}")

        # Step 1: Create backup
        try:
            await self.create_backup(schema)
        except Exception as e:
            print(f"\n❌ Failed to create backup: {e}")
            print("   Aborting migration for safety.")
            return False

        # Step 2: Run migration
        success = await self.run_migration(schema, message)

        if not success:
            print(f"\n❌ Migration failed")

            if auto_rollback and self.backup_file:
                print("\n⚠️  Attempting automatic rollback...")
                rollback_success = await self.rollback(self.backup_file, schema)

                if rollback_success:
                    print(f"\n✅ Rollback successful. Database restored to pre-migration state.")
                else:
                    print(f"\n❌ CRITICAL: Rollback failed. Manual intervention required.")
                    print(f"   Backup file: {self.backup_file}")
                    print(f"   Restore manually with:")
                    print(f"   psql -h {settings.postgres_host} -U {settings.postgres_user} "
                          f"-d {settings.postgres_db} -f {self.backup_file}")

            return False

        # Step 3: Success
        print(f"\n✅ Migration completed successfully")
        print(f"   Backup kept at: {self.backup_file}")
        return True

    async def close(self):
        """Close database connection."""
        await self.engine.dispose()


async def main():
    """Main entry point."""
    parser = argparse.ArgumentParser(
        description="Safe migration runner with backup and rollback"
    )
    parser.add_argument(
        "--schema",
        default="public",
        help="Schema to migrate (default: public)",
    )
    parser.add_argument(
        "--all-tenants",
        action="store_true",
        help="Migrate all tenant schemas",
    )
    parser.add_argument(
        "--message",
        "-m",
        help="Migration message (for creating new migrations)",
    )
    parser.add_argument(
        "--backup-only",
        action="store_true",
        help="Only create backup, don't run migration",
    )
    parser.add_argument(
        "--no-rollback",
        action="store_true",
        help="Don't rollback automatically on failure",
    )
    args = parser.parse_args()

    # Build database URL
    db_url = (
        f"postgresql+asyncpg://{settings.postgres_user}:{settings.postgres_password}"
        f"@{settings.postgres_host}:{settings.postgres_port}/{settings.postgres_db}"
    )

    migrator = SafeMigration(db_url)

    try:
        if args.backup_only:
            # Just create backup
            schema = "all" if args.all_tenants else args.schema
            await migrator.create_backup(schema)
            print(f"\n✅ Backup complete")
            return 0

        if args.all_tenants:
            # Migrate all tenant schemas
            async with migrator.async_session() as session:
                result = await session.execute(
                    text(
                        "SELECT schema_name FROM information_schema.schemata "
                        "WHERE schema_name LIKE 'tenant_%'"
                    )
                )
                schemas = [row[0] for row in result.fetchall()]

            print(f"\nFound {len(schemas)} tenant schemas to migrate")

            all_success = True
            for schema in schemas:
                success = await migrator.safe_migrate(
                    schema,
                    args.message,
                    auto_rollback=not args.no_rollback,
                )
                all_success = all_success and success
                print()

            # Also migrate public schema
            success = await migrator.safe_migrate(
                "public",
                args.message,
                auto_rollback=not args.no_rollback,
            )
            all_success = all_success and success

            return 0 if all_success else 1
        else:
            # Single schema
            success = await migrator.safe_migrate(
                args.schema,
                args.message,
                auto_rollback=not args.no_rollback,
            )
            return 0 if success else 1

    finally:
        await migrator.close()


if __name__ == "__main__":
    exit_code = asyncio.run(main())
    sys.exit(exit_code)
