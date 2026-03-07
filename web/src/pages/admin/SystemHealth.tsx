import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { getSystemHealth, SystemHealth as SystemHealthType, HealthWarning } from "../../api/health";

const STATUS_COLORS: Record<string, string> = {
  ok: "bg-green-500",
  error: "bg-red-500",
  warning: "bg-amber-500",
};

const OVERALL_BADGE: Record<string, { bg: string; text: string; label: string }> = {
  healthy: { bg: "bg-green-100", text: "text-green-800", label: "Healthy" },
  degraded: { bg: "bg-amber-100", text: "text-amber-800", label: "Degraded" },
  unhealthy: { bg: "bg-red-100", text: "text-red-800", label: "Unhealthy" },
};

const CATEGORY_COLORS: Record<string, string> = {
  slow_query: "bg-orange-100 text-orange-700",
  redis: "bg-red-100 text-red-700",
  rate_limit: "bg-purple-100 text-purple-700",
  cache: "bg-blue-100 text-blue-700",
};

function formatUptime(seconds: number): string {
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

function StatusDot({ status }: { status: string }) {
  return (
    <span
      className={`inline-block w-2.5 h-2.5 rounded-full ${STATUS_COLORS[status] || "bg-gray-400"}`}
    />
  );
}

export default function SystemHealth() {
  const { t } = useTranslation("admin");
  const [data, setData] = useState<SystemHealthType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchHealth = async () => {
    try {
      const result = await getSystemHealth();
      setData(result);
      setError(null);
    } catch {
      setError(t("health.loadFailed"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHealth();
    intervalRef.current = setInterval(fetchHealth, 30000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  if (loading) return <p className="text-gray-400 text-sm">{t("health.loading")}</p>;
  if (error && !data) return <p className="text-red-600 text-sm">{error}</p>;
  if (!data) return null;

  const badge = OVERALL_BADGE[data.status] || OVERALL_BADGE.healthy;
  const db = data.services.database;
  const redis = data.services.redis;
  const cache = data.services.cache;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-4">
        <span className={`px-3 py-1 rounded-full text-sm font-medium ${badge.bg} ${badge.text}`}>
          {t(`health.status.${data.status}`)}
        </span>
        <span className="text-sm text-gray-500">
          {t("health.uptime")}: {formatUptime(data.uptime_seconds)}
        </span>
        <button
          onClick={() => { setLoading(true); fetchHealth(); }}
          className="ml-auto text-xs text-green-600 hover:text-green-800 font-medium"
        >
          {t("health.refresh")}
        </button>
      </div>

      {/* Service cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Database */}
        <div className="bg-white border rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <StatusDot status={db.status} />
            <span className="text-sm font-semibold text-gray-700">{t("health.services.database")}</span>
          </div>
          <div className="space-y-2">
            <div>
              <div className="flex justify-between text-xs text-gray-500 mb-1">
                <span>{t("health.pool.utilization")}</span>
                <span>{Math.round(db.utilization * 100)}%</span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    db.utilization > 0.8 ? "bg-red-500" : db.utilization > 0.5 ? "bg-amber-500" : "bg-green-500"
                  }`}
                  style={{ width: `${Math.min(db.utilization * 100, 100)}%` }}
                />
              </div>
            </div>
            <div className="flex justify-between text-xs text-gray-500">
              <span>{t("health.pool.inUse")}: {db.in_use}</span>
              <span>{t("health.pool.idle")}: {db.idle}</span>
              <span>{t("health.pool.size")}: {db.pool_size}</span>
            </div>
          </div>
        </div>

        {/* Redis */}
        <div className="bg-white border rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <StatusDot status={redis.status} />
            <span className="text-sm font-semibold text-gray-700">{t("health.services.redis")}</span>
          </div>
          <p className="text-xs text-gray-500">
            {redis.status === "ok" ? t("health.connected") : t("health.disconnected")}
          </p>
        </div>

        {/* Cache */}
        <div className="bg-white border rounded-lg p-4">
          <div className="flex items-center gap-2 mb-3">
            <StatusDot status={cache.status} />
            <span className="text-sm font-semibold text-gray-700">{t("health.services.cache")}</span>
          </div>
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-gray-500">
              <span>{t("health.cache.hitRate")}</span>
              <span className="font-medium">{Math.round(cache.hit_rate * 100)}%</span>
            </div>
            <div className="flex justify-between text-xs text-gray-500">
              <span>{t("health.cache.hits")}: {cache.hits}</span>
              <span>{t("health.cache.misses")}: {cache.misses}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Warning log */}
      <div className="bg-white border rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-700">
            {t("health.warnings.title")}
            {data.warnings.total > 0 && (
              <span className="ml-2 text-xs text-gray-400">({data.warnings.total})</span>
            )}
          </h2>
        </div>
        {data.warnings.recent.length === 0 ? (
          <p className="text-gray-400 text-sm">{t("health.warnings.empty")}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 border-b">
                  <th className="pb-2 pr-3">{t("health.warnings.time")}</th>
                  <th className="pb-2 pr-3">{t("health.warnings.category")}</th>
                  <th className="pb-2">{t("health.warnings.message")}</th>
                </tr>
              </thead>
              <tbody>
                {data.warnings.recent.map((w: HealthWarning, i: number) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="py-2 pr-3 text-xs text-gray-400 whitespace-nowrap">
                      {formatTimestamp(w.timestamp)}
                    </td>
                    <td className="py-2 pr-3">
                      <span
                        className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                          CATEGORY_COLORS[w.category] || "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {w.category}
                      </span>
                    </td>
                    <td className="py-2 text-xs text-gray-600 break-all">{w.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
