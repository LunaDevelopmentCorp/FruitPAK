import api from "./client";

// ── Types ────────────────────────────────────────────────────

export interface PlatformStats {
  total_enterprises: number;
  active_enterprises: number;
  onboarded_enterprises: number;
  total_users: number;
  active_users: number;
}

export interface EnterpriseItem {
  id: string;
  name: string;
  country: string;
  tenant_schema: string;
  is_active: boolean;
  is_onboarded: boolean;
  created_at: string;
  user_count: number;
}

export interface PlatformUser {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
  role: string;
  is_active: boolean;
  enterprise_id: string | null;
  enterprise_name: string | null;
  created_at: string;
}

export interface EnterpriseDetail extends EnterpriseItem {
  users: PlatformUser[];
}

export interface PasswordResetResult {
  user_id: string;
  email: string;
  temporary_password: string;
}

export interface ImpersonateResult {
  access_token: string;
  refresh_token: string;
  user_email: string;
  enterprise_name: string | null;
}

// ── API functions ────────────────────────────────────────────

export async function getPlatformStats(): Promise<PlatformStats> {
  const { data } = await api.get<PlatformStats>("/platform/stats");
  return data;
}

export async function listEnterprises(): Promise<EnterpriseItem[]> {
  const { data } = await api.get<EnterpriseItem[]>("/platform/enterprises");
  return data;
}

export async function getEnterprise(id: string): Promise<EnterpriseDetail> {
  const { data } = await api.get<EnterpriseDetail>(`/platform/enterprises/${id}`);
  return data;
}

export async function updateEnterprise(
  id: string,
  payload: { is_active?: boolean; name?: string }
): Promise<EnterpriseItem> {
  const { data } = await api.patch<EnterpriseItem>(`/platform/enterprises/${id}`, payload);
  return data;
}

export async function listAllUsers(): Promise<PlatformUser[]> {
  const { data } = await api.get<PlatformUser[]>("/platform/users");
  return data;
}

export async function resetUserPassword(userId: string): Promise<PasswordResetResult> {
  const { data } = await api.post<PasswordResetResult>(`/platform/users/${userId}/reset-password`);
  return data;
}

export async function platformActivateUser(userId: string): Promise<PlatformUser> {
  const { data } = await api.post<PlatformUser>(`/platform/users/${userId}/activate`);
  return data;
}

export async function platformDeactivateUser(userId: string): Promise<PlatformUser> {
  const { data } = await api.post<PlatformUser>(`/platform/users/${userId}/deactivate`);
  return data;
}

export async function impersonateUser(userId: string): Promise<ImpersonateResult> {
  const { data } = await api.post<ImpersonateResult>(`/platform/impersonate/${userId}`);
  return data;
}
