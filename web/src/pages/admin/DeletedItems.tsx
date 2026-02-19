import { useEffect, useMemo, useState } from "react";
import {
  listDeletedItems,
  restoreDeletedItem,
  purgeDeletedItem,
  DeletedItemSummary,
  DeletedItemsResponse,
} from "../../api/admin";
import { showToast as globalToast } from "../../store/toastStore";

const TYPE_COLORS: Record<string, string> = {
  batch: "bg-blue-50 text-blue-700",
  lot: "bg-purple-50 text-purple-700",
  pallet: "bg-yellow-50 text-yellow-700",
  container: "bg-teal-50 text-teal-700",
};

const TABS = ["all", "batch", "lot", "pallet", "container"] as const;
type Tab = (typeof TABS)[number];

export default function DeletedItems() {
  const [data, setData] = useState<DeletedItemsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>("all");
  const [search, setSearch] = useState("");
  const [confirmPurge, setConfirmPurge] = useState<DeletedItemSummary | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await listDeletedItems();
      setData(result);
    } catch {
      setError("Failed to load deleted items.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const tabCounts = useMemo(() => {
    if (!data) return { all: 0, batch: 0, lot: 0, pallet: 0, container: 0 };
    return {
      all: data.total_count,
      batch: data.batches.length,
      lot: data.lots.length,
      pallet: data.pallets.length,
      container: data.containers.length,
    };
  }, [data]);

  const currentItems = useMemo(() => {
    if (!data) return [];
    let items: DeletedItemSummary[];
    switch (activeTab) {
      case "batch":
        items = data.batches;
        break;
      case "lot":
        items = data.lots;
        break;
      case "pallet":
        items = data.pallets;
        break;
      case "container":
        items = data.containers;
        break;
      default:
        items = [
          ...data.batches,
          ...data.lots,
          ...data.pallets,
          ...data.containers,
        ];
        break;
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter(
        (i) =>
          i.code.toLowerCase().includes(q) ||
          i.label.toLowerCase().includes(q)
      );
    }
    return items.sort(
      (a, b) =>
        new Date(b.deleted_at).getTime() - new Date(a.deleted_at).getTime()
    );
  }, [data, activeTab, search]);

  const handleRestore = async (item: DeletedItemSummary) => {
    setActionLoading(item.id);
    try {
      const result = await restoreDeletedItem(item.item_type, item.id);
      const extra = result.cascade_restored.length
        ? ` (+ ${result.cascade_restored.length} related items)`
        : "";
      globalToast("success", `Restored ${result.code}${extra}`);
      await fetchData();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail || "Failed to restore";
      globalToast("error", msg);
    } finally {
      setActionLoading(null);
    }
  };

  const handlePurge = async () => {
    if (!confirmPurge) return;
    const item = confirmPurge;
    setConfirmPurge(null);
    setActionLoading(item.id);
    try {
      const result = await purgeDeletedItem(item.item_type, item.id);
      const extra = result.cascade_purged.length
        ? ` (+ ${result.cascade_purged.length} related items)`
        : "";
      globalToast("success", `Permanently deleted ${result.code}${extra}`);
      await fetchData();
    } catch (err: unknown) {
      const msg =
        (err as { response?: { data?: { detail?: string } } })?.response?.data
          ?.detail || "Failed to delete permanently";
      globalToast("error", msg);
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div>
      {/* Sub-header */}
      <p className="text-sm text-gray-500 mb-4">
        {data
          ? `${data.total_count} deleted item${data.total_count !== 1 ? "s" : ""} across all types`
          : "Loading..."}
      </p>

      {error && (
        <div className="mb-4 p-3 bg-red-50 text-red-700 rounded text-sm">
          {error}
        </div>
      )}

      {/* Tabs */}
      <div className="flex flex-wrap gap-1 mb-4 border-b pb-2">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-3 py-1.5 rounded-t text-sm font-medium transition-colors ${
              activeTab === tab
                ? "bg-green-50 text-green-700 border-b-2 border-green-600"
                : "text-gray-500 hover:text-gray-700 hover:bg-gray-50"
            }`}
          >
            {tab === "all" ? "All" : tab.charAt(0).toUpperCase() + tab.slice(1) + "s"}
            <span className="ml-1.5 text-xs text-gray-400">
              ({tabCounts[tab]})
            </span>
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="mb-4">
        <input
          type="text"
          placeholder="Search by code or description..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border rounded px-3 py-2 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-green-500"
        />
      </div>

      {/* Table */}
      {loading ? (
        <p className="text-gray-400 text-sm">Loading deleted items...</p>
      ) : currentItems.length === 0 ? (
        <p className="text-gray-400 text-sm">
          {search ? "No items match your search." : "No deleted items found."}
        </p>
      ) : (
        <div className="bg-white rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="text-left px-4 py-2 font-medium">Type</th>
                <th className="text-left px-4 py-2 font-medium">Code</th>
                <th className="text-left px-4 py-2 font-medium">Description</th>
                <th className="text-left px-4 py-2 font-medium">Status</th>
                <th className="text-left px-4 py-2 font-medium">Deleted</th>
                <th className="px-4 py-2 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {currentItems.map((item) => (
                <tr key={`${item.item_type}-${item.id}`} className="hover:bg-gray-50">
                  <td className="px-4 py-2">
                    <span
                      className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                        TYPE_COLORS[item.item_type] || "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {item.item_type}
                    </span>
                  </td>
                  <td className="px-4 py-2 font-mono text-xs text-gray-700">
                    {item.code}
                  </td>
                  <td className="px-4 py-2 text-gray-600 max-w-[16rem] truncate" title={item.label}>
                    {item.label}
                  </td>
                  <td className="px-4 py-2 text-gray-500 text-xs">{item.status}</td>
                  <td className="px-4 py-2 text-gray-500 text-xs">
                    {new Date(item.deleted_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => handleRestore(item)}
                        disabled={actionLoading === item.id}
                        className="text-xs bg-green-50 text-green-700 border border-green-200 px-2.5 py-1 rounded font-medium hover:bg-green-100 disabled:opacity-50"
                      >
                        {actionLoading === item.id ? "..." : "Restore"}
                      </button>
                      <button
                        onClick={() => setConfirmPurge(item)}
                        disabled={actionLoading === item.id}
                        className="text-xs text-red-600 border border-red-200 px-2.5 py-1 rounded font-medium hover:bg-red-50 disabled:opacity-50"
                      >
                        Purge
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Purge confirmation modal */}
      {confirmPurge && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-red-700 mb-2">
              Permanently Delete?
            </h3>
            <p className="text-sm text-gray-600 mb-1">
              This will permanently remove{" "}
              <strong>{confirmPurge.code}</strong> and cannot be undone.
            </p>
            {confirmPurge.item_type === "batch" && (
              <p className="text-sm text-red-600 mb-3">
                All lots belonging to this batch will also be permanently deleted.
              </p>
            )}
            <div className="flex gap-3 mt-4">
              <button
                onClick={() => setConfirmPurge(null)}
                className="flex-1 border rounded px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handlePurge}
                className="flex-1 bg-red-600 text-white rounded px-4 py-2 text-sm font-medium hover:bg-red-700"
              >
                Delete Forever
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
