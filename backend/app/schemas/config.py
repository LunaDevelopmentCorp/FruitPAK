"""Pydantic schemas for config endpoints."""

from typing import Any

from pydantic import BaseModel


class BinTypeOut(BaseModel):
    id: str
    name: str
    default_weight_kg: float
    tare_weight_kg: float

    model_config = {"from_attributes": True}


class ProductConfigOut(BaseModel):
    id: str
    fruit_type: str
    variety: str | None
    grades: list[str] = []
    sizes: list[str] = []

    model_config = {"from_attributes": True}


class BoxCapacityOut(BaseModel):
    box_size_id: str
    box_size_name: str | None
    capacity: int


class PalletTypeCapacityOut(BaseModel):
    pallet_type_id: str
    pallet_type_name: str
    default_capacity: int
    box_capacities: list[BoxCapacityOut] = []


class BoxSizeSpecOut(BaseModel):
    id: str
    name: str
    weight_kg: float
    cost_per_unit: float | None = None
    dimensions: str | None = None
    tare_weight_kg: float = 0.0
    net_weight_target_kg: float | None = None
    min_weight_kg: float | None = None
    max_weight_kg: float | None = None

    model_config = {"from_attributes": True}


class FruitTypeConfig(BaseModel):
    fruit_type: str
    varieties: list[str] = []
    grades: list[str] = []
    sizes: list[str] = []


class FinancialSummaryOut(BaseModel):
    base_currency: str
    export_currencies: list[str] = []

    model_config = {"from_attributes": True}


class TenantSettingsUpdate(BaseModel):
    settings: dict[str, Any]
