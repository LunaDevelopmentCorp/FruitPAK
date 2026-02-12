import api from "./client";
import type { LoginResponse } from "./auth";

export interface EnterpriseCreatePayload {
  name: string;
  country: string;
}

export interface EnterpriseOut {
  id: string;
  name: string;
  country: string;
  tenant_schema: string;
  is_onboarded: boolean;
}

export async function createEnterprise(
  payload: EnterpriseCreatePayload
): Promise<EnterpriseOut> {
  const { data } = await api.post<EnterpriseOut>("/enterprises/", payload);
  return data;
}

export async function reissueToken(): Promise<LoginResponse> {
  const { data } = await api.post<LoginResponse>("/enterprises/reissue-token");
  return data;
}
