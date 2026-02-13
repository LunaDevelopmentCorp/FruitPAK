import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { listPallets, PalletSummary } from "../api/pallets";

const STATUS_COLORS: Record<string, string> = {
  open: "bg-blue-50 text-blue-700",
  closed: "bg-yellow-50 text-yellow-700",
  stored: "bg-green-50 text-green-700",
  allocated: "bg-purple-50 text-purple-700",
  loaded: "bg-orange-50 text-orange-700",
  exported: "bg-gray-100 text-gray-600",
};

export default function PalletsList() {
  const navigate = useNavigate();
  const [pallets, setPallets] = useState<PalletSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    setLoading(true);
    const params: Record<string, string> = {};
    if (statusFilter) params.status = statusFilter;
    listPallets(params)
      .then(setPallets)
      .catch(() => setError("Failed to load pallets"))
      .finally(() => setLoading(false));
  }, [statusFilter]);

  const filtered = pallets.filter((p) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      p.pallet_number.toLowerCase().includes(q) ||
      (p.fruit_type && p.fruit_type.toLowerCase().includes(q)) ||
      (p.grade && p.grade.toLowerCase().includes(q)) ||
      (p.size && p.size.toLowerCase().includes(q))
    );
  });

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Pallets</h1>
          <p className="text-sm text-gray-500 mt-1">
            {filtered.length} pallet{filtered.length !== 1 ? "s" : ""}
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
          {["open", "closed", "stored", "allocated", "loaded", "exported"].map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>

        <input
          type="text"
          placeholder="Search number, fruit, grade..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border rounded px-3 py-2 text-sm w-56 focus:outline-none focus:ring-2 focus:ring-green-500"
        />
      </div>

      {loading ? (
        <p className="text-gray-400 text-sm">Loading pallets...</p>
      ) : filtered.length === 0 ? (
        <p className="text-gray-400 text-sm">No pallets found.</p>
      ) : (
        <div className="bg-white rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Pallet #</th>
                <th className="text-left px-4 py-2 font-medium">Type</th>
                <th className="text-left px-4 py-2 font-medium">Fruit</th>
                <th className="text-left px-4 py-2 font-medium">Grade</th>
                <th className="text-left px-4 py-2 font-medium">Size</th>
                <th className="text-right px-4 py-2 font-medium">Boxes</th>
                <th className="text-right px-4 py-2 font-medium">Capacity</th>
                <th className="text-left px-4 py-2 font-medium">Status</th>
                <th className="text-left px-4 py-2 font-medium">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((p) => (
                <tr
                  key={p.id}
                  onClick={() => navigate(`/pallets/${p.id}`)}
                  className="hover:bg-gray-50 cursor-pointer"
                >
                  <td className="px-4 py-2 font-mono text-xs text-green-700">
                    {p.pallet_number}
                  </td>
                  <td className="px-4 py-2">{p.pallet_type_name || "\u2014"}</td>
                  <td className="px-4 py-2">{p.fruit_type || "\u2014"}</td>
                  <td className="px-4 py-2">{p.grade || "\u2014"}</td>
                  <td className="px-4 py-2">{p.size || "\u2014"}</td>
                  <td className="px-4 py-2 text-right font-medium">{p.current_boxes}</td>
                  <td className="px-4 py-2 text-right text-gray-500">{p.capacity_boxes}</td>
                  <td className="px-4 py-2">
                    <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                      STATUS_COLORS[p.status] || "bg-gray-100 text-gray-600"
                    }`}>
                      {p.status}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-gray-500">
                    {new Date(p.created_at).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
