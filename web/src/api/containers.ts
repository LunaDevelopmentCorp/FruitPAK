import api from "./client";

interface PaginatedResponse<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

// ── Types ────────────────────────────────────────────────────

export interface ContainerSummary {
  id: string;
  container_number: string;
  container_type: string;
  capacity_pallets: number;
  pallet_count: number;
  total_cartons: number;
  gross_weight_kg: number | null;
  customer_name: string | null;
  destination: string | null;
  status: string;
  created_at: string;
}

export interface ContainerPalletItem {
  id: string;
  pallet_number: string;
  current_boxes: number;
  fruit_type: string | null;
  grade: string | null;
  size: string | null;
  status: string;
}

export interface TraceLot {
  lot_code: string;
  grade: string | null;
  size: string | null;
  box_count: number;
}

export interface TraceBatch {
  batch_code: string;
  grower_name: string | null;
  fruit_type: string;
  intake_date: string | null;
}

export interface TracePallet {
  pallet_number: string;
  current_boxes: number;
  lots: TraceLot[];
  batches: TraceBatch[];
}

export interface ContainerDetailType extends ContainerSummary {
  export_date: string | null;
  seal_number: string | null;
  packhouse_id: string | null;
  qr_code_url: string | null;
  notes: string | null;
  updated_at: string;
  pallets: ContainerPalletItem[];
  traceability: TracePallet[];
}

// ── Create ───────────────────────────────────────────────────

export interface ContainerFromPalletsPayload {
  container_type: string;
  capacity_pallets?: number;
  pallet_ids: string[];
  customer_name?: string;
  export_date?: string;
  destination?: string;
  seal_number?: string;
  notes?: string;
}

export async function createContainerFromPallets(
  payload: ContainerFromPalletsPayload
): Promise<ContainerSummary> {
  const { data } = await api.post<ContainerSummary>("/containers/from-pallets", payload);
  return data;
}

// ── List & Detail ────────────────────────────────────────────

export async function listContainers(
  params?: Record<string, string>
): Promise<ContainerSummary[]> {
  const { data } = await api.get<PaginatedResponse<ContainerSummary>>("/containers/", { params });
  return data.items;
}

export async function getContainer(id: string): Promise<ContainerDetailType> {
  const { data } = await api.get<ContainerDetailType>(`/containers/${id}`);
  return data;
}
