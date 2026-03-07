import api from "./client";

// ── Types ──────────────────────────────────────────────────

export interface ProductionRow {
  batch_code: string;
  grower_name: string;
  grower_code: string | null;
  fruit_type: string;
  variety: string | null;
  net_weight_kg: number | null;
  lot_count: number;
  carton_count: number;
  waste_kg: number;
  class2_lots: number;
  class2_cartons: number;
  returned_lots: number;
  returned_kg: number;
  status: string;
  created_at: string;
}

export interface GrowerSummaryRow {
  grower_name: string;
  grower_code: string | null;
  delivery_count: number;
  total_gross_kg: number;
  total_net_kg: number;
  total_waste_kg: number;
  waste_pct: number;
  class2_cartons: number;
  class2_kg: number;
  returned_kg: number;
}

export interface PackoutRow {
  lot_code: string;
  grade: string | null;
  size: string | null;
  box_size_name: string | null;
  carton_count: number;
  weight_kg: number | null;
  pack_date: string | null;
  waste_kg: number;
  quality_data: Record<string, unknown> | null;
  target_market: string | null;
}

export interface PackoutResponse {
  batch_code: string;
  fruit_type: string;
  variety: string | null;
  grower_id: string;
  net_weight_kg: number | null;
  status: string;
  lots: PackoutRow[];
}

export interface PerformanceRow {
  date: string;
  batches_received: number;
  lots_packed: number;
  pallets_built: number;
  total_waste_kg: number;
  total_cartons: number;
}

export interface PackingListPalletLot {
  lot_code: string;
  grower_name: string;
  grower_code: string | null;
  grower_ggn: string | null;
  batch_code: string;
  harvest_date: string | null;
  carton_count: number;
  weight_kg: number | null;
  size: string | null;
}

export interface PackingListPallet {
  pallet_number: string;
  position: string | null;
  fruit_type: string | null;
  variety: string | null;
  grade: string | null;
  size: string | null;
  box_size: string | null;
  boxes: number;
  net_weight_kg: number | null;
  gross_weight_kg: number | null;
  lots: PackingListPalletLot[];
}

export interface PackingListResponse {
  container_number: string;
  container_type: string;
  shipping_container_number: string | null;
  customer_name: string | null;
  destination: string | null;
  seal_number: string | null;
  vessel_name: string | null;
  voyage_number: string | null;
  export_date: string | null;
  transporter_name: string | null;
  shipping_agent_name: string | null;
  pallet_count: number;
  total_cartons: number;
  total_gross_weight_kg: number;
  pallets: PackingListPallet[];
}

// ── Date range params ──────────────────────────────────────

interface DateRangeParams {
  date_from?: string;
  date_to?: string;
  packhouse_id?: string;
}

// ── API calls ──────────────────────────────────────────────

export async function getProductionReport(params: DateRangeParams): Promise<ProductionRow[]> {
  const { data } = await api.get<ProductionRow[]>("/reports/production", { params });
  return data;
}

export async function getGrowerSummary(params: DateRangeParams): Promise<GrowerSummaryRow[]> {
  const { data } = await api.get<GrowerSummaryRow[]>("/reports/grower-summary", { params });
  return data;
}

export async function getPackout(batchId: string): Promise<PackoutResponse> {
  const { data } = await api.get<PackoutResponse>(`/reports/packout/${batchId}`);
  return data;
}

export async function getPerformanceReport(params: DateRangeParams): Promise<PerformanceRow[]> {
  const { data } = await api.get<PerformanceRow[]>("/reports/performance", { params });
  return data;
}

export async function getPackingList(containerId: string): Promise<PackingListResponse> {
  const { data } = await api.get<PackingListResponse>(`/reports/packing-list/${containerId}`);
  return data;
}

// ── CSV downloads ──────────────────────────────────────────

async function downloadCsv(url: string, filename: string, params?: Record<string, string>) {
  const { data } = await api.get(url, {
    params: { ...params, format: "csv" },
    responseType: "blob",
  });
  const blob = new Blob([data], { type: "text/csv" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

export function downloadProductionCsv(params: DateRangeParams) {
  return downloadCsv("/reports/production", "production_report.csv", params as Record<string, string>);
}

export function downloadGrowerSummaryCsv(params: DateRangeParams) {
  return downloadCsv("/reports/grower-summary", "grower_summary.csv", params as Record<string, string>);
}

export function downloadPerformanceCsv(params: DateRangeParams) {
  return downloadCsv("/reports/performance", "performance_report.csv", params as Record<string, string>);
}

export function downloadPackingListCsv(containerId: string, containerNumber?: string) {
  const filename = containerNumber
    ? `packing_list_${containerNumber}.csv`
    : "packing_list.csv";
  return downloadCsv(`/reports/packing-list/${containerId}`, filename);
}
