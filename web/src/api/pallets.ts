import api from "./client";
import { fetchAllPages } from "./fetchAll";

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
  cost_per_unit: number | null;
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
  box_size_id: string | null;
  box_size_name: string | null;
  net_weight_kg: number | null;
  status: string;
  notes: string | null;
  lot_codes?: string[];
  batch_codes?: string[];
  locked_fields?: string[];
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
  box_size_name: string | null;
}

export interface PalletDetailType extends PalletSummary {
  gross_weight_kg: number | null;
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
  size?: string;
  allow_mixed_sizes?: boolean;
  allow_mixed_box_types?: boolean;
  notes?: string;
}

export async function createPalletsFromLots(
  payload: PalletFromLotsPayload
): Promise<PalletSummary[]> {
  const { data } = await api.post<PalletSummary[]>("/pallets/from-lots", payload);
  return data;
}

// ── Create empty pallet ─────────────────────────────────────

export interface CreateEmptyPalletPayload {
  pallet_type_name: string;
  capacity_boxes: number;
  packhouse_id: string;
  size?: string;
  box_size_id?: string;
  notes?: string;
}

export async function createEmptyPallet(
  payload: CreateEmptyPalletPayload
): Promise<PalletSummary> {
  const { data } = await api.post<PalletSummary>("/pallets/", payload);
  return data;
}

// ── Update & Delete ─────────────────────────────────────────

export interface PalletUpdatePayload {
  pallet_type_name?: string;
  capacity_boxes?: number;
  fruit_type?: string;
  variety?: string;
  grade?: string;
  size?: string;
  box_size_id?: string | null;
  target_market?: string;
  cold_store_room?: string;
  cold_store_position?: string;
  notes?: string;
  net_weight_kg?: number;
  gross_weight_kg?: number;
}

export async function updatePallet(
  id: string,
  payload: PalletUpdatePayload
): Promise<PalletDetailType> {
  const { data } = await api.patch<PalletDetailType>(`/pallets/${id}`, payload);
  return data;
}

export async function deletePallet(id: string): Promise<void> {
  await api.delete(`/pallets/${id}`);
}

// ── List & Detail ────────────────────────────────────────────

export async function listPallets(
  params?: Record<string, string>
): Promise<PalletSummary[]> {
  const { items } = await fetchAllPages<PalletSummary>("/pallets/", params);
  return items;
}

export async function getPallet(id: string): Promise<PalletDetailType> {
  const { data } = await api.get<PalletDetailType>(`/pallets/${id}`);
  return data;
}

// ── Allocate boxes to existing pallet ──────────────────────

export interface AllocateBoxesPayload {
  lot_assignments: LotAssignment[];
  allow_mixed_sizes?: boolean;
  allow_mixed_box_types?: boolean;
}

export async function allocateBoxesToPallet(
  palletId: string,
  payload: AllocateBoxesPayload
): Promise<PalletSummary> {
  const { data } = await api.post<PalletSummary>(`/pallets/${palletId}/allocate`, payload);
  return data;
}

// ── Config: Bin types ────────────────────────────────────────

export interface BinTypeConfig {
  id: string;
  name: string;
  default_weight_kg: number;
  tare_weight_kg: number;
}

export async function getBinTypes(): Promise<BinTypeConfig[]> {
  const { data } = await api.get<BinTypeConfig[]>("/config/bin-types");
  return data;
}

// ── Config: Product configs ─────────────────────────────────

export interface ProductConfigItem {
  id: string;
  fruit_type: string;
  variety: string | null;
  grades: string[];
  sizes: string[];
}

export async function getProductConfigs(): Promise<ProductConfigItem[]> {
  const { data } = await api.get<ProductConfigItem[]>("/config/product-configs");
  return data;
}

// ── Config: Pallet type box capacities ──────────────────────

export interface BoxCapacityItem {
  box_size_id: string;
  box_size_name: string | null;
  capacity: number;
}

export interface PalletTypeCapacity {
  pallet_type_id: string;
  pallet_type_name: string;
  default_capacity: number;
  box_capacities: BoxCapacityItem[];
}

export async function getPalletTypeCapacities(
  palletTypeId: string
): Promise<PalletTypeCapacity> {
  const { data } = await api.get<PalletTypeCapacity>(
    `/config/pallet-type-capacities/${palletTypeId}`
  );
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
