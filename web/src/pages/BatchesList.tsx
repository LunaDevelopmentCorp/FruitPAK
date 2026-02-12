import React, { useEffect, useState, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { listBatches, BatchOut } from "../api/batches";

const STATUSES = ["received", "grading", "packing", "complete", "rejected"];

const STATUS_COLORS: Record<string, string> = {
  received: "bg-blue-50 text-blue-700",
  grading: "bg-purple-50 text-purple-700",
  packing: "bg-yellow-50 text-yellow-700",
  complete: "bg-green-50 text-green-700",
  rejected: "bg-red-50 text-red-700",
};

const PAGE_SIZE = 25;

export default function BatchesList() {
  const navigate = useNavigate();
  const [batches, setBatches] = useState<BatchOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const params: Record<string, string> = {};
    if (statusFilter) params.status = statusFilter;

    listBatches(params)
      .then(setBatches)
      .catch(() => setError("Failed to load batches"))
      .finally(() => setLoading(false));
  }, [statusFilter]);

  // Client-side search filter
  const filtered = useMemo(() => {
    if (!search.trim()) return batches;
    const q = search.toLowerCase();
    return batches.filter(
      (b) =>
        b.batch_code.toLowerCase().includes(q) ||
        (b.grower_name && b.grower_name.toLowerCase().includes(q)) ||
        b.fruit_type.toLowerCase().includes(q),
    );
  }, [batches, search]);

  // Pagination
  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  // Reset page when filters change
  useEffect(() => {
    setPage(0);
  }, [statusFilter, search]);

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Batches</h1>
          <p className="text-sm text-gray-500 mt-1">
            {filtered.length} batch{filtered.length !== 1 ? "es" : ""}
          </p>
        </div>
        <Link
          to="/grn-intake"
          className="bg-green-600 text-white px-4 py-2 rounded text-sm font-medium hover:bg-green-700"
        >
          New GRN Intake
        </Link>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 text-red-700 rounded text-sm">
          {error}
        </div>
      )}

      {/* Filter bar */}
      <div className="flex items-center gap-3 mb-4">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="border rounded px-3 py-2 text-sm"
        >
          <option value="">All statuses</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
        <input
          type="text"
          placeholder="Search batch code or grower..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border rounded px-3 py-2 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-green-500"
        />
      </div>

      {/* Table */}
      {loading ? (
        <p className="text-gray-400 text-sm">Loading batches...</p>
      ) : paged.length === 0 ? (
        <p className="text-gray-400 text-sm">No batches found.</p>
      ) : (
        <>
          <div className="bg-white rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">Code</th>
                  <th className="text-left px-4 py-2 font-medium">Grower</th>
                  <th className="text-left px-4 py-2 font-medium">Fruit</th>
                  <th className="text-left px-4 py-2 font-medium">Variety</th>
                  <th className="text-right px-4 py-2 font-medium">
                    Net (kg)
                  </th>
                  <th className="text-left px-4 py-2 font-medium">Status</th>
                  <th className="text-left px-4 py-2 font-medium">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {paged.map((b) => (
                  <tr
                    key={b.id}
                    onClick={() => navigate(`/batches/${b.id}`)}
                    className="hover:bg-gray-50 cursor-pointer"
                  >
                    <td className="px-4 py-2 font-mono text-xs text-green-700">
                      {b.batch_code}
                    </td>
                    <td className="px-4 py-2">{b.grower_name || "—"}</td>
                    <td className="px-4 py-2">{b.fruit_type}</td>
                    <td className="px-4 py-2">{b.variety || "—"}</td>
                    <td className="px-4 py-2 text-right">
                      {b.net_weight_kg?.toLocaleString() ?? "—"}
                    </td>
                    <td className="px-4 py-2">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                          STATUS_COLORS[b.status] || "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {b.status}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-gray-500">
                      {b.intake_date
                        ? new Date(b.intake_date).toLocaleDateString()
                        : b.created_at
                          ? new Date(b.created_at).toLocaleDateString()
                          : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="border text-gray-600 px-3 py-1.5 rounded text-sm font-medium hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <span className="text-sm text-gray-500">
                Page {page + 1} of {totalPages}
              </span>
              <button
                onClick={() =>
                  setPage((p) => Math.min(totalPages - 1, p + 1))
                }
                disabled={page >= totalPages - 1}
                className="border text-gray-600 px-3 py-1.5 rounded text-sm font-medium hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
