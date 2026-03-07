import api from "./client";

// ── Types ───────────────────────────────────────────────────

export interface ServiceStatus {
  status: "ok" | "error" | "warning";
}

export interface DatabaseService extends ServiceStatus {
  pool_size: number;
  in_use: number;
  idle: number;
  overflow: number;
  utilization: number;
}

export interface CacheService extends ServiceStatus {
  hits: number;
  misses: number;
  total: number;
  hit_rate: number;
}

export interface HealthWarning {
  timestamp: string;
  level: string;
  category: string;
  message: string;
}

export interface SystemHealth {
  status: "healthy" | "degraded" | "unhealthy";
  uptime_seconds: number;
  services: {
    database: DatabaseService;
    redis: ServiceStatus;
    cache: CacheService;
  };
  warnings: {
    total: number;
    counts: Record<string, number>;
    recent: HealthWarning[];
  };
}

// ── API ─────────────────────────────────────────────────────

export async function getSystemHealth(): Promise<SystemHealth> {
  const { data } = await api.get<SystemHealth>("/admin/system-health");
  return data;
}
