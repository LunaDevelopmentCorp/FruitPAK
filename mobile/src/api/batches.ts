import api from "./client";

export interface Grower {
  id: string;
  name: string;
  grower_code: string;
  region: string | null;
}

export interface Packhouse {
  id: string;
  name: string;
  location: string | null;
}

export interface GRNPayload {
  grower_id: string;
  packhouse_id: string;
  fruit_type: string;
  gross_weight_kg?: number;
  variety?: string;
  harvest_date?: string;
  quality_grade?: string;
  tare_weight_kg?: number;
  arrival_temp_c?: number;
  brix_reading?: number;
  bin_count?: number;
  bin_type?: string;
  delivery_notes?: string;
}

export interface BatchOut {
  id: string;
  batch_code: string;
  grower_id: string;
  grower_name: string | null;
  packhouse_id: string;
  fruit_type: string;
  variety: string | null;
  gross_weight_kg: number | null;
  tare_weight_kg: number;
  net_weight_kg: number | null;
  status: string;
  created_at: string;
}

export interface GRNResponse {
  batch: BatchOut;
  qr_code_url: string;
  advance_payment_linked: boolean;
  advance_payment_ref: string | null;
}

export async function submitGRN(payload: GRNPayload): Promise<GRNResponse> {
  const { data } = await api.post<GRNResponse>("/batches/grn", payload);
  return data;
}

export async function listGrowers(): Promise<Grower[]> {
  const { data } = await api.get<Grower[]>("/growers/");
  return data;
}

export async function listPackhouses(): Promise<Packhouse[]> {
  const { data } = await api.get<Packhouse[]>("/packhouses/");
  return data;
}
