"""Pydantic schemas for the admin Deleted Items page."""

from datetime import datetime

from pydantic import BaseModel


class DeletedItemSummary(BaseModel):
    """Lightweight representation of any soft-deleted record."""

    id: str
    item_type: str  # "batch" | "lot" | "pallet" | "container"
    code: str
    label: str
    status: str
    deleted_at: datetime
    created_at: datetime

    model_config = {"from_attributes": True}


class DeletedItemsResponse(BaseModel):
    batches: list[DeletedItemSummary]
    lots: list[DeletedItemSummary]
    pallets: list[DeletedItemSummary]
    containers: list[DeletedItemSummary]
    total_count: int


class RestoreResult(BaseModel):
    id: str
    item_type: str
    code: str
    cascade_restored: list[str] = []


class PurgeResult(BaseModel):
    id: str
    item_type: str
    code: str
    cascade_purged: list[str] = []
