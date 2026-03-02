"""Pydantic schemas for custom role templates."""

from datetime import datetime

from pydantic import BaseModel


class CustomRoleCreate(BaseModel):
    name: str
    description: str | None = None
    permissions: list[str]


class CustomRoleUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    permissions: list[str] | None = None
    is_active: bool | None = None


class CustomRoleOut(BaseModel):
    id: str
    name: str
    description: str | None = None
    permissions: list[str]
    is_system: bool
    is_active: bool
    user_count: int = 0
    created_at: datetime

    model_config = {"from_attributes": True}


class PermissionGroupOut(BaseModel):
    group: str
    permissions: list[str]


class BuiltinRoleOut(BaseModel):
    role: str
    permissions: list[str]
