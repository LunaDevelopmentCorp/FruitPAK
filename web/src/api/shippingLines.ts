import api from "./client";

// ── Types ────────────────────────────────────────────────────

export interface ShippingLineOut {
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

export interface ShippingLineCreate {
  name: string;
  code: string;
  contact_person?: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
}

export interface ShippingLineUpdate {
  name?: string;
  code?: string;
  contact_person?: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
}

// ── API calls ───────────────────────────────────────────────

export async function listShippingLines(): Promise<ShippingLineOut[]> {
  const { data } = await api.get<ShippingLineOut[]>("/shipping-lines/");
  return data;
}

export async function createShippingLine(payload: ShippingLineCreate): Promise<ShippingLineOut> {
  const { data } = await api.post<ShippingLineOut>("/shipping-lines/", payload);
  return data;
}

export async function updateShippingLine(id: string, payload: ShippingLineUpdate): Promise<ShippingLineOut> {
  const { data } = await api.patch<ShippingLineOut>(`/shipping-lines/${id}`, payload);
  return data;
}

export async function deleteShippingLine(id: string): Promise<ShippingLineOut> {
  const { data } = await api.delete<ShippingLineOut>(`/shipping-lines/${id}`);
  return data;
}
