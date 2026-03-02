import api from "./client";

// ── Types ──────────────────────────────────────────────────────

export interface CustomRole {
  id: string;
  name: string;
  description: string | null;
  permissions: string[];
  is_system: boolean;
  is_active: boolean;
  user_count: number;
  created_at: string;
}

export interface PermissionGroup {
  group: string;
  permissions: string[];
}

export interface BuiltinRole {
  role: string;
  permissions: string[];
}

export interface CustomRoleCreate {
  name: string;
  description?: string;
  permissions: string[];
}

export interface CustomRoleUpdate {
  name?: string;
  description?: string;
  permissions?: string[];
  is_active?: boolean;
}

// ── API Functions ──────────────────────────────────────────────

export async function listCustomRoles(): Promise<CustomRole[]> {
  const { data } = await api.get<CustomRole[]>("/roles");
  return data;
}

export async function getBuiltinRoles(): Promise<BuiltinRole[]> {
  const { data } = await api.get<BuiltinRole[]>("/roles/builtins");
  return data;
}

export async function getPermissionGroups(): Promise<PermissionGroup[]> {
  const { data } = await api.get<PermissionGroup[]>("/roles/permissions");
  return data;
}

export async function createCustomRole(
  payload: CustomRoleCreate
): Promise<CustomRole> {
  const { data } = await api.post<CustomRole>("/roles", payload);
  return data;
}

export async function updateCustomRole(
  roleId: string,
  payload: CustomRoleUpdate
): Promise<CustomRole> {
  const { data } = await api.patch<CustomRole>(`/roles/${roleId}`, payload);
  return data;
}

export async function deleteCustomRole(roleId: string): Promise<void> {
  await api.delete(`/roles/${roleId}`);
}
