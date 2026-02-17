import api from "./client";

interface PaginatedResponse<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

// ── Types ───────────────────────────────────────────────────

export interface PackagingStockItem {
  id: string;
  box_size_id: string | null;
  pallet_type_id: string | null;
  current_quantity: number;
  min_stock_level: number;
  name: string | null;
  weight_kg: number | null;
  cost_per_unit: number | null;
  packaging_type: string | null; // "box" | "pallet"
  created_at: string;
  updated_at: string;
}

export interface PackagingMovement {
  id: string;
  stock_id: string;
  movement_type: string; // "receipt" | "consumption" | "adjustment"
  quantity: number;
  cost_per_unit: number | null;
  reference_type: string | null;
  reference_id: string | null;
  notes: string | null;
  recorded_by: string | null;
  recorded_at: string;
}

// ── Receipt payload ─────────────────────────────────────────

export interface PackagingReceiptPayload {
  box_size_id?: string;
  pallet_type_id?: string;
  quantity: number;
  cost_per_unit?: number;
  notes?: string;
}

// ── API calls ───────────────────────────────────────────────

export async function getPackagingStock(): Promise<PackagingStockItem[]> {
  const { data } = await api.get<PackagingStockItem[]>("/packaging/stock");
  return data;
}

export async function receivePackaging(
  payload: PackagingReceiptPayload
): Promise<PackagingStockItem> {
  const { data } = await api.post<PackagingStockItem>("/packaging/receipt", payload);
  return data;
}

export async function updateMinStock(
  stockId: string,
  min_stock_level: number
): Promise<PackagingStockItem> {
  const { data } = await api.patch<PackagingStockItem>(
    `/packaging/stock/${stockId}/min`,
    { min_stock_level }
  );
  return data;
}

export async function adjustStock(
  stock_id: string,
  quantity: number,
  notes?: string
): Promise<PackagingStockItem> {
  const { data } = await api.post<PackagingStockItem>("/packaging/adjustment", {
    stock_id,
    quantity,
    notes,
  });
  return data;
}

export async function listMovements(
  params?: Record<string, string>
): Promise<PackagingMovement[]> {
  const { data } = await api.get<PaginatedResponse<PackagingMovement>>(
    "/packaging/movements",
    { params }
  );
  return data.items;
}
