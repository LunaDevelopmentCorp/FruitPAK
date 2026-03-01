import api from "./client";

// ── Types ────────────────────────────────────────────────────

export interface TransporterOut {
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

export interface TransporterCreate {
  name: string;
  code: string;
  contact_person?: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
}

export interface TransporterUpdate {
  name?: string;
  code?: string;
  contact_person?: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
}

// ── API calls ───────────────────────────────────────────────

export async function listTransporters(): Promise<TransporterOut[]> {
  const { data } = await api.get<TransporterOut[]>("/transporters/");
  return data;
}

export async function createTransporter(payload: TransporterCreate): Promise<TransporterOut> {
  const { data } = await api.post<TransporterOut>("/transporters/", payload);
  return data;
}

export async function updateTransporter(id: string, payload: TransporterUpdate): Promise<TransporterOut> {
  const { data } = await api.patch<TransporterOut>(`/transporters/${id}`, payload);
  return data;
}

export async function deleteTransporter(id: string): Promise<TransporterOut> {
  const { data } = await api.delete<TransporterOut>(`/transporters/${id}`);
  return data;
}
