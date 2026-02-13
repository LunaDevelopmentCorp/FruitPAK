import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { listContainers, ContainerSummary } from "../api/containers";

const STATUS_COLORS: Record<string, string> = {
  open: "bg-blue-50 text-blue-700",
  loading: "bg-yellow-50 text-yellow-700",
  sealed: "bg-green-50 text-green-700",
  dispatched: "bg-purple-50 text-purple-700",
  delivered: "bg-gray-100 text-gray-600",
};

export default function ContainersList() {
  const navigate = useNavigate();
  const [containers, setContainers] = useState<ContainerSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    setLoading(true);
    const params: Record<string, string> = {};
    if (statusFilter) params.status = statusFilter;
    listContainers(params)
      .then(setContainers)
      .catch(() => setError("Failed to load containers"))
      .finally(() => setLoading(false));
  }, [statusFilter]);

  const filtered = containers.filter((c) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      c.container_number.toLowerCase().includes(q) ||
      (c.customer_name && c.customer_name.toLowerCase().includes(q)) ||
      (c.destination && c.destination.toLowerCase().includes(q))
    );
  });

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Containers</h1>
          <p className="text-sm text-gray-500 mt-1">
            {filtered.length} container{filtered.length !== 1 ? "s" : ""}
          </p>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 text-red-700 rounded text-sm">{error}</div>
      )}

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="border rounded px-3 py-2 text-sm"
        >
          <option value="">All statuses</option>
          {["open", "loading", "sealed", "dispatched", "delivered"].map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>

        <input
          type="text"
          placeholder="Search number, customer, destination..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border rounded px-3 py-2 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-green-500"
        />
      </div>

      {loading ? (
        <p className="text-gray-400 text-sm">Loading containers...</p>
      ) : filtered.length === 0 ? (
        <p className="text-gray-400 text-sm">No containers found. Assign pallets to create one.</p>
      ) : (
        <div className="bg-white rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Container #</th>
                <th className="text-left px-4 py-2 font-medium">Type</th>
                <th className="text-left px-4 py-2 font-medium">Customer</th>
                <th className="text-left px-4 py-2 font-medium">Destination</th>
                <th className="text-right px-4 py-2 font-medium">Pallets</th>
                <th className="text-right px-4 py-2 font-medium">Fill %</th>
                <th className="text-right px-4 py-2 font-medium">Cartons</th>
                <th className="text-left px-4 py-2 font-medium">Status</th>
                <th className="text-left px-4 py-2 font-medium">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((c) => {
                const fillPct = c.capacity_pallets > 0
                  ? Math.round((c.pallet_count / c.capacity_pallets) * 100)
                  : 0;
                return (
                  <tr
                    key={c.id}
                    onClick={() => navigate(`/containers/${c.id}`)}
                    className="hover:bg-gray-50 cursor-pointer"
                  >
                    <td className="px-4 py-2 font-mono text-xs text-green-700">
                      {c.container_number}
                    </td>
                    <td className="px-4 py-2">{c.container_type}</td>
                    <td className="px-4 py-2">{c.customer_name || "\u2014"}</td>
                    <td className="px-4 py-2">{c.destination || "\u2014"}</td>
                    <td className="px-4 py-2 text-right font-medium">
                      {c.pallet_count}/{c.capacity_pallets}
                    </td>
                    <td className="px-4 py-2 text-right">
                      <span className={`text-xs font-medium ${
                        fillPct >= 100 ? "text-green-600" : fillPct >= 75 ? "text-yellow-600" : "text-gray-500"
                      }`}>
                        {fillPct}%
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right">{c.total_cartons.toLocaleString()}</td>
                    <td className="px-4 py-2">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                        STATUS_COLORS[c.status] || "bg-gray-100 text-gray-600"
                      }`}>
                        {c.status}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-gray-500">
                      {new Date(c.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
