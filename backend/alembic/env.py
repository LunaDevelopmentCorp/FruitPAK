"""Alembic env.py — supports both public and tenant schema migrations.

Usage:
  # Migrate public schema (enterprises, users)
  alembic upgrade head

  # Migrate all tenant schemas
  python -m app.tenancy.migration_runner
"""

from logging.config import fileConfig

from alembic import context
from sqlalchemy import engine_from_config, pool, text

from app.config import settings
from app.database import PublicBase, TenantBase
from app.models import *  # noqa: F401,F403 — ensure all models are imported

config = context.config
config.set_main_option("sqlalchemy.url", settings.database_url_sync)

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# Determine which metadata to migrate.
# Pass `-x schema=tenant` on the CLI to migrate tenant tables.
target_schema = context.get_x_argument(as_dictionary=True).get("schema", "public")

if target_schema == "tenant":
    target_metadata = TenantBase.metadata
else:
    target_metadata = PublicBase.metadata


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        include_schemas=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        # If migrating a specific tenant schema, set the search_path
        # and use a per-tenant alembic_version table so each tenant
        # tracks its own migration state independently.
        schema_name = context.get_x_argument(as_dictionary=True).get("tenant_schema")
        if schema_name:
            connection.execute(text(f'SET search_path TO "{schema_name}", pg_catalog'))
            connection.execute(text(
                f'CREATE TABLE IF NOT EXISTS "{schema_name}".alembic_version '
                f'(version_num VARCHAR(32) NOT NULL, '
                f'CONSTRAINT alembic_version_pkc PRIMARY KEY (version_num))'
            ))
            # Seed from public.alembic_version if tenant table is empty
            count = connection.execute(text(
                f'SELECT count(*) FROM "{schema_name}".alembic_version'
            )).scalar()
            if count == 0:
                try:
                    pub_ver = connection.execute(text(
                        'SELECT version_num FROM public.alembic_version'
                    )).scalar()
                    if pub_ver:
                        connection.execute(text(
                            f'INSERT INTO "{schema_name}".alembic_version (version_num) '
                            f'VALUES (:v)'
                        ), {"v": pub_ver})
                except Exception:
                    pass

        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            include_schemas=True,
            version_table_schema=schema_name if schema_name else None,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
