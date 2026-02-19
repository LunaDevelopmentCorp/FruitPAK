import { useEffect, useState } from "react";
import { listActivity, ActivityEntry, ActivityListResponse } from "../../api/admin";

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

const ENTITY_TYPES = ["", "batch", "lot", "pallet", "container", "payment", "user"];
const ACTIONS = [
  "",
  "created",
  "updated",
  "deleted",
  "restored",
  "purged",
  "status_changed",
  "allocated",
  "deallocated",
  "user_created",
  "user_updated",
  "user_deactivated",
  "user_activated",
];

const PAGE_SIZE = 50;

export default function ActivityLogPage() {
  const [data, setData] = useState<ActivityListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [entityFilter, setEntityFilter] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [offset, setOffset] = useState(0);

  const fetchData = async (newOffset = 0) => {
    setLoading(true);
    setError(null);
    try {
      const params: Record<string, string | number> = {
        limit: PAGE_SIZE,
        offset: newOffset,
      };
      if (entityFilter) params.entity_type = entityFilter;
      if (actionFilter) params.action = actionFilter;
      const result = await listActivity(params as Parameters<typeof listActivity>[0]);
      setData(result);
      setOffset(newOffset);
    } catch {
      setError("Failed to load activity log");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData(0);
  }, [entityFilter, actionFilter]);

  const hasMore = data ? offset + PAGE_SIZE < data.total : false;

  return (
    <div>
      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4">
        <select
          value={entityFilter}
          onChange={(e) => setEntityFilter(e.target.value)}
          className="border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
        >
          <option value="">All types</option>
          {ENTITY_TYPES.filter(Boolean).map((t) => (
            <option key={t} value={t}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </option>
          ))}
        </select>

        <select
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          className="border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
        >
          <option value="">All actions</option>
          {ACTIONS.filter(Boolean).map((a) => (
            <option key={a} value={a}>
              {a.replace(/_/g, " ")}
            </option>
          ))}
        </select>

        {data && (
          <span className="text-sm text-gray-400 self-center ml-auto">
            {data.total} total entr{data.total !== 1 ? "ies" : "y"}
          </span>
        )}
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 text-red-700 rounded text-sm">{error}</div>
      )}

      {loading && !data ? (
        <p className="text-gray-400 text-sm">Loading activity log...</p>
      ) : data && data.items.length === 0 ? (
        <p className="text-gray-400 text-sm">No activity entries found.</p>
      ) : data ? (
        <>
          <div className="bg-white border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="text-left px-4 py-2 font-medium w-36">Time</th>
                  <th className="text-left px-4 py-2 font-medium w-32">User</th>
                  <th className="text-left px-4 py-2 font-medium w-28">Action</th>
                  <th className="text-left px-4 py-2 font-medium w-24">Type</th>
                  <th className="text-left px-4 py-2 font-medium w-28">Code</th>
                  <th className="text-left px-4 py-2 font-medium">Summary</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.items.map((a: ActivityEntry) => (
                  <tr key={a.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2 text-xs text-gray-400">
                      {new Date(a.created_at).toLocaleString()}
                    </td>
                    <td className="px-4 py-2 text-gray-600 truncate">{a.user_name}</td>
                    <td className="px-4 py-2">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[10px] font-medium ${
                          ACTION_COLORS[a.action] || "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {a.action.replace(/_/g, " ")}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-gray-500 text-xs">{a.entity_type}</td>
                    <td className="px-4 py-2 font-mono text-xs text-gray-700">
                      {a.entity_code || "—"}
                    </td>
                    <td className="px-4 py-2 text-gray-500 truncate max-w-xs" title={a.summary || ""}>
                      {a.summary || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between mt-4">
            <button
              onClick={() => fetchData(Math.max(0, offset - PAGE_SIZE))}
              disabled={offset === 0 || loading}
              className="text-sm text-gray-500 hover:text-gray-700 disabled:opacity-30"
            >
              Previous
            </button>
            <span className="text-xs text-gray-400">
              Showing {offset + 1}–{Math.min(offset + PAGE_SIZE, data.total)} of {data.total}
            </span>
            <button
              onClick={() => fetchData(offset + PAGE_SIZE)}
              disabled={!hasMore || loading}
              className="text-sm text-gray-500 hover:text-gray-700 disabled:opacity-30"
            >
              Next
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}
