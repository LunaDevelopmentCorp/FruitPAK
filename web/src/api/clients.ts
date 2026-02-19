import api from "./client";

// ── Types ────────────────────────────────────────────────────

export interface ClientSummary {
  id: string;
  name: string;
  contact_person: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  country: string | null;
  incoterm: string | null;
  payment_terms_days: number | null;
  currency: string | null;
  credit_limit: number | null;
  outstanding_balance: number;
  notes: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ClientCreate {
  name: string;
  contact_person?: string;
  email?: string;
  phone?: string;
  address?: string;
  country?: string;
  incoterm?: string;
  payment_terms_days?: number;
  currency?: string;
  credit_limit?: number;
  notes?: string;
}

export interface ClientUpdate {
  name?: string;
  contact_person?: string;
  email?: string;
  phone?: string;
  address?: string;
  country?: string;
  incoterm?: string;
  payment_terms_days?: number;
  currency?: string;
  credit_limit?: number;
  notes?: string;
}

// ── API calls ───────────────────────────────────────────────

export async function listClients(): Promise<ClientSummary[]> {
  const { data } = await api.get<ClientSummary[]>("/clients/");
  return data;
}

export async function createClient(payload: ClientCreate): Promise<ClientSummary> {
  const { data } = await api.post<ClientSummary>("/clients/", payload);
  return data;
}

export async function updateClient(id: string, payload: ClientUpdate): Promise<ClientSummary> {
  const { data } = await api.patch<ClientSummary>(`/clients/${id}`, payload);
  return data;
}

export async function deleteClient(id: string): Promise<ClientSummary> {
  const { data } = await api.delete<ClientSummary>(`/clients/${id}`);
  return data;
}
