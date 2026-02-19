import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  getAdminOverview,
  AdminOverview as AdminOverviewType,
  PipelineCounts,
  StaleItem,
  ActivityEntry,
} from "../../api/admin";

const PIPELINE_COLORS: Record<string, string> = {
  // Batch
  received: "bg-blue-400",
  grading: "bg-yellow-400",
  packing: "bg-orange-400",
  complete: "bg-green-500",
  rejected: "bg-red-400",
  // Lot
  created: "bg-blue-400",
  palletizing: "bg-yellow-400",
  stored: "bg-indigo-400",
  allocated: "bg-purple-400",
  exported: "bg-green-500",
  // Pallet
  open: "bg-blue-400",
  closed: "bg-yellow-400",
  loaded: "bg-purple-400",
  // Container
  loading: "bg-yellow-400",
  sealed: "bg-indigo-400",
  dispatched: "bg-purple-400",
  delivered: "bg-green-500",
};

const ACTION_COLORS: Record<string, string> = {
  created: "bg-green-50 text-green-700",
  updated: "bg-blue-50 text-blue-700",
  deleted: "bg-red-50 text-red-700",
  restored: "bg-emerald-50 text-emerald-700",
  purged: "bg-red-50 text-red-700",
  status_changed: "bg-amber-50 text-amber-700",
  allocated: "bg-purple-50 text-purple-700",
  deallocated: "bg-orange-50 text-orange-700",
  sealed: "bg-indigo-50 text-indigo-700",
  user_created: "bg-green-50 text-green-700",
  user_updated: "bg-blue-50 text-blue-700",
  user_deactivated: "bg-red-50 text-red-700",
  user_activated: "bg-emerald-50 text-emerald-700",
};

