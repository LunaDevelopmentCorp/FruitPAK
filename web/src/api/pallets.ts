import api from "./client";

interface PaginatedResponse<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

// ── Config (enterprise setup) ────────────────────────────────

export interface BoxSizeConfig {
  id: string;
  name: string;
  size_code: number | null;
  fruit_count: number | null;
  weight_kg: number;
}

export interface PalletTypeConfig {
  id: string;
  name: string;
  capacity_boxes: number;
  notes: string | null;
}

export async function getBoxSizes(): Promise<BoxSizeConfig[]> {
  const { data } = await api.get<BoxSizeConfig[]>("/pallets/config/box-sizes");
  return data;
}

export async function getPalletTypes(): Promise<PalletTypeConfig[]> {
  const { data } = await api.get<PalletTypeConfig[]>("/pallets/config/pallet-types");
  return data;
}

// ── Pallet types ─────────────────────────────────────────────

export interface PalletSummary {
  id: string;
  pallet_number: string;
  pallet_type_name: string | null;
  capacity_boxes: number;
  current_boxes: number;
  fruit_type: string | null;
  grade: string | null;
  size: string | null;
  net_weight_kg: number | null;
  status: string;
  created_at: string;
}

export interface PalletLotItem {
  id: string;
  pallet_id: string;
  lot_id: string;
  box_count: number;
  size: string | null;
  lot_code: string | null;
  grade: string | null;
}

export interface PalletDetailType extends PalletSummary {
  variety: string | null;
  target_market: string | null;
  packhouse_id: string;
  cold_store_room: string | null;
  cold_store_position: string | null;
  qr_code_url: string | null;
  notes: string | null;
  palletized_by: string | null;
  updated_at: string;
  pallet_lots: PalletLotItem[];
}

// ── Create ───────────────────────────────────────────────────

export interface LotAssignment {
  lot_id: string;
  box_count: number;
  size?: string;
}

export interface PalletFromLotsPayload {
  pallet_type_name: string;
  capacity_boxes: number;
  lot_assignments: LotAssignment[];
  packhouse_id: string;
  notes?: string;
}

export async function createPalletsFromLots(
  payload: PalletFromLotsPayload
): Promise<PalletSummary[]> {
  const { data } = await api.post<PalletSummary[]>("/pallets/from-lots", payload);
  return data;
}

// ── List & Detail ────────────────────────────────────────────

export async function listPallets(
  params?: Record<string, string>
): Promise<PalletSummary[]> {
  const { data } = await api.get<PaginatedResponse<PalletSummary>>("/pallets/", { params });
  return data.items;
}

export async function getPallet(id: string): Promise<PalletDetailType> {
  const { data } = await api.get<PalletDetailType>(`/pallets/${id}`);
  return data;
}

// ── Allocate boxes to existing pallet ──────────────────────

export interface AllocateBoxesPayload {
  lot_assignments: LotAssignment[];
}

export async function allocateBoxesToPallet(
  palletId: string,
  payload: AllocateBoxesPayload
): Promise<PalletSummary> {
  const { data } = await api.post<PalletSummary>(`/pallets/${palletId}/allocate`, payload);
  return data;
}

// ── Deallocate (remove lot allocation from pallet) ───────────

export interface DeallocateResult {
  pallet_id: string;
  pallet_lot_id: string;
  boxes_returned: number;
  pallet_status: string;
  pallet_current_boxes: number;
}

export async function deallocateFromPallet(
  palletId: string,
  palletLotId: string
): Promise<DeallocateResult> {
  const { data } = await api.delete<DeallocateResult>(
    `/pallets/${palletId}/lots/${palletLotId}`
  );
  return data;
}
