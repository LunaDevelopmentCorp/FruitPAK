import client from "./client";

export interface ReconciliationAlert {
  id: string;
  alert_type: string;
  severity: "critical" | "high" | "medium" | "low";
  title: string;
  description: string;
  expected_value: number | null;
  actual_value: number | null;
  variance: number | null;
  variance_pct: number | null;
  unit: string | null;
  entity_refs: Record<string, string> | null;
  period_start: string | null;
  period_end: string | null;
  status: "open" | "acknowledged" | "resolved" | "dismissed";
  resolved_at: string | null;
  resolved_by: string | null;
  resolution_note: string | null;
  run_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface DashboardSummary {
  total_open: number;
  total_acknowledged: number;
  total_resolved_30d: number;
  by_type: Record<string, number>;
  by_severity: Record<string, number>;
  latest_run_id: string | null;
  latest_run_at: string | null;
  alerts: ReconciliationAlert[];
}

export interface RunSummary {
  run_id: string;
  ran_at: string;
  total_alerts: number;
  by_type: Record<string, number>;
  by_severity: Record<string, number>;
}

export async function getDashboard(): Promise<DashboardSummary> {
  const { data } = await client.get("/api/reconciliation/");
  return data;
}

export async function triggerRun(): Promise<RunSummary> {
  const { data } = await client.post("/api/reconciliation/run");
  return data;
}

export async function listAlerts(params?: {
  alert_type?: string;
  severity?: string;
  status?: string;
  limit?: number;
  offset?: number;
}): Promise<ReconciliationAlert[]> {
  const { data } = await client.get("/api/reconciliation/alerts", { params });
  return data;
}

export async function getAlert(id: string): Promise<ReconciliationAlert> {
  const { data } = await client.get(`/api/reconciliation/alerts/${id}`);
  return data;
}

export async function updateAlert(
  id: string,
  update: { status: string; resolution_note?: string }
): Promise<ReconciliationAlert> {
  const { data } = await client.patch(
    `/api/reconciliation/alerts/${id}`,
    update
  );
  return data;
}
