import api from "./client";

// ── Deleted Items ────────────────────────────────────────────

export interface DeletedItemSummary {
  id: string;
  item_type: string;
  code: string;
  label: string;
  status: string;
  deleted_at: string;
  created_at: string;
}

export interface DeletedItemsResponse {
  batches: DeletedItemSummary[];
  lots: DeletedItemSummary[];
  pallets: DeletedItemSummary[];
  containers: DeletedItemSummary[];
  total_count: number;
}

export interface RestoreResult {
  id: string;
  item_type: string;
  code: string;
  cascade_restored: string[];
}

export interface PurgeResult {
  id: string;
  item_type: string;
  code: string;
  cascade_purged: string[];
}

export async function listDeletedItems(
  itemType?: string
): Promise<DeletedItemsResponse> {
  const params: Record<string, string> = {};
  if (itemType) params.item_type = itemType;
  const { data } = await api.get<DeletedItemsResponse>(
    "/admin/deleted-items",
    { params }
  );
  return data;
}

export async function restoreDeletedItem(
  itemType: string,
  itemId: string
): Promise<RestoreResult> {
  const { data } = await api.post<RestoreResult>(
    `/admin/deleted-items/${itemType}/${itemId}/restore`
  );
  return data;
}

export async function purgeDeletedItem(
  itemType: string,
  itemId: string
): Promise<PurgeResult> {
  const { data } = await api.delete<PurgeResult>(
    `/admin/deleted-items/${itemType}/${itemId}/purge`
  );
  return data;
}

// ── Overview ─────────────────────────────────────────────────

export interface PipelineCounts {
  status: string;
  count: number;
}

export interface StaleItem {
  id: string;
  code: string;
  entity_type: string;
  status: string;
  age_hours: number;
}

export interface ActivityEntry {
  id: string;
  user_name: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  entity_code: string | null;
  summary: string | null;
  created_at: string;
}

export interface AdminOverview {
  batch_pipeline: PipelineCounts[];
  lot_pipeline: PipelineCounts[];
  pallet_pipeline: PipelineCounts[];
  container_pipeline: PipelineCounts[];
  today_batches: number;
  today_pallets: number;
  today_containers: number;
  waste_kg_today: number;
  waste_kg_week: number;
  unpalletized_boxes: number;
  stale_items: StaleItem[];
  open_alerts: number;
  critical_alerts: number;
  active_users: number;
  recent_activity: ActivityEntry[];
}

export async function getAdminOverview(): Promise<AdminOverview> {
  const { data } = await api.get<AdminOverview>("/admin/overview");
  return data;
}

// ── Activity Log ─────────────────────────────────────────────

export interface ActivityListResponse {
  items: ActivityEntry[];
  total: number;
}

export async function listActivity(params?: {
  entity_type?: string;
  action?: string;
  limit?: number;
  offset?: number;
}): Promise<ActivityListResponse> {
  const { data } = await api.get<ActivityListResponse>("/admin/activity", {
    params,
  });
  return data;
}

// ── User Management ──────────────────────────────────────────

export interface UserSummary {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
  role: string;
  is_active: boolean;
  assigned_packhouses: string[] | null;
  created_at: string;
}

export interface UserUpdate {
  role?: string;
  full_name?: string;
  phone?: string;
  assigned_packhouses?: string[];
}

export interface CreateUserPayload {
  email: string;
  password?: string;
  full_name: string;
  phone?: string;
  role?: string;
  assigned_packhouses?: string[];
}

export async function listUsers(): Promise<UserSummary[]> {
  const { data } = await api.get<UserSummary[]>("/admin/users");
  return data;
}

export async function updateUser(
  userId: string,
  payload: UserUpdate
): Promise<UserSummary> {
  const { data } = await api.patch<UserSummary>(
    `/admin/users/${userId}`,
    payload
  );
  return data;
}

export async function deactivateUser(userId: string): Promise<UserSummary> {
  const { data } = await api.post<UserSummary>(
    `/admin/users/${userId}/deactivate`
  );
  return data;
}

export async function activateUser(userId: string): Promise<UserSummary> {
  const { data } = await api.post<UserSummary>(
    `/admin/users/${userId}/activate`
  );
  return data;
}

export async function createUser(
  payload: CreateUserPayload
): Promise<UserSummary> {
  const { data } = await api.post<UserSummary>("/auth/signup", payload);
  return data;
}
