import api from "./client";
import { fetchAllPages } from "./fetchAll";

interface PaginatedResponse<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

export interface GrowerPaymentPayload {
  grower_id: string;
  amount: number;
  currency: string;
  payment_type: string;
  payment_date: string;
  notes?: string;
  batch_ids: string[];
}

export interface GrowerPaymentOut {
  id: string;
  payment_ref: string;
  grower_id: string;
  grower_name: string | null;
  batch_ids: string[];
  currency: string;
  gross_amount: number;
  net_amount: number;
  total_kg: number | null;
  payment_type: string;
  paid_date: string | null;
  status: string;
  notes: string | null;
  created_at: string;
}

export async function submitGrowerPayment(
  payload: GrowerPaymentPayload
): Promise<GrowerPaymentOut> {
  const { data } = await api.post<GrowerPaymentOut>("/payments/grower", payload);
  return data;
}

export interface PaymentUpdatePayload {
  amount?: number;
  payment_type?: string;
  payment_date?: string;
  notes?: string;
  status?: string;
}

export async function updateGrowerPayment(
  id: string,
  payload: PaymentUpdatePayload
): Promise<GrowerPaymentOut> {
  const { data } = await api.patch<GrowerPaymentOut>(
    `/payments/grower/${id}`,
    payload
  );
  return data;
}

export async function listGrowerPayments(
  grower_id?: string
): Promise<GrowerPaymentOut[]> {
  const params: Record<string, string> = grower_id ? { grower_id } : {};
  const { items } = await fetchAllPages<GrowerPaymentOut>("/payments/grower", params);
  return items;
}

// ── Harvest Teams (for payment forms) ────────────────────────

export interface HarvestTeamItem {
  id: string;
  name: string;
  team_leader: string | null;
  team_size: number | null;
  estimated_volume_kg: number | null;
  rate_per_kg: number | null;
  rate_currency: string;
  fruit_types: string[] | null;
  notes: string | null;
}

export async function listHarvestTeams(): Promise<HarvestTeamItem[]> {
  const { data } = await api.get<HarvestTeamItem[]>("/payments/harvest-teams");
  return data;
}

// ── Harvest Team Payments ────────────────────────────────────

export interface TeamPaymentPayload {
  harvest_team_id: string;
  amount: number;
  currency: string;
  payment_type: string;
  payment_date: string;
  notes?: string;
  batch_ids: string[];
}

export interface TeamPaymentOut {
  id: string;
  payment_ref: string;
  harvest_team_id: string;
  team_name: string | null;
  team_leader: string | null;
  batch_ids: string[];
  currency: string;
  amount: number;
  total_kg: number | null;
  total_bins: number | null;
  payment_type: string;
  payment_date: string | null;
  status: string;
  notes: string | null;
  created_at: string;
}

export interface TeamSummary {
  harvest_team_id: string;
  team_name: string;
  team_leader: string | null;
  total_batches: number;
  total_kg: number;
  total_bins: number;
  class1_kg: number;
  rate_per_kg: number | null;
  amount_owed: number;
  total_advances: number;
  total_finals: number;
  total_paid: number;
  balance: number;
}

export async function submitTeamPayment(
  payload: TeamPaymentPayload
): Promise<TeamPaymentOut> {
  const { data } = await api.post<TeamPaymentOut>("/payments/team", payload);
  return data;
}

export async function updateTeamPayment(
  id: string,
  payload: PaymentUpdatePayload
): Promise<TeamPaymentOut> {
  const { data } = await api.patch<TeamPaymentOut>(
    `/payments/team/${id}`,
    payload
  );
  return data;
}

export async function listTeamPayments(
  harvest_team_id?: string
): Promise<TeamPaymentOut[]> {
  const params: Record<string, string> = harvest_team_id ? { harvest_team_id } : {};
  const { items } = await fetchAllPages<TeamPaymentOut>("/payments/team", params);
  return items;
}

export async function getTeamSummary(): Promise<TeamSummary[]> {
  const { data } = await api.get<TeamSummary[]>("/payments/team/summary");
  return data;
}

// ── Team Reconciliation Detail ──────────────────────────────

export interface TeamReconciliationBatch {
  batch_id: string;
  batch_code: string;
  intake_date: string | null;
  intake_kg: number;
  class1_kg: number;
  harvest_rate_per_kg: number | null;
  effective_rate: number | null;
  owed: number;
}

export interface TeamReconciliationPayment {
  id: string;
  payment_ref: string;
  payment_date: string | null;
  payment_type: string;
  amount: number;
  currency: string;
}

export interface TeamReconciliationDetail {
  harvest_team_id: string;
  team_name: string;
  team_leader: string | null;
  team_rate_per_kg: number | null;
  rate_currency: string;
  batches: TeamReconciliationBatch[];
  payments: TeamReconciliationPayment[];
  total_owed: number;
  total_paid: number;
  balance: number;
}

export async function getTeamReconciliation(
  teamId: string
): Promise<TeamReconciliationDetail> {
  const { data } = await api.get<TeamReconciliationDetail>(
    `/payments/team/reconciliation/${teamId}`
  );
  return data;
}

// ── Grower Reconciliation Detail ─────────────────────────────

export interface GrowerReconciliationBatch {
  batch_id: string;
  batch_code: string;
  intake_date: string | null;
  intake_kg: number;
  status: string;
}

export interface GrowerReconciliationPayment {
  id: string;
  payment_ref: string;
  payment_date: string | null;
  payment_type: string;
  gross_amount: number;
  currency: string;
}

export interface GrowerReconciliationDetail {
  grower_id: string;
  grower_name: string;
  grower_code: string | null;
  currency: string;
  batches: GrowerReconciliationBatch[];
  payments: GrowerReconciliationPayment[];
  total_intake_kg: number;
  total_paid: number;
  total_batches: number;
}

export async function getGrowerReconciliation(
  growerId: string
): Promise<GrowerReconciliationDetail> {
  const { data } = await api.get<GrowerReconciliationDetail>(
    `/payments/grower/reconciliation/${growerId}`
  );
  return data;
}

// ── Team CRUD (individual team management) ──────────────────

export async function createHarvestTeam(
  payload: Partial<HarvestTeamItem>
): Promise<HarvestTeamItem> {
  const { data } = await api.post<HarvestTeamItem>("/harvest-teams/", payload);
  return data;
}

export async function updateHarvestTeam(
  id: string,
  payload: Partial<HarvestTeamItem>
): Promise<HarvestTeamItem> {
  const { data } = await api.patch<HarvestTeamItem>(
    `/harvest-teams/${id}`,
    payload
  );
  return data;
}

export async function deleteHarvestTeam(id: string): Promise<void> {
  await api.delete(`/harvest-teams/${id}`);
}
