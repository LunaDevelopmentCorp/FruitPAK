"""Alembic env.py — supports both public and tenant schema migrations.

Usage:
  # Migrate public schema (enterprises, users)
  alembic upgrade head

  # Migrate all tenant schemas (run from a management command)
  python -m app.cli migrate-tenants
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
        schema_name = context.get_x_argument(as_dictionary=True).get("tenant_schema")
        if schema_name:
            connection.execute(text(f'SET search_path TO "{schema_name}", public'))

        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            include_schemas=True,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
