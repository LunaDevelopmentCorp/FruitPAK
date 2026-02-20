import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { listContainers, ContainerSummary, createEmptyContainer, CreateEmptyContainerPayload } from "../api/containers";
import { listClients, ClientSummary } from "../api/clients";
import { getErrorMessage } from "../api/client";
import { showToast } from "../store/toastStore";
import PageHeader from "../components/PageHeader";
import StatusBadge from "../components/StatusBadge";

const CONTAINER_TYPES = ["reefer_20ft", "reefer_40ft", "open_truck", "break_bulk"];

export default function ContainersList() {
  const navigate = useNavigate();
  const [containers, setContainers] = useState<ContainerSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");

  // Create form state
  const [showCreate, setShowCreate] = useState(false);
  const [clients, setClients] = useState<ClientSummary[]>([]);
  const [newContainerType, setNewContainerType] = useState("reefer_40ft");
  const [newCapacity, setNewCapacity] = useState(20);
  const [newClientId, setNewClientId] = useState("");
  const [newShippingNumber, setNewShippingNumber] = useState("");
  const [newDestination, setNewDestination] = useState("");
  const [newSealNumber, setNewSealNumber] = useState("");
  const [creating, setCreating] = useState(false);

  const loadContainers = () => {
    setLoading(true);
    const params: Record<string, string> = {};
    if (statusFilter) params.status = statusFilter;
    listContainers(params)
      .then(setContainers)
      .catch(() => setError("Failed to load containers"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadContainers();
  }, [statusFilter]);

  const handleOpenCreate = () => {
    setShowCreate(true);
    listClients()
      .then(setClients)
      .catch(() => showToast("error", "Failed to load clients"));
  };

  const handleCancelCreate = () => {
    setShowCreate(false);
    setNewContainerType("reefer_40ft");
    setNewCapacity(20);
    setNewClientId("");
    setNewShippingNumber("");
    setNewDestination("");
    setNewSealNumber("");
  };

  const handleCreate = async () => {
    setCreating(true);
    try {
      const payload: CreateEmptyContainerPayload = {
        container_type: newContainerType,
        capacity_pallets: newCapacity,
      };
      if (newClientId) payload.client_id = newClientId;
      if (newShippingNumber.trim()) payload.shipping_container_number = newShippingNumber.trim();
      if (newDestination.trim()) payload.destination = newDestination.trim();
      if (newSealNumber.trim()) payload.seal_number = newSealNumber.trim();

      await createEmptyContainer(payload);
      showToast("success", "Container created successfully");
      handleCancelCreate();
      loadContainers();
    } catch (err) {
      showToast("error", getErrorMessage(err, "Failed to create container"));
    } finally {
      setCreating(false);
    }
  };

  const filtered = containers.filter((c) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      c.container_number.toLowerCase().includes(q) ||
      (c.customer_name && c.customer_name.toLowerCase().includes(q)) ||
      (c.destination && c.destination.toLowerCase().includes(q)) ||
      (c.shipping_container_number && c.shipping_container_number.toLowerCase().includes(q))
    );
  });

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <PageHeader
        title="Containers"
        subtitle={`${filtered.length} container${filtered.length !== 1 ? "s" : ""}`}
        action={
          <button
            onClick={handleOpenCreate}
            className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded hover:bg-green-700"
          >
            + Create Container
          </button>
        }
      />

      {showCreate && (
        <div className="mb-6 bg-white border rounded-lg p-4">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">New Container</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Container Type</label>
              <select
                value={newContainerType}
                onChange={(e) => setNewContainerType(e.target.value)}
                className="w-full border rounded px-3 py-2 text-sm"
              >
                {CONTAINER_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Capacity</label>
              <input
                type="number"
                value={newCapacity || ""}
                onChange={(e) => setNewCapacity(Number(e.target.value))}
                className="w-full border rounded px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Client</label>
              <select
                value={newClientId}
                onChange={(e) => setNewClientId(e.target.value)}
                className="w-full border rounded px-3 py-2 text-sm"
              >
                <option value="">— None —</option>
                {clients.map((cl) => (
                  <option key={cl.id} value={cl.id}>{cl.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Shipping Container #</label>
              <input
                type="text"
                value={newShippingNumber}
                onChange={(e) => setNewShippingNumber(e.target.value)}
                placeholder="e.g. MSKU1234567"
                className="w-full border rounded px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Destination</label>
              <input
                type="text"
                value={newDestination}
                onChange={(e) => setNewDestination(e.target.value)}
                placeholder="e.g. Rotterdam, NL"
                className="w-full border rounded px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Seal Number</label>
              <input
                type="text"
                value={newSealNumber}
                onChange={(e) => setNewSealNumber(e.target.value)}
                className="w-full border rounded px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button
              onClick={handleCreate}
              disabled={creating}
              className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded hover:bg-green-700 disabled:opacity-50"
            >
              {creating ? "Creating..." : "Create"}
            </button>
            <button
              onClick={handleCancelCreate}
              disabled={creating}
              className="px-4 py-2 border text-sm rounded hover:bg-gray-50 disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

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
                <th className="text-left px-4 py-2 font-medium">Shipping #</th>
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
                    className="hover:bg-green-50/50 cursor-pointer even:bg-gray-50/50"
                  >
                    <td className="px-4 py-2 font-mono text-xs text-green-700">
                      {c.container_number}
                    </td>
                    <td className="px-4 py-2 font-mono text-xs">
                      {c.shipping_container_number || "\u2014"}
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
                      <StatusBadge status={c.status} />
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
