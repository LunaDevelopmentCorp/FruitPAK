import api from "./client";

// ── Types ────────────────────────────────────────────────────

export interface ShippingAgentOut {
  id: string;
  name: string;
  code: string;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
}

export interface ShippingAgentCreate {
  name: string;
  code: string;
  contact_person?: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
}

export interface ShippingAgentUpdate {
  name?: string;
  code?: string;
  contact_person?: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
}

// ── API calls ───────────────────────────────────────────────

export async function listShippingAgents(): Promise<ShippingAgentOut[]> {
  const { data } = await api.get<ShippingAgentOut[]>("/shipping-agents/");
  return data;
}

export async function createShippingAgent(payload: ShippingAgentCreate): Promise<ShippingAgentOut> {
  const { data } = await api.post<ShippingAgentOut>("/shipping-agents/", payload);
  return data;
}

export async function updateShippingAgent(id: string, payload: ShippingAgentUpdate): Promise<ShippingAgentOut> {
  const { data } = await api.patch<ShippingAgentOut>(`/shipping-agents/${id}`, payload);
  return data;
}

export async function deleteShippingAgent(id: string): Promise<ShippingAgentOut> {
  const { data } = await api.delete<ShippingAgentOut>(`/shipping-agents/${id}`);
  return data;
}
