"""Initial tenant schema — all operational and financial tables.

Revision ID: 0001
Revises: (none)
Create Date: 2026-02-09

Run with:
    # Public schema first (enterprises, users):
    alembic upgrade head

    # Tenant schema (all tables below):
    alembic -x schema=tenant -x tenant_schema=tenant_XXXXX upgrade head

    # Or for all tenants at once:
    python -m app.cli migrate-tenants
"""

revision = "0001"
down_revision = None
branch_labels = ("tenant",)
depends_on = None

from alembic import op
import sqlalchemy as sa


def upgrade() -> None:
    # ── Setup / config tables ────────────────────────────────

    op.create_table(
        "wizard_state",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("current_step", sa.Integer(), server_default="1"),
        sa.Column("completed_steps", sa.JSON(), server_default="[]"),
        sa.Column("draft_data", sa.JSON(), nullable=True),
        sa.Column("is_complete", sa.Boolean(), server_default="false"),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now()),
    )

    op.create_table(
        "company_profile",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("trading_name", sa.String(255), nullable=False),
        sa.Column("legal_name", sa.String(255)),
        sa.Column("registration_number", sa.String(100)),
        sa.Column("vat_number", sa.String(50)),
        sa.Column("exporter_code", sa.String(50)),
        sa.Column("fbo_code", sa.String(50)),
        sa.Column("ppecb_code", sa.String(50)),
        sa.Column("address_line_1", sa.String(255)),
        sa.Column("address_line_2", sa.String(255)),
        sa.Column("city", sa.String(100)),
        sa.Column("province", sa.String(100)),
        sa.Column("postal_code", sa.String(20)),
        sa.Column("country", sa.String(100)),
        sa.Column("contact_name", sa.String(255)),
        sa.Column("contact_email", sa.String(255)),
        sa.Column("contact_phone", sa.String(20)),
        sa.Column("notes", sa.Text()),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now()),
    )

    op.create_table(
        "packhouses",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("location", sa.String(255)),
        sa.Column("capacity_tons_per_day", sa.Integer()),
        sa.Column("cold_rooms", sa.Integer(), server_default="0"),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
    )

    op.create_table(
        "pack_lines",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("packhouse_id", sa.String(36), sa.ForeignKey("packhouses.id"), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("line_number", sa.Integer(), nullable=False),
        sa.Column("stations", sa.JSON(), server_default="[]"),
        sa.Column("custom_units", sa.JSON(), server_default="[]"),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
    )

    op.create_table(
        "suppliers",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("tags", sa.JSON(), server_default="[]"),
        sa.Column("contact_person", sa.String(255)),
        sa.Column("phone", sa.String(20)),
        sa.Column("email", sa.String(255)),
        sa.Column("address", sa.Text()),
        sa.Column("tax_number", sa.String(50)),
        sa.Column("is_active", sa.Boolean(), server_default="true"),
        sa.Column("notes", sa.Text()),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
    )

    op.create_table(
        "growers",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("grower_code", sa.String(50), unique=True),
        sa.Column("contact_person", sa.String(255)),
        sa.Column("phone", sa.String(20)),
        sa.Column("email", sa.String(255)),
        sa.Column("region", sa.String(100)),
        sa.Column("fields", sa.JSON(), server_default="[]"),
        sa.Column("total_hectares", sa.Float()),
        sa.Column("estimated_volume_tons", sa.Float()),
        sa.Column("globalg_ap_certified", sa.Boolean(), server_default="false"),
        sa.Column("globalg_ap_number", sa.String(50)),
        sa.Column("other_certifications", sa.JSON(), server_default="[]"),
        sa.Column("notes", sa.Text()),
        sa.Column("is_active", sa.Boolean(), server_default="true"),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
    )

    op.create_table(
        "harvest_teams",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("team_leader", sa.String(255)),
        sa.Column("team_size", sa.Integer()),
        sa.Column("grower_id", sa.String(36), sa.ForeignKey("growers.id")),
        sa.Column("supplier_id", sa.String(36), sa.ForeignKey("suppliers.id")),
        sa.Column("estimated_volume_kg", sa.Float()),
        sa.Column("fruit_types", sa.JSON(), server_default="[]"),
        sa.Column("assigned_fields", sa.JSON(), server_default="[]"),
        sa.Column("notes", sa.Text()),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
    )

    op.create_table(
        "product_configs",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("fruit_type", sa.String(100), nullable=False),
        sa.Column("variety", sa.String(100)),
        sa.Column("grades", sa.JSON(), server_default="[]"),
        sa.Column("sizes", sa.JSON(), server_default="[]"),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
    )

    op.create_table(
        "pack_specs",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("pack_type", sa.String(100)),
        sa.Column("weight_kg", sa.Float()),
        sa.Column("units_per_carton", sa.Integer()),
        sa.Column("cartons_per_layer", sa.Integer()),
        sa.Column("layers_per_pallet", sa.Integer()),
        sa.Column("target_market", sa.String(100)),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
    )

    op.create_table(
        "transport_configs",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("container_type", sa.String(50), nullable=False),
        sa.Column("temp_setpoint_c", sa.Float()),
        sa.Column("temp_min_c", sa.Float()),
        sa.Column("temp_max_c", sa.Float()),
        sa.Column("pallet_capacity", sa.Integer()),
        sa.Column("max_weight_kg", sa.Float()),
        sa.Column("atmosphere_settings", sa.JSON()),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
    )

    op.create_table(
        "financial_config",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("currency", sa.String(3), server_default="ZAR"),
        sa.Column("packing_rate_per_kg", sa.Float()),
        sa.Column("cold_storage_rate_per_pallet_day", sa.Float()),
        sa.Column("transport_rate_per_pallet", sa.Float()),
        sa.Column("labour_rate_per_hour", sa.Float()),
        sa.Column("grower_payment_terms_days", sa.Integer()),
        sa.Column("client_payment_terms_days", sa.Integer()),
        sa.Column("additional_rates", sa.JSON()),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now()),
    )

    # ── Core operational tables ──────────────────────────────

    op.create_table(
        "batches",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("batch_code", sa.String(50), unique=True, nullable=False),
        sa.Column("grower_id", sa.String(36), sa.ForeignKey("growers.id"), nullable=False),
        sa.Column("harvest_team_id", sa.String(36), sa.ForeignKey("harvest_teams.id")),
        sa.Column("packhouse_id", sa.String(36), sa.ForeignKey("packhouses.id"), nullable=False),
        sa.Column("fruit_type", sa.String(100), nullable=False),
        sa.Column("variety", sa.String(100)),
        sa.Column("harvest_date", sa.Date()),
        sa.Column("intake_date", sa.Date(), server_default=sa.func.current_date()),
        sa.Column("gross_weight_kg", sa.Float(), nullable=False),
        sa.Column("tare_weight_kg", sa.Float(), server_default="0"),
        sa.Column("net_weight_kg", sa.Float()),
        sa.Column("arrival_temp_c", sa.Float()),
        sa.Column("brix_reading", sa.Float()),
        sa.Column("quality_assessment", sa.JSON()),
        sa.Column("status", sa.String(30), server_default="received"),
        sa.Column("rejection_reason", sa.Text()),
        sa.Column("bin_count", sa.Integer()),
        sa.Column("bin_type", sa.String(50)),
        sa.Column("notes", sa.Text()),
        sa.Column("received_by", sa.String(36)),
        sa.Column("is_deleted", sa.Boolean(), server_default="false"),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_index("ix_batches_batch_code", "batches", ["batch_code"])
    op.create_index("ix_batches_status", "batches", ["status"])

    op.create_table(
        "batch_history",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("batch_id", sa.String(36), sa.ForeignKey("batches.id"), nullable=False),
        sa.Column("event_type", sa.String(50), nullable=False),
        sa.Column("event_subtype", sa.String(100)),
        sa.Column("packhouse_id", sa.String(36), sa.ForeignKey("packhouses.id")),
        sa.Column("pack_line_id", sa.String(36), sa.ForeignKey("pack_lines.id")),
        sa.Column("location_detail", sa.String(255)),
        sa.Column("event_data", sa.JSON()),
        sa.Column("notes", sa.Text()),
        sa.Column("recorded_by", sa.String(36)),
        sa.Column("recorded_at", sa.DateTime(), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_batch_history_batch_id", "batch_history", ["batch_id"])
    op.create_index("ix_batch_history_event_type", "batch_history", ["event_type"])
    op.create_index("ix_batch_history_recorded_at", "batch_history", ["recorded_at"])

    # ── NOTE: After running this migration, convert batch_history to a ──
    # ── TimescaleDB hypertable for efficient time-series queries:       ──
    #
    #   SELECT create_hypertable('batch_history', 'recorded_at',
    #                            migrate_data => true);

    op.create_table(
        "lots",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("lot_code", sa.String(50), unique=True, nullable=False),
        sa.Column("batch_id", sa.String(36), sa.ForeignKey("batches.id"), nullable=False),
        sa.Column("grower_id", sa.String(36), sa.ForeignKey("growers.id"), nullable=False),
        sa.Column("packhouse_id", sa.String(36), sa.ForeignKey("packhouses.id"), nullable=False),
        sa.Column("pack_line_id", sa.String(36), sa.ForeignKey("pack_lines.id")),
        sa.Column("fruit_type", sa.String(100), nullable=False),
        sa.Column("variety", sa.String(100)),
        sa.Column("grade", sa.String(50)),
        sa.Column("size", sa.String(50)),
        sa.Column("product_config_id", sa.String(36), sa.ForeignKey("product_configs.id")),
        sa.Column("pack_spec_id", sa.String(36), sa.ForeignKey("pack_specs.id")),
        sa.Column("target_market", sa.String(100)),
        sa.Column("carton_count", sa.Integer(), server_default="0"),
        sa.Column("weight_kg", sa.Float()),
        sa.Column("pack_date", sa.Date()),
        sa.Column("intake_date", sa.DateTime(), server_default=sa.func.now()),
        sa.Column("quality_data", sa.JSON()),
        sa.Column("status", sa.String(30), server_default="created"),
        sa.Column("notes", sa.Text()),
        sa.Column("packed_by", sa.String(36)),
        sa.Column("is_deleted", sa.Boolean(), server_default="false"),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_index("ix_lots_lot_code", "lots", ["lot_code"])
    op.create_index("ix_lots_batch_id", "lots", ["batch_id"])
    op.create_index("ix_lots_grade", "lots", ["grade"])
    op.create_index("ix_lots_status", "lots", ["status"])

    op.create_table(
        "exports",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("booking_ref", sa.String(100), unique=True, nullable=False),
        sa.Column("client_name", sa.String(255), nullable=False),
        sa.Column("client_ref", sa.String(100)),
        sa.Column("target_market", sa.String(100)),
        sa.Column("destination_country", sa.String(100)),
        sa.Column("destination_port", sa.String(100)),
        sa.Column("shipping_line", sa.String(255)),
        sa.Column("vessel_name", sa.String(255)),
        sa.Column("voyage_number", sa.String(100)),
        sa.Column("port_of_loading", sa.String(100)),
        sa.Column("etd", sa.Date()),
        sa.Column("eta", sa.Date()),
        sa.Column("actual_departure", sa.Date()),
        sa.Column("actual_arrival", sa.Date()),
        sa.Column("container_count", sa.Integer(), server_default="0"),
        sa.Column("total_pallets", sa.Integer(), server_default="0"),
        sa.Column("total_cartons", sa.Integer(), server_default="0"),
        sa.Column("total_weight_kg", sa.Float()),
        sa.Column("ppecb_cert_number", sa.String(100)),
        sa.Column("phyto_cert_number", sa.String(100)),
        sa.Column("bill_of_lading", sa.String(100)),
        sa.Column("documents", sa.JSON()),
        sa.Column("currency", sa.String(3)),
        sa.Column("total_value", sa.Float()),
        sa.Column("incoterm", sa.String(10)),
        sa.Column("status", sa.String(30), server_default="draft"),
        sa.Column("notes", sa.Text()),
        sa.Column("created_by", sa.String(36)),
        sa.Column("is_deleted", sa.Boolean(), server_default="false"),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_index("ix_exports_booking_ref", "exports", ["booking_ref"])
    op.create_index("ix_exports_status", "exports", ["status"])

    op.create_table(
        "containers",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("container_number", sa.String(50), unique=True, nullable=False),
        sa.Column("transport_config_id", sa.String(36), sa.ForeignKey("transport_configs.id")),
        sa.Column("container_type", sa.String(50), nullable=False),
        sa.Column("packhouse_id", sa.String(36), sa.ForeignKey("packhouses.id")),
        sa.Column("pallet_count", sa.Integer(), server_default="0"),
        sa.Column("total_cartons", sa.Integer(), server_default="0"),
        sa.Column("gross_weight_kg", sa.Float()),
        sa.Column("seal_number", sa.String(100)),
        sa.Column("sealed_at", sa.DateTime()),
        sa.Column("sealed_by", sa.String(36)),
        sa.Column("temp_setpoint_c", sa.Float()),
        sa.Column("temp_readings", sa.JSON()),
        sa.Column("export_id", sa.String(36), sa.ForeignKey("exports.id")),
        sa.Column("status", sa.String(30), server_default="open"),
        sa.Column("dispatched_at", sa.DateTime()),
        sa.Column("notes", sa.Text()),
        sa.Column("is_deleted", sa.Boolean(), server_default="false"),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_index("ix_containers_container_number", "containers", ["container_number"])
    op.create_index("ix_containers_status", "containers", ["status"])

    op.create_table(
        "pallets",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("pallet_code", sa.String(50), unique=True, nullable=False),
        sa.Column("lot_id", sa.String(36), sa.ForeignKey("lots.id"), nullable=False),
        sa.Column("packhouse_id", sa.String(36), sa.ForeignKey("packhouses.id"), nullable=False),
        sa.Column("pack_spec_id", sa.String(36), sa.ForeignKey("pack_specs.id")),
        sa.Column("fruit_type", sa.String(100)),
        sa.Column("variety", sa.String(100)),
        sa.Column("grade", sa.String(50)),
        sa.Column("size", sa.String(50)),
        sa.Column("target_market", sa.String(100)),
        sa.Column("carton_count", sa.Integer(), server_default="0"),
        sa.Column("layers", sa.Integer()),
        sa.Column("net_weight_kg", sa.Float()),
        sa.Column("gross_weight_kg", sa.Float()),
        sa.Column("cold_store_room", sa.String(50)),
        sa.Column("cold_store_position", sa.String(100)),
        sa.Column("stored_at", sa.DateTime()),
        sa.Column("container_id", sa.String(36), sa.ForeignKey("containers.id")),
        sa.Column("loaded_at", sa.DateTime()),
        sa.Column("position_in_container", sa.String(50)),
        sa.Column("quality_data", sa.JSON()),
        sa.Column("status", sa.String(30), server_default="open"),
        sa.Column("notes", sa.Text()),
        sa.Column("palletized_by", sa.String(36)),
        sa.Column("is_deleted", sa.Boolean(), server_default="false"),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_index("ix_pallets_pallet_code", "pallets", ["pallet_code"])
    op.create_index("ix_pallets_lot_id", "pallets", ["lot_id"])
    op.create_index("ix_pallets_grade", "pallets", ["grade"])
    op.create_index("ix_pallets_container_id", "pallets", ["container_id"])
    op.create_index("ix_pallets_status", "pallets", ["status"])

    # ── Financial tables ─────────────────────────────────────

    op.create_table(
        "grower_payments",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("payment_ref", sa.String(50), unique=True, nullable=False),
        sa.Column("grower_id", sa.String(36), sa.ForeignKey("growers.id"), nullable=False),
        sa.Column("batch_ids", sa.JSON(), server_default="[]"),
        sa.Column("currency", sa.String(3), server_default="ZAR"),
        sa.Column("gross_amount", sa.Float(), nullable=False),
        sa.Column("deductions", sa.JSON()),
        sa.Column("total_deductions", sa.Float(), server_default="0"),
        sa.Column("net_amount", sa.Float(), nullable=False),
        sa.Column("rate_per_kg", sa.Float()),
        sa.Column("total_kg", sa.Float()),
        sa.Column("period_start", sa.Date()),
        sa.Column("period_end", sa.Date()),
        sa.Column("due_date", sa.Date()),
        sa.Column("paid_date", sa.Date()),
        sa.Column("status", sa.String(30), server_default="pending"),
        sa.Column("approved_by", sa.String(36)),
        sa.Column("approved_at", sa.DateTime()),
        sa.Column("notes", sa.Text()),
        sa.Column("is_deleted", sa.Boolean(), server_default="false"),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_index("ix_grower_payments_payment_ref", "grower_payments", ["payment_ref"])
    op.create_index("ix_grower_payments_status", "grower_payments", ["status"])

    op.create_table(
        "labour_costs",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("category", sa.String(50), nullable=False),
        sa.Column("description", sa.String(255)),
        sa.Column("supplier_id", sa.String(36), sa.ForeignKey("suppliers.id")),
        sa.Column("packhouse_id", sa.String(36), sa.ForeignKey("packhouses.id")),
        sa.Column("pack_line_id", sa.String(36), sa.ForeignKey("pack_lines.id")),
        sa.Column("harvest_team_id", sa.String(36), sa.ForeignKey("harvest_teams.id")),
        sa.Column("currency", sa.String(3), server_default="ZAR"),
        sa.Column("hours_worked", sa.Float()),
        sa.Column("rate_per_hour", sa.Float()),
        sa.Column("headcount", sa.Float()),
        sa.Column("total_amount", sa.Float(), nullable=False),
        sa.Column("extras", sa.JSON()),
        sa.Column("work_date", sa.Date(), nullable=False),
        sa.Column("period_start", sa.Date()),
        sa.Column("period_end", sa.Date()),
        sa.Column("status", sa.String(30), server_default="recorded"),
        sa.Column("notes", sa.Text()),
        sa.Column("recorded_by", sa.String(36)),
        sa.Column("is_deleted", sa.Boolean(), server_default="false"),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_index("ix_labour_costs_category", "labour_costs", ["category"])
    op.create_index("ix_labour_costs_work_date", "labour_costs", ["work_date"])

    op.create_table(
        "client_invoices",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("invoice_number", sa.String(50), unique=True, nullable=False),
        sa.Column("client_name", sa.String(255), nullable=False),
        sa.Column("client_ref", sa.String(100)),
        sa.Column("export_id", sa.String(36), sa.ForeignKey("exports.id")),
        sa.Column("currency", sa.String(3), server_default="USD"),
        sa.Column("line_items", sa.JSON(), server_default="[]"),
        sa.Column("subtotal", sa.Float(), nullable=False),
        sa.Column("tax_rate_pct", sa.Float(), server_default="0"),
        sa.Column("tax_amount", sa.Float(), server_default="0"),
        sa.Column("total_amount", sa.Float(), nullable=False),
        sa.Column("amount_paid", sa.Float(), server_default="0"),
        sa.Column("balance_due", sa.Float(), nullable=False),
        sa.Column("issue_date", sa.Date(), server_default=sa.func.current_date()),
        sa.Column("due_date", sa.Date()),
        sa.Column("paid_date", sa.Date()),
        sa.Column("payment_terms", sa.String(100)),
        sa.Column("incoterm", sa.String(10)),
        sa.Column("status", sa.String(30), server_default="draft"),
        sa.Column("notes", sa.Text()),
        sa.Column("created_by", sa.String(36)),
        sa.Column("is_deleted", sa.Boolean(), server_default="false"),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_index("ix_client_invoices_invoice_number", "client_invoices", ["invoice_number"])
    op.create_index("ix_client_invoices_status", "client_invoices", ["status"])

    op.create_table(
        "credits",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("credit_number", sa.String(50), unique=True, nullable=False),
        sa.Column("credit_type", sa.String(30), nullable=False),
        sa.Column("reason", sa.String(50), nullable=False),
        sa.Column("reason_detail", sa.Text()),
        sa.Column("invoice_id", sa.String(36), sa.ForeignKey("client_invoices.id")),
        sa.Column("grower_payment_id", sa.String(36), sa.ForeignKey("grower_payments.id")),
        sa.Column("export_id", sa.String(36), sa.ForeignKey("exports.id")),
        sa.Column("currency", sa.String(3), nullable=False),
        sa.Column("line_items", sa.JSON()),
        sa.Column("total_amount", sa.Float(), nullable=False),
        sa.Column("issue_date", sa.Date(), server_default=sa.func.current_date()),
        sa.Column("applied_date", sa.Date()),
        sa.Column("status", sa.String(30), server_default="draft"),
        sa.Column("approved_by", sa.String(36)),
        sa.Column("approved_at", sa.DateTime()),
        sa.Column("notes", sa.Text()),
        sa.Column("created_by", sa.String(36)),
        sa.Column("is_deleted", sa.Boolean(), server_default="false"),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_index("ix_credits_credit_number", "credits", ["credit_number"])
    op.create_index("ix_credits_credit_type", "credits", ["credit_type"])
    op.create_index("ix_credits_status", "credits", ["status"])


def downgrade() -> None:
    op.drop_table("credits")
    op.drop_table("client_invoices")
    op.drop_table("labour_costs")
    op.drop_table("grower_payments")
    op.drop_table("pallets")
    op.drop_table("containers")
    op.drop_table("exports")
    op.drop_table("lots")
    op.drop_table("batch_history")
    op.drop_table("batches")
    op.drop_table("financial_config")
    op.drop_table("transport_configs")
    op.drop_table("pack_specs")
    op.drop_table("product_configs")
    op.drop_table("harvest_teams")
    op.drop_table("growers")
    op.drop_table("suppliers")
    op.drop_table("pack_lines")
    op.drop_table("packhouses")
    op.drop_table("company_profile")
    op.drop_table("wizard_state")