function PipelineBar({
  label,
  counts,
  linkPrefix,
}: {
  label: string;
  counts: PipelineCounts[];
  linkPrefix: string;
}) {
  const total = counts.reduce((s, c) => s + c.count, 0);
  if (total === 0) {
    return (
      <div className="mb-3">
        <div className="flex justify-between text-xs text-gray-500 mb-1">
          <span className="font-medium">{label}</span>
          <span>0</span>
        </div>
        <div className="h-5 bg-gray-100 rounded" />
      </div>
    );
  }
  return (
    <div className="mb-3">
      <div className="flex justify-between text-xs text-gray-500 mb-1">
        <span className="font-medium">{label}</span>
        <span>{total}</span>
      </div>
      <div className="flex h-5 rounded overflow-hidden">
        {counts.map((c) => (
          <Link
            key={c.status}
            to={linkPrefix}
            title={`${c.status}: ${c.count}`}
            className={`${PIPELINE_COLORS[c.status] || "bg-gray-300"} hover:opacity-80 transition-opacity`}
            style={{ width: `${(c.count / total) * 100}%` }}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
        {counts.map((c) => (
          <span key={c.status} className="text-[10px] text-gray-500 flex items-center gap-1">
            <span
              className={`inline-block w-2 h-2 rounded-full ${
                PIPELINE_COLORS[c.status] || "bg-gray-300"
              }`}
            />
            {c.status} ({c.count})
          </span>
        ))}
      </div>
    </div>
  );
}

function formatAge(hours: number): string {
  if (hours < 24) return `${Math.round(hours)}h`;
  const days = Math.floor(hours / 24);
  return `${days}d ${Math.round(hours % 24)}h`;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return d.toLocaleDateString();
}

export default function AdminOverview() {
  const [data, setData] = useState<AdminOverviewType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const result = await getAdminOverview();
        setData(result);
      } catch {
        setError("Failed to load overview data");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) return <p className="text-gray-400 text-sm">Loading overview...</p>;
  if (error) return <p className="text-red-600 text-sm">{error}</p>;
  if (!data) return null;

  return (
    <div className="space-y-6">
      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <StatCard label="Batches today" value={data.today_batches} />
        <StatCard label="Pallets today" value={data.today_pallets} />
        <StatCard label="Containers today" value={data.today_containers} />
        <StatCard label="Unpalletized boxes" value={data.unpalletized_boxes} warn={data.unpalletized_boxes > 0} />
        <StatCard label="Waste today" value={`${data.waste_kg_today.toFixed(1)} kg`} sub={`${data.waste_kg_week.toFixed(1)} kg this week`} />
      </div>

      {/* Alerts */}
      {data.open_alerts > 0 && (
        <Link
          to="/reconciliation"
          className={`block p-3 rounded-lg border text-sm ${
            data.critical_alerts > 0
              ? "bg-red-50 border-red-200 text-red-700"
              : "bg-amber-50 border-amber-200 text-amber-700"
          }`}
        >
          {data.open_alerts} open alert{data.open_alerts !== 1 ? "s" : ""}
          {data.critical_alerts > 0 && ` (${data.critical_alerts} critical)`}
          {" — view reconciliation"}
        </Link>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Pipeline */}
        <div className="bg-white border rounded-lg p-4">
          <h2 className="text-sm font-semibold text-gray-700 mb-4">Processing Pipeline</h2>
          <PipelineBar label="Batches" counts={data.batch_pipeline} linkPrefix="/batches" />
          <PipelineBar label="Lots" counts={data.lot_pipeline} linkPrefix="/batches" />
          <PipelineBar label="Pallets" counts={data.pallet_pipeline} linkPrefix="/pallets" />
          <PipelineBar label="Containers" counts={data.container_pipeline} linkPrefix="/containers" />
        </div>

        {/* Stale items */}
        <div className="bg-white border rounded-lg p-4">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">Stale Items</h2>
          {data.stale_items.length === 0 ? (
            <p className="text-gray-400 text-sm">No stale items detected</p>
          ) : (
            <div className="space-y-1.5 max-h-52 overflow-y-auto">
              {data.stale_items.map((item: StaleItem) => (
                <Link
                  key={item.id}
                  to={`/${item.entity_type === "batch" ? "batches" : item.entity_type === "pallet" ? "pallets" : "containers"}/${item.id}`}
                  className="flex items-center justify-between px-2 py-1.5 rounded hover:bg-gray-50 text-sm"
                >
                  <span className="flex items-center gap-2">
                    <span className="text-xs bg-amber-50 text-amber-700 px-1.5 py-0.5 rounded">
                      {item.entity_type}
                    </span>
                    <span className="font-mono text-xs text-gray-700">{item.code}</span>
                  </span>
                  <span className="text-xs text-red-500 font-medium">
                    stuck {formatAge(item.age_hours)}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Recent activity */}
      <div className="bg-white border rounded-lg p-4">
        <div className="flex justify-between items-center mb-3">
          <h2 className="text-sm font-semibold text-gray-700">Recent Activity</h2>
          <Link to="/admin/activity" className="text-xs text-green-600 hover:underline">
            View all
          </Link>
        </div>
        {data.recent_activity.length === 0 ? (
          <p className="text-gray-400 text-sm">No activity recorded yet</p>
        ) : (
          <div className="space-y-1">
            {data.recent_activity.map((a: ActivityEntry) => (
              <div key={a.id} className="flex items-center gap-3 px-2 py-1.5 text-sm">
                <span className="text-xs text-gray-400 w-16 shrink-0">{formatTime(a.created_at)}</span>
                <span className="text-gray-600 w-24 shrink-0 truncate">{a.user_name}</span>
                <span
                  className={`text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0 ${
                    ACTION_COLORS[a.action] || "bg-gray-100 text-gray-600"
                  }`}
                >
                  {a.action}
                </span>
                <span className="text-gray-500 truncate">
                  {a.entity_type}
                  {a.entity_code && <span className="font-mono ml-1">{a.entity_code}</span>}
                  {a.summary && <span className="text-gray-400 ml-1">— {a.summary}</span>}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer stats */}
      <div className="text-xs text-gray-400">
        {data.active_users} active user{data.active_users !== 1 ? "s" : ""}
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  warn,
}: {
  label: string;
  value: number | string;
  sub?: string;
  warn?: boolean;
}) {
  return (
    <div className="bg-white border rounded-lg p-4">
      <p className="text-xs text-gray-500">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${warn ? "text-amber-600" : "text-gray-800"}`}>
        {value}
      </p>
      {sub && <p className="text-[10px] text-gray-400 mt-0.5">{sub}</p>}
    </div>
  );
}
