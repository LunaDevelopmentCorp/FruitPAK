import api from "./client";
import { fetchAllPages } from "./fetchAll";

// ── Types ────────────────────────────────────────────────────

export interface ShippingScheduleSummary {
  id: string;
  shipping_line: string;
  vessel_name: string;
  voyage_number: string;
  port_of_loading: string;
  port_of_discharge: string;
  etd: string;
  eta: string;
  booking_cutoff: string | null;
  cargo_cutoff: string | null;
  status: string;
  source: string;
  notes: string | null;
  created_at: string;
}

export interface ShippingScheduleDetail extends ShippingScheduleSummary {
  updated_at: string;
}

// ── Create ───────────────────────────────────────────────────

export interface CreateShippingSchedulePayload {
  shipping_line: string;
  vessel_name: string;
  voyage_number: string;
  port_of_loading: string;
  port_of_discharge: string;
  etd: string;
  eta: string;
  booking_cutoff?: string;
  cargo_cutoff?: string;
  status?: string;
  notes?: string;
}

export async function createShippingSchedule(
  payload: CreateShippingSchedulePayload
): Promise<ShippingScheduleSummary> {
  const { data } = await api.post<ShippingScheduleSummary>("/shipping-schedules/", payload);
  return data;
}

// ── Update ───────────────────────────────────────────────────

export interface UpdateShippingSchedulePayload {
  shipping_line?: string;
  vessel_name?: string;
  voyage_number?: string;
  port_of_loading?: string;
  port_of_discharge?: string;
  etd?: string;
  eta?: string;
  booking_cutoff?: string | null;
  cargo_cutoff?: string | null;
  status?: string;
  notes?: string | null;
}

export async function updateShippingSchedule(
  id: string,
  payload: UpdateShippingSchedulePayload
): Promise<ShippingScheduleSummary> {
  const { data } = await api.patch<ShippingScheduleSummary>(`/shipping-schedules/${id}`, payload);
  return data;
}

// ── Delete ───────────────────────────────────────────────────

export async function deleteShippingSchedule(id: string): Promise<void> {
  await api.delete(`/shipping-schedules/${id}`);
}

// ── List & Detail ────────────────────────────────────────────

export async function listShippingSchedules(
  params?: Record<string, string>
): Promise<ShippingScheduleSummary[]> {
  const { items } = await fetchAllPages<ShippingScheduleSummary>("/shipping-schedules/", params);
  return items;
}

export async function getShippingSchedule(id: string): Promise<ShippingScheduleDetail> {
  const { data } = await api.get<ShippingScheduleDetail>(`/shipping-schedules/${id}`);
  return data;
}
