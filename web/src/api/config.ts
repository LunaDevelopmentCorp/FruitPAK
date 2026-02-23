import api from "./client";

// ── Fruit type configs (aggregated from product_configs) ──────

export interface FruitTypeConfig {
  fruit_type: string;
  varieties: string[];
  grades: string[];
  sizes: string[];
}

export async function getFruitTypeConfigs(): Promise<FruitTypeConfig[]> {
  const { data } = await api.get<FruitTypeConfig[]>("/config/fruit-types");
  return data;
}

// ── Box sizes with specifications ─────────────────────────────

export interface BoxSizeSpec {
  id: string;
  name: string;
  weight_kg: number;
  cost_per_unit: number | null;
  dimensions: string | null;
  tare_weight_kg: number;
  net_weight_target_kg: number | null;
  min_weight_kg: number | null;
  max_weight_kg: number | null;
}

export async function getBoxSizeSpecs(): Promise<BoxSizeSpec[]> {
  const { data } = await api.get<BoxSizeSpec[]>("/config/box-sizes");
  return data;
}

// ── Financial summary ────────────────────────────────────────

export interface FinancialSummary {
  base_currency: string;
  export_currencies: string[];
}

export async function getFinancialSummary(): Promise<FinancialSummary> {
  const { data } = await api.get<FinancialSummary>("/config/financial-summary");
  return data;
}

// ── Tenant settings (key-value config) ────────────────────────

export type TenantSettings = Record<string, unknown>;

export async function getTenantSettings(): Promise<TenantSettings> {
  const { data } = await api.get<TenantSettings>("/config/tenant-settings");
  return data;
}

export async function updateTenantSettings(
  settings: Record<string, unknown>
): Promise<TenantSettings> {
  const { data } = await api.put<TenantSettings>("/config/tenant-settings", {
    settings,
  });
  return data;
}
