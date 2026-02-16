import api from "./client";

interface PaginatedResponse<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
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
  harvest_date: string | null;
  intake_date: string | null;
  gross_weight_kg: number | null;
  tare_weight_kg: number;
  net_weight_kg: number | null;
  status: string;
  notes: string | null;
  created_at: string;
}

export interface GRNResponse {
  batch: BatchOut;
  qr_code_url: string;
  advance_payment_linked: boolean;
  advance_payment_ref: string | null;
}

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

export async function submitGRN(payload: GRNPayload): Promise<GRNResponse> {
  const { data } = await api.post<GRNResponse>("/batches/grn", payload);
  return data;
}

export interface BatchHistoryItem {
  id: string;
  event_type: string;
  event_subtype: string | null;
  event_data: Record<string, unknown> | null;
  location_detail: string | null;
  notes: string | null;
  recorded_by: string | null;
  recorded_by_name: string | null;
  recorded_at: string;
}

export interface BatchDetail extends BatchOut {
  harvest_team_id: string | null;
  arrival_temp_c: number | null;
  brix_reading: number | null;
  quality_assessment: Record<string, unknown> | null;
  rejection_reason: string | null;
  waste_kg: number;
  waste_reason: string | null;
  bin_count: number | null;
  bin_type: string | null;
  received_by: string | null;
  received_by_name: string | null;
  updated_at: string;
  packhouse_name: string | null;
  history: BatchHistoryItem[];
  lots: LotSummary[];
}

export interface BatchUpdatePayload {
  variety?: string;
  harvest_date?: string;
  gross_weight_kg?: number;
  tare_weight_kg?: number;
  arrival_temp_c?: number;
  brix_reading?: number;
  status?: string;
  rejection_reason?: string;
  waste_kg?: number;
  waste_reason?: string;
  bin_count?: number;
  bin_type?: string;
  notes?: string;
}

export async function listBatches(params?: Record<string, string>): Promise<BatchOut[]> {
  const { data } = await api.get<PaginatedResponse<BatchOut>>("/batches/", { params });
  return data.items;
}

export async function getBatch(id: string): Promise<BatchDetail> {
  const { data } = await api.get<BatchDetail>(`/batches/${id}`);
  return data;
}

export async function updateBatch(id: string, payload: BatchUpdatePayload): Promise<BatchDetail> {
  const { data } = await api.patch<BatchDetail>(`/batches/${id}`, payload);
  return data;
}

export async function listGrowers(): Promise<Grower[]> {
  const { data } = await api.get<PaginatedResponse<Grower>>("/growers/");
  return data.items;
}

export async function listPackhouses(): Promise<Packhouse[]> {
  const { data } = await api.get<PaginatedResponse<Packhouse>>("/packhouses/");
  return data.items;
}

// ── Lots ──────────────────────────────────────────────────────

export interface LotSummary {
  id: string;
  lot_code: string;
  batch_id: string;
  grade: string | null;
  size: string | null;
  carton_count: number;
  weight_kg: number | null;
  waste_kg: number;
  waste_reason: string | null;
  palletized_boxes: number;
  status: string;
  pack_date: string | null;
  created_at: string;
}

export interface LotFromBatchItem {
  grade: string;
  size?: string;
  weight_kg?: number;
  carton_count?: number;
  pack_date?: string;
  waste_kg?: number;
  waste_reason?: string;
  notes?: string;
}

export interface LotOut extends LotSummary {
  fruit_type: string;
  variety: string | null;
  batch_code: string | null;
  grower_name: string | null;
}

export async function createLotsFromBatch(
  batchId: string,
  lots: LotFromBatchItem[]
): Promise<LotOut[]> {
  const { data } = await api.post<LotOut[]>(`/lots/from-batch/${batchId}`, {
    lots,
  });
  return data;
}

export async function listLots(
  params?: Record<string, string>
): Promise<LotSummary[]> {
  const { data } = await api.get<PaginatedResponse<LotSummary>>("/lots/", {
    params,
  });
  return data.items;
}

export async function closeProductionRun(batchId: string): Promise<BatchDetail> {
  const { data } = await api.post<BatchDetail>(`/batches/${batchId}/close`);
  return data;
}

export async function finalizeGRN(batchId: string): Promise<BatchDetail> {
  const { data } = await api.post<BatchDetail>(`/batches/${batchId}/finalize`);
  return data;
}
