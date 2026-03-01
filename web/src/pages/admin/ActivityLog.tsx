import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { listActivity, ActivityEntry, ActivityListResponse } from "../../api/admin";
import { useTableSort, sortRows, sortableThClass } from "../../hooks/useTableSort";

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
  const { t } = useTranslation("admin");
  const [data, setData] = useState<ActivityListResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { sortCol, sortDir, toggleSort, sortIndicator } = useTableSort();
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
      setError(t("activity.loadFailed"));
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
          <option value="">{t("activity.allTypes")}</option>
          {ENTITY_TYPES.filter(Boolean).map((tp) => (
            <option key={tp} value={tp}>
              {tp.charAt(0).toUpperCase() + tp.slice(1)}
            </option>
          ))}
        </select>

        <select
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          className="border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
        >
          <option value="">{t("activity.allActions")}</option>
          {ACTIONS.filter(Boolean).map((a) => (
            <option key={a} value={a}>
              {a.replace(/_/g, " ")}
            </option>
          ))}
        </select>

        {data && (
          <span className="text-sm text-gray-400 self-center ml-auto">
            {t("activity.totalEntries", { count: data.total })}
          </span>
        )}
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 text-red-700 rounded text-sm">{error}</div>
      )}

      {loading && !data ? (
        <p className="text-gray-400 text-sm">{t("activity.loading")}</p>
      ) : data && data.items.length === 0 ? (
        <p className="text-gray-400 text-sm">{t("activity.empty")}</p>
      ) : data ? (
        <>
          <div className="bg-white border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th onClick={() => toggleSort("timestamp")} className={`text-left px-4 py-2 font-medium w-36 ${sortableThClass}`}>{t("activity.headers.time")}{sortIndicator("timestamp")}</th>
                  <th onClick={() => toggleSort("user_name")} className={`text-left px-4 py-2 font-medium w-32 ${sortableThClass}`}>{t("activity.headers.user")}{sortIndicator("user_name")}</th>
                  <th onClick={() => toggleSort("action")} className={`text-left px-4 py-2 font-medium w-28 ${sortableThClass}`}>{t("activity.headers.action")}{sortIndicator("action")}</th>
                  <th onClick={() => toggleSort("entity_type")} className={`text-left px-4 py-2 font-medium w-24 ${sortableThClass}`}>{t("activity.headers.type")}{sortIndicator("entity_type")}</th>
                  <th onClick={() => toggleSort("code")} className={`text-left px-4 py-2 font-medium w-28 ${sortableThClass}`}>{t("activity.headers.code")}{sortIndicator("code")}</th>
                  <th onClick={() => toggleSort("summary")} className={`text-left px-4 py-2 font-medium ${sortableThClass}`}>{t("activity.headers.summary")}{sortIndicator("summary")}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {sortRows(data.items, sortCol, sortDir, {
                  timestamp: (a) => a.created_at,
                  user_name: (a) => a.user_name || "",
                  action: (a) => a.action,
                  entity_type: (a) => a.entity_type,
                  code: (a) => a.entity_code || "",
                  summary: (a) => a.summary || "",
                }).map((a: ActivityEntry) => (
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
                      {a.entity_code || "\u2014"}
                    </td>
                    <td className="px-4 py-2 text-gray-500 truncate max-w-xs" title={a.summary || ""}>
                      {a.summary || "\u2014"}
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
              {t("common:actions.previous")}
            </button>
            <span className="text-xs text-gray-400">
              {t("common:pagination.showing", { start: offset + 1, end: Math.min(offset + PAGE_SIZE, data.total), total: data.total })}
            </span>
            <button
              onClick={() => fetchData(offset + PAGE_SIZE)}
              disabled={!hasMore || loading}
              className="text-sm text-gray-500 hover:text-gray-700 disabled:opacity-30"
            >
              {t("common:actions.next")}
            </button>
          </div>
        </>
      ) : null}
    </div>
  );
}
