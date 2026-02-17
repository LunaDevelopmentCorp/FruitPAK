"""Pydantic schemas for config endpoints."""

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
