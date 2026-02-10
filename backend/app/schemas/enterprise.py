from pydantic import BaseModel


class EnterpriseCreate(BaseModel):
    name: str
    country: str


class EnterpriseOut(BaseModel):
    id: str
    name: str
    country: str
    tenant_schema: str
    is_onboarded: bool

    model_config = {"from_attributes": True}
