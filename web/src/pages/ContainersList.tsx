import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { listContainers, ContainerSummary, createEmptyContainer, CreateEmptyContainerPayload } from "../api/containers";
import { listClients, ClientSummary } from "../api/clients";
import { listTransporters, TransporterOut } from "../api/transporters";
import { listShippingAgents, ShippingAgentOut } from "../api/shippingAgents";
import { getErrorMessage } from "../api/client";
import { showToast } from "../store/toastStore";
import PageHeader from "../components/PageHeader";
import StatusBadge from "../components/StatusBadge";
import { useTableSort, sortRows, sortableThClass } from "../hooks/useTableSort";

const CONTAINER_TYPES = ["reefer_20ft", "reefer_40ft", "open_truck", "break_bulk"];

export default function ContainersList() {
  const { t } = useTranslation("containers");
  const navigate = useNavigate();
  const { sortCol, sortDir, toggleSort, sortIndicator } = useTableSort();
  const [containers, setContainers] = useState<ContainerSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");

  // Create form state
  const [showCreate, setShowCreate] = useState(false);
  const [clients, setClients] = useState<ClientSummary[]>([]);
  const [transporters, setTransporters] = useState<TransporterOut[]>([]);
  const [shippingAgents, setShippingAgents] = useState<ShippingAgentOut[]>([]);
  const [newContainerType, setNewContainerType] = useState("reefer_40ft");
  const [newCapacity, setNewCapacity] = useState(20);
  const [newClientId, setNewClientId] = useState("");
  const [newTransporterId, setNewTransporterId] = useState("");
  const [newShippingAgentId, setNewShippingAgentId] = useState("");
  const [newShippingNumber, setNewShippingNumber] = useState("");
  const [newDestination, setNewDestination] = useState("");
  const [newSealNumber, setNewSealNumber] = useState("");
  const [creating, setCreating] = useState(false);

  const loadContainers = () => {
    setLoading(true);
    const params: Record<string, string> = {};
    if (statusFilter) params.status = statusFilter;
    if (search.trim().length >= 3) params.search = search.trim();
    listContainers(params)
      .then(setContainers)
      .catch(() => setError("Failed to load containers"))
      .finally(() => setLoading(false));
  };

  const searchTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(loadContainers, search ? 300 : 0);
    return () => clearTimeout(searchTimer.current);
  }, [statusFilter, search]);

  const handleOpenCreate = () => {
    setShowCreate(true);
    listClients()
      .then(setClients)
      .catch(() => showToast("error", "Failed to load clients"));
    listTransporters()
      .then(setTransporters)
      .catch(() => {});
    listShippingAgents()
      .then(setShippingAgents)
      .catch(() => {});
  };

  const handleCancelCreate = () => {
    setShowCreate(false);
    setNewContainerType("reefer_40ft");
    setNewCapacity(20);
    setNewClientId("");
    setNewTransporterId("");
    setNewShippingAgentId("");
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
      if (newTransporterId) payload.transporter_id = newTransporterId;
      if (newShippingAgentId) payload.shipping_agent_id = newShippingAgentId;
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
      (c.shipping_container_number && c.shipping_container_number.toLowerCase().includes(q)) ||
      (c.pallet_numbers && c.pallet_numbers.some((p) => p.toLowerCase().includes(q))) ||
      (c.lot_codes && c.lot_codes.some((l) => l.toLowerCase().includes(q))) ||
      (c.batch_codes && c.batch_codes.some((b) => b.toLowerCase().includes(q)))
    );
  });

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <PageHeader
        title={t("list.title")}
        subtitle={t("list.count", { count: filtered.length })}
        action={
          <button
            onClick={handleOpenCreate}
            className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded hover:bg-green-700"
          >
            {t("list.createContainer")}
          </button>
        }
      />

      {showCreate && (
        <div className="mb-6 bg-white border rounded-lg p-4">
          <h2 className="text-sm font-semibold text-gray-700 mb-3">{t("create.title")}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">{t("create.containerType")}</label>
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
              <label className="block text-xs text-gray-500 mb-1">{t("create.capacity")}</label>
              <input
                type="number"
                value={newCapacity || ""}
                onChange={(e) => setNewCapacity(Number(e.target.value))}
                className="w-full border rounded px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">{t("create.client")}</label>
              <select
                value={newClientId}
                onChange={(e) => setNewClientId(e.target.value)}
                className="w-full border rounded px-3 py-2 text-sm"
              >
                <option value="">{t("create.noClient")}</option>
                {clients.map((cl) => (
                  <option key={cl.id} value={cl.id}>{cl.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">{t("create.transporter")}</label>
              <select
                value={newTransporterId}
                onChange={(e) => setNewTransporterId(e.target.value)}
                className="w-full border rounded px-3 py-2 text-sm"
              >
                <option value="">{t("create.noTransporter")}</option>
                {transporters.map((tr) => (
                  <option key={tr.id} value={tr.id}>{tr.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">{t("create.shippingAgent")}</label>
              <select
                value={newShippingAgentId}
                onChange={(e) => setNewShippingAgentId(e.target.value)}
                className="w-full border rounded px-3 py-2 text-sm"
              >
                <option value="">{t("create.noAgent")}</option>
                {shippingAgents.map((sa) => (
                  <option key={sa.id} value={sa.id}>{sa.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">{t("create.shippingNumber")}</label>
              <input
                type="text"
                value={newShippingNumber}
                onChange={(e) => setNewShippingNumber(e.target.value)}
                placeholder={t("create.shippingPlaceholder")}
                className="w-full border rounded px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">{t("create.destination")}</label>
              <input
                type="text"
                value={newDestination}
                onChange={(e) => setNewDestination(e.target.value)}
                placeholder={t("create.destinationPlaceholder")}
                className="w-full border rounded px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">{t("create.sealNumber")}</label>
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
              {creating ? t("common:actions.creating") : t("common:actions.create")}
            </button>
            <button
              onClick={handleCancelCreate}
              disabled={creating}
              className="px-4 py-2 border text-sm rounded hover:bg-gray-50 disabled:opacity-50"
            >
              {t("common:actions.cancel")}
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
          <option value="">{t("list.allStatuses")}</option>
          {["open", "loading", "sealed", "dispatched", "delivered"].map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>

        <input
          type="text"
          placeholder={t("list.searchPlaceholder")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border rounded px-3 py-2 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-green-500"
        />
      </div>

      {loading ? (
        <p className="text-gray-400 text-sm">{t("list.loading")}</p>
      ) : filtered.length === 0 ? (
        <p className="text-gray-400 text-sm">{t("list.empty")}</p>
      ) : (
        <div className="bg-white rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th onClick={() => toggleSort("container_number")} className={`text-left px-4 py-2 font-medium ${sortableThClass}`}>{t("list.headers.containerNumber")}{sortIndicator("container_number")}</th>
                <th onClick={() => toggleSort("shipping_number")} className={`text-left px-4 py-2 font-medium ${sortableThClass}`}>{t("list.headers.shippingNumber")}{sortIndicator("shipping_number")}</th>
                <th onClick={() => toggleSort("type")} className={`text-left px-4 py-2 font-medium ${sortableThClass}`}>{t("list.headers.type")}{sortIndicator("type")}</th>
                <th onClick={() => toggleSort("customer")} className={`text-left px-4 py-2 font-medium ${sortableThClass}`}>{t("list.headers.customer")}{sortIndicator("customer")}</th>
                <th onClick={() => toggleSort("destination")} className={`text-left px-4 py-2 font-medium ${sortableThClass}`}>{t("list.headers.destination")}{sortIndicator("destination")}</th>
                <th onClick={() => toggleSort("pallets")} className={`text-right px-4 py-2 font-medium ${sortableThClass}`}>{t("list.headers.pallets")}{sortIndicator("pallets")}</th>
                <th onClick={() => toggleSort("fill_pct")} className={`text-right px-4 py-2 font-medium ${sortableThClass}`}>{t("list.headers.fillPercent")}{sortIndicator("fill_pct")}</th>
                <th onClick={() => toggleSort("cartons")} className={`text-right px-4 py-2 font-medium ${sortableThClass}`}>{t("list.headers.cartons")}{sortIndicator("cartons")}</th>
                <th onClick={() => toggleSort("status")} className={`text-left px-4 py-2 font-medium ${sortableThClass}`}>{t("list.headers.status")}{sortIndicator("status")}</th>
                <th onClick={() => toggleSort("created_at")} className={`text-left px-4 py-2 font-medium ${sortableThClass}`}>{t("list.headers.date")}{sortIndicator("created_at")}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {sortRows(filtered, sortCol, sortDir, {
                container_number: (r) => r.container_number,
                shipping_number: (r) => r.shipping_container_number,
                type: (r) => r.container_type,
                customer: (r) => r.customer_name,
                destination: (r) => r.destination,
                pallets: (r) => r.pallet_count,
                fill_pct: (r) => r.capacity_pallets > 0 ? r.pallet_count / r.capacity_pallets : 0,
                cartons: (r) => r.total_cartons,
                status: (r) => r.status,
                created_at: (r) => r.created_at,
              }).map((c) => {
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
