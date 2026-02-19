"""Pydantic schemas for the 8-step onboarding wizard.

Every step schema uses Optional fields so PATCH (partial save) works.
The `StepNComplete` variants are used for final validation when
marking a step as completed.
"""

from pydantic import BaseModel, model_validator


# ── Wizard state / progress ─────────────────────────────────

class WizardProgress(BaseModel):
    current_step: int
    completed_steps: list[int]
    is_complete: bool
    draft_data: dict | None = None
    completed_data: dict[str, dict] = {}


# ── Step 1: Company & Exporter basics ───────────────────────

class Step1Data(BaseModel):
    trading_name: str | None = None
    legal_name: str | None = None
    registration_number: str | None = None
    vat_number: str | None = None
    exporter_code: str | None = None
    fbo_code: str | None = None
    ppecb_code: str | None = None
    address_line_1: str | None = None
    address_line_2: str | None = None
    city: str | None = None
    province: str | None = None
    postal_code: str | None = None
    country: str | None = None
    contact_name: str | None = None
    contact_email: str | None = None
    contact_phone: str | None = None
    notes: str | None = None


class Step1Complete(Step1Data):
    """trading_name is required to mark step 1 complete."""
    trading_name: str


# ── Step 2: Packhouse setup ─────────────────────────────────

class PackLineInput(BaseModel):
    name: str
    line_number: int
    stations: list[dict] | None = None
    custom_units: list[str] | None = None


class PackhouseInput(BaseModel):
    name: str
    location: str | None = None
    capacity_tons_per_day: int | None = None
    cold_rooms: int | None = None
    pack_lines: list[PackLineInput] | None = None


class Step2Data(BaseModel):
    packhouses: list[PackhouseInput] | None = None


class Step2Complete(Step2Data):
    """At least one packhouse is required."""
    packhouses: list[PackhouseInput]

    @model_validator(mode="after")
    def _at_least_one(self):
        if not self.packhouses:
            raise ValueError("At least one packhouse is required")
        return self


# ── Step 3: Suppliers ────────────────────────────────────────

class SupplierInput(BaseModel):
    name: str
    tags: list[str] | None = None
    contact_person: str | None = None
    phone: str | None = None
    email: str | None = None
    address: str | None = None
    tax_number: str | None = None
    notes: str | None = None


class Step3Data(BaseModel):
    suppliers: list[SupplierInput] | None = None


# ── Step 4: Growers ──────────────────────────────────────────

class FieldInput(BaseModel):
    name: str
    hectares: float | None = None
    fruit_type: str | None = None


class GrowerInput(BaseModel):
    name: str
    grower_code: str | None = None
    contact_person: str | None = None
    phone: str | None = None
    email: str | None = None
    region: str | None = None
    fields: list[FieldInput] | None = None
    total_hectares: float | None = None
    estimated_volume_tons: float | None = None
    globalg_ap_certified: bool = False
    globalg_ap_number: str | None = None
    other_certifications: list[str] | None = None
    notes: str | None = None


class Step4Data(BaseModel):
    growers: list[GrowerInput] | None = None


class Step4Complete(Step4Data):
    """At least one grower is required."""
    growers: list[GrowerInput]

    @model_validator(mode="after")
    def _at_least_one(self):
        if not self.growers:
            raise ValueError("At least one grower is required")
        return self


# ── Step 5: Harvest teams ───────────────────────────────────

class HarvestTeamInput(BaseModel):
    name: str
    team_leader: str | None = None
    team_size: int | None = None
    grower_id: str | None = None
    supplier_id: str | None = None
    estimated_volume_kg: float | None = None
    fruit_types: list[str] | None = None
    assigned_fields: list[str] | None = None
    notes: str | None = None


class Step5Data(BaseModel):
    harvest_teams: list[HarvestTeamInput] | None = None


# ── Step 6: Product & packing config ────────────────────────

class ProductInput(BaseModel):
    fruit_type: str
    variety: str | None = None
    grades: list[str] | None = None
    sizes: list[str] | None = None


class PackSpecInput(BaseModel):
    name: str
    pack_type: str | None = None
    weight_kg: float | None = None
    units_per_carton: int | None = None
    cartons_per_layer: int | None = None
    layers_per_pallet: int | None = None
    target_market: str | None = None


class BoxSizeInput(BaseModel):
    name: str
    size_code: int | None = None
    fruit_count: int | None = None
    weight_kg: float = 4.0
    cost_per_unit: float | None = None
    dimensions: str | None = None
    tare_weight_kg: float = 0.0
    net_weight_target_kg: float | None = None
    min_weight_kg: float | None = None
    max_weight_kg: float | None = None


class BinTypeInput(BaseModel):
    name: str
    default_weight_kg: float = 0.0
    tare_weight_kg: float = 0.0


class BoxCapacityInput(BaseModel):
    """Per-box-size capacity override for a pallet type."""
    box_size_name: str
    capacity: int


class PalletTypeInput(BaseModel):
    name: str
    capacity_boxes: int = 240
    notes: str | None = None
    box_capacities: list[BoxCapacityInput] | None = None


class PalletRulesInput(BaseModel):
    allow_mixed_sizes: bool = False
    allow_mixed_box_types: bool = False


class Step6Data(BaseModel):
    products: list[ProductInput] | None = None
    pack_specs: list[PackSpecInput] | None = None
    box_sizes: list[BoxSizeInput] | None = None
    pallet_types: list[PalletTypeInput] | None = None
    bin_types: list[BinTypeInput] | None = None
    pallet_rules: PalletRulesInput | None = None


class Step6Complete(Step6Data):
    """At least one product config is required."""
    products: list[ProductInput]

    @model_validator(mode="after")
    def _at_least_one(self):
        if not self.products:
            raise ValueError("At least one product configuration is required")
        return self


# ── Step 7: Transport & container standards ──────────────────

class TransportInput(BaseModel):
    name: str
    container_type: str
    temp_setpoint_c: float | None = None
    temp_min_c: float | None = None
    temp_max_c: float | None = None
    pallet_capacity: int | None = None
    max_weight_kg: float | None = None
    atmosphere_settings: dict | None = None


class Step7Data(BaseModel):
    transport_configs: list[TransportInput] | None = None


# ── Step 8: Financial basics (optional) ──────────────────────

class Step8Data(BaseModel):
    currency: str | None = None
    packing_rate_per_kg: float | None = None
    cold_storage_rate_per_pallet_day: float | None = None
    transport_rate_per_pallet: float | None = None
    labour_rate_per_hour: float | None = None
    grower_payment_terms_days: int | None = None
    client_payment_terms_days: int | None = None
    additional_rates: dict | None = None
