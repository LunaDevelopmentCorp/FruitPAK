import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { listBatches, listGrowers, Grower } from "../api/batches";
import PageHeader from "../components/PageHeader";
import StatusBadge from "../components/StatusBadge";

const STATUSES = ["received", "grading", "packing", "complete", "rejected"];

const PAGE_SIZE = 50;

export default function BatchesList() {
  const { t } = useTranslation("batches");
  const navigate = useNavigate();
  const [batches, setBatches] = useState<BatchSummary[]>([]);
  const [growers, setGrowers] = useState<Grower[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);

  // Filters (all server-side now)
  const [statusFilter, setStatusFilter] = useState("");
  const [growerFilter, setGrowerFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // Cursor-based pagination: stack of cursors for back-navigation
  const [cursorStack, setCursorStack] = useState<string[]>([]);
  const [currentCursor, setCurrentCursor] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  // Debounce search input (300ms)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    searchTimer.current = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(searchTimer.current);
  }, [search]);

  // Load growers once for the dropdown
  useEffect(() => {
    listGrowers().catch(() => []).then(setGrowers);
  }, []);

  // Fetch batches from API (all filtering is server-side)
  const fetchBatches = useCallback(async (cursor: string | null) => {
    setLoading(true);
    setError(null);
    const params: Record<string, string> = { limit: String(PAGE_SIZE) };
    if (statusFilter) params.status = statusFilter;
    if (growerFilter) params.grower_id = growerFilter;
    if (dateFrom) params.date_from = dateFrom;
    if (dateTo) params.date_to = dateTo;
    if (debouncedSearch.trim()) params.search = debouncedSearch.trim();
    if (cursor) params.cursor = cursor;

    try {
      const resp = await listBatches(params);
      setBatches(resp.items);
      setTotal(resp.total);
      setHasMore(resp.has_more);
      setNextCursor(resp.next_cursor);
    } catch {
      setError("Failed to load batches");
    } finally {
      setLoading(false);
    }
  }, [statusFilter, growerFilter, dateFrom, dateTo, debouncedSearch]);

  // Re-fetch when filters change (reset to first page)
  useEffect(() => {
    setCursorStack([]);
    setCurrentCursor(null);
    fetchBatches(null);
  }, [fetchBatches]);

  const pageNumber = cursorStack.length + 1;

  const goNext = () => {
    if (!nextCursor) return;
    setCursorStack((s) => [...s, currentCursor ?? ""]);
    setCurrentCursor(nextCursor);
    fetchBatches(nextCursor);
  };

  const goPrev = () => {
    if (cursorStack.length === 0) return;
    const stack = [...cursorStack];
    const prev = stack.pop()!;
    setCursorStack(stack);
    const cursor = prev || null;
    setCurrentCursor(cursor);
    fetchBatches(cursor);
  };

  const hasActiveFilters = statusFilter || growerFilter || dateFrom || dateTo || debouncedSearch;

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      {/* Header */}
      <PageHeader
        title={t("list.title")}
        subtitle={`${t("list.count", { count: total })}${hasActiveFilters ? ` ${t("list.filtered")}` : ""}`}
      />

      {error && (
        <div className="mb-4 p-3 bg-red-50 text-red-700 rounded text-sm">
          {error}
        </div>
      )}

      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-3 mb-4">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="border rounded px-3 py-2 text-sm"
        >
          <option value="">{t("list.allStatuses")}</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        <select
          value={growerFilter}
          onChange={(e) => setGrowerFilter(e.target.value)}
          className="border rounded px-3 py-2 text-sm"
        >
          <option value="">{t("list.allGrowers")}</option>
          {growers.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>

        <input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          className="border rounded px-3 py-2 text-sm"
          title={t("list.fromDate")}
        />
        <span className="text-gray-400 text-sm">to</span>
        <input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          className="border rounded px-3 py-2 text-sm"
          title={t("list.toDate")}
        />

        <input
          type="text"
          placeholder={t("list.searchPlaceholder")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border rounded px-3 py-2 text-sm w-56 focus:outline-none focus:ring-2 focus:ring-green-500"
        />

        {hasActiveFilters && (
          <button
            onClick={() => {
              setStatusFilter("");
              setGrowerFilter("");
              setDateFrom("");
              setDateTo("");
              setSearch("");
            }}
            className="text-xs text-gray-500 hover:text-gray-700 underline"
          >
            {t("common:actions.clearFilters")}
          </button>
        )}
      </div>

      {/* Table */}
      {loading ? (
        <p className="text-gray-400 text-sm">{t("list.loading")}</p>
      ) : batches.length === 0 ? (
        <p className="text-gray-400 text-sm">{t("list.empty")}</p>
      ) : (
        <>
          <div className="bg-white rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">{t("common:table.code")}</th>
                  <th className="text-left px-4 py-2 font-medium">{t("list.headers.grower")}</th>
                  <th className="text-left px-4 py-2 font-medium">{t("list.headers.fruit")}</th>
                  <th className="text-left px-4 py-2 font-medium">{t("list.headers.variety")}</th>
                  <th className="text-right px-4 py-2 font-medium">{t("list.headers.bins")}</th>
                  <th className="text-right px-4 py-2 font-medium">
                    {t("list.headers.netKg")}
                  </th>
                  <th className="text-left px-4 py-2 font-medium">{t("list.headers.status")}</th>
                  <th className="text-left px-4 py-2 font-medium">{t("list.headers.date")}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {batches.map((b) => (
                  <tr
                    key={b.id}
                    onClick={() => navigate(`/batches/${b.id}`)}
                    className="hover:bg-green-50/50 cursor-pointer even:bg-gray-50/50"
                  >
                    <td className="px-4 py-2 font-mono text-xs text-green-700">
                      {b.batch_code}
                    </td>
                    <td className="px-4 py-2">{b.grower_name || "\u2014"}</td>
                    <td className="px-4 py-2">{b.fruit_type}</td>
                    <td className="px-4 py-2">{b.variety || "\u2014"}</td>
                    <td className="px-4 py-2 text-right">{b.bin_count ?? "\u2014"}</td>
                    <td className="px-4 py-2 text-right">
                      {b.net_weight_kg?.toLocaleString() ?? "\u2014"}
                    </td>
                    <td className="px-4 py-2">
                      <StatusBadge status={b.status} />
                    </td>
                    <td className="px-4 py-2 text-gray-500">
                      {b.intake_date
                        ? new Date(b.intake_date).toLocaleDateString()
                        : b.created_at
                          ? new Date(b.created_at).toLocaleDateString()
                          : "\u2014"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Cursor-based pagination */}
          {(cursorStack.length > 0 || hasMore) && (
            <div className="flex items-center justify-between mt-4">
              <button
                onClick={goPrev}
                disabled={cursorStack.length === 0}
                className="border text-gray-600 px-3 py-1.5 rounded text-sm font-medium hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {t("common:actions.previous")}
              </button>
              <span className="text-sm text-gray-500">
                Page {pageNumber}
                {total > 0 && ` \u00B7 ${total.toLocaleString()} total`}
              </span>
              <button
                onClick={goNext}
                disabled={!hasMore}
                className="border text-gray-600 px-3 py-1.5 rounded text-sm font-medium hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {t("common:actions.next")}
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
