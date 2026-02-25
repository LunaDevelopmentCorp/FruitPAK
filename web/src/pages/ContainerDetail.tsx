import { useEffect, useState, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { QRCodeSVG } from "qrcode.react";
import {
  getContainer,
  loadPalletsIntoContainer,
  updateContainer,
  ContainerDetailType,
  UpdateContainerPayload,
} from "../api/containers";
import { listPallets, PalletSummary } from "../api/pallets";
import { getErrorMessage } from "../api/client";
import { showToast } from "../store/toastStore";
import PageHeader from "../components/PageHeader";
import StatusBadge from "../components/StatusBadge";

const CONTAINER_TYPES = [
  "reefer_20ft",
  "reefer_40ft",
  "open_truck",
  "break_bulk",
];

export default function ContainerDetail() {
  const { t } = useTranslation("containers");
  const { containerId } = useParams<{ containerId: string }>();
  const [container, setContainer] = useState<ContainerDetailType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Edit state
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editForm, setEditForm] = useState({
    container_type: "",
    capacity_pallets: 20,
    shipping_container_number: "",
    customer_name: "",
    destination: "",
    export_date: "",
    seal_number: "",
    notes: "",
  });

  // Load-pallets modal state
  const [showLoadModal, setShowLoadModal] = useState(false);
  const [availablePallets, setAvailablePallets] = useState<PalletSummary[]>([]);
  const [selectedPalletIds, setSelectedPalletIds] = useState<Set<string>>(new Set());
  const [loadingPallets, setLoadingPallets] = useState(false);
  const [submittingLoad, setSubmittingLoad] = useState(false);

  const fetchContainer = useCallback(() => {
    if (!containerId) return;
    setLoading(true);
    getContainer(containerId)
      .then(setContainer)
      .catch(() => setError("Failed to load container"))
      .finally(() => setLoading(false));
  }, [containerId]);

  useEffect(() => {
    fetchContainer();
  }, [fetchContainer]);

  const startEditing = () => {
    if (!container) return;
    setEditForm({
      container_type: container.container_type,
      capacity_pallets: container.capacity_pallets,
      shipping_container_number: container.shipping_container_number || "",
      customer_name: container.customer_name || "",
      destination: container.destination || "",
      export_date: container.export_date
        ? new Date(container.export_date).toISOString().slice(0, 10)
        : "",
      seal_number: container.seal_number || "",
      notes: container.notes || "",
    });
    setEditing(true);
  };

  const cancelEditing = () => setEditing(false);

  const handleSaveEdit = async () => {
    if (!containerId) return;
    setSaving(true);
    try {
      const payload: UpdateContainerPayload = {
        container_type: editForm.container_type,
        capacity_pallets: editForm.capacity_pallets,
        shipping_container_number: editForm.shipping_container_number || null,
        customer_name: editForm.customer_name || null,
        destination: editForm.destination || null,
        export_date: editForm.export_date || null,
        seal_number: editForm.seal_number || null,
        notes: editForm.notes || null,
      };
      await updateContainer(containerId, payload);
      showToast("success", "Container updated");
      setEditing(false);
      fetchContainer();
    } catch (err) {
      showToast("error", getErrorMessage(err, "Failed to update container"));
    } finally {
      setSaving(false);
    }
  };

  // Open the "Load Pallets" modal and fetch available (closed) pallets
  const handleOpenLoadModal = async () => {
    setShowLoadModal(true);
    setSelectedPalletIds(new Set());
    setLoadingPallets(true);
    try {
      const pallets = await listPallets({ status: "closed" });
      const loadedIds = new Set(container?.pallets.map((p) => p.id) ?? []);
      setAvailablePallets(pallets.filter((p) => !loadedIds.has(p.id)));
    } catch (err) {
      showToast("error", getErrorMessage(err, "Failed to fetch available pallets"));
      setShowLoadModal(false);
    } finally {
      setLoadingPallets(false);
    }
  };

  const togglePalletSelection = (id: string) => {
    setSelectedPalletIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleLoadSelected = async () => {
    if (!containerId || selectedPalletIds.size === 0) return;
    setSubmittingLoad(true);
    try {
      await loadPalletsIntoContainer(containerId, {
        pallet_ids: Array.from(selectedPalletIds),
      });
      showToast("success", t("loadPallets.loaded", { count: selectedPalletIds.size }));
      setShowLoadModal(false);
      setSelectedPalletIds(new Set());
      fetchContainer();
    } catch (err) {
      showToast("error", getErrorMessage(err, t("loadPallets.loadFailed")));
    } finally {
      setSubmittingLoad(false);
    }
  };

  if (loading) return <p className="p-6 text-gray-400 text-sm">{t("detail.loading")}</p>;
  if (error) return <div className="p-6 text-red-600 text-sm">{error}</div>;
  if (!container) return <div className="p-6 text-gray-400 text-sm">{t("detail.notFound")}</div>;

  const fillPct = container.capacity_pallets > 0
    ? Math.round((container.pallet_count / container.capacity_pallets) * 100)
    : 0;

  const canLoadPallets = container.status === "open" || container.status === "loading";

  return (
    <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
      {/* Header */}
      <PageHeader
        title={container.container_number}
        backTo="/containers"
        backLabel={t("detail.backLabel")}
        action={<StatusBadge status={container.status} className="text-sm px-3 py-1" />}
      />

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card label={t("detail.pallets")} value={`${container.pallet_count} / ${container.capacity_pallets}`} />
        <Card label={t("detail.fill")} value={`${fillPct}%`} />
        <Card label={t("detail.totalCartons")} value={container.total_cartons.toLocaleString()} />
        <Card label={t("detail.weight")} value={container.gross_weight_kg ? `${container.gross_weight_kg.toLocaleString()} ${t("common:units.kg")}` : "\u2014"} />
      </div>

      {/* Fill bar */}
      <div className="bg-white rounded-lg border p-4">
        <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
          <span>{t("detail.capacity")}</span>
          <span>{container.pallet_count} / {container.capacity_pallets} {t("common:units.pallets")}</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className={`h-2 rounded-full transition-all ${
              fillPct >= 100 ? "bg-green-500" : fillPct >= 75 ? "bg-yellow-500" : "bg-blue-500"
            }`}
            style={{ width: `${Math.min(fillPct, 100)}%` }}
          />
        </div>
      </div>

      {/* Shipment info -- view or edit mode */}
      <div className="bg-white rounded-lg border p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-700">{t("detail.shipmentDetails")}</h3>
          {!editing && (
            <button
              onClick={startEditing}
              className="px-3 py-1 text-xs font-medium rounded-md border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors"
            >
              {t("common:actions.edit")}
            </button>
          )}
        </div>

        {editing ? (
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">{t("detail.containerType")}</label>
                <select
                  value={editForm.container_type}
                  onChange={(e) => setEditForm((f) => ({ ...f, container_type: e.target.value }))}
                  className="w-full border rounded px-3 py-2 text-sm"
                >
                  {CONTAINER_TYPES.map((t) => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">{t("detail.capacityPallets")}</label>
                <input
                  type="number"
                  min={1}
                  value={editForm.capacity_pallets}
                  onChange={(e) => setEditForm((f) => ({ ...f, capacity_pallets: Number(e.target.value) || 1 }))}
                  className="w-full border rounded px-3 py-2 text-sm"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">{t("detail.shippingNumber")}</label>
                <input
                  value={editForm.shipping_container_number}
                  onChange={(e) => setEditForm((f) => ({ ...f, shipping_container_number: e.target.value }))}
                  className="w-full border rounded px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">{t("detail.customer")}</label>
                <input
                  value={editForm.customer_name}
                  onChange={(e) => setEditForm((f) => ({ ...f, customer_name: e.target.value }))}
                  className="w-full border rounded px-3 py-2 text-sm"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">{t("detail.destination")}</label>
                <input
                  value={editForm.destination}
                  onChange={(e) => setEditForm((f) => ({ ...f, destination: e.target.value }))}
                  className="w-full border rounded px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">{t("detail.exportDate")}</label>
                <input
                  type="date"
                  value={editForm.export_date}
                  onChange={(e) => setEditForm((f) => ({ ...f, export_date: e.target.value }))}
                  className="w-full border rounded px-3 py-2 text-sm"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">{t("detail.sealNumber")}</label>
              <input
                value={editForm.seal_number}
                onChange={(e) => setEditForm((f) => ({ ...f, seal_number: e.target.value }))}
                className="w-full border rounded px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">{t("detail.notes")}</label>
              <textarea
                value={editForm.notes}
                onChange={(e) => setEditForm((f) => ({ ...f, notes: e.target.value }))}
                rows={2}
                className="w-full border rounded px-3 py-2 text-sm"
              />
            </div>
            <div className="flex gap-2 pt-2">
              <button
                onClick={handleSaveEdit}
                disabled={saving}
                className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 disabled:opacity-50 transition-colors"
              >
                {saving ? t("common:actions.saving") : t("common:actions.save")}
              </button>
              <button
                onClick={cancelEditing}
                disabled={saving}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
              >
                {t("common:actions.cancel")}
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-y-2 text-sm">
            <Row label={t("common:table.type")} value={container.container_type} />
            <Row label={t("detail.shippingNumber")} value={container.shipping_container_number || "\u2014"} />
            <Row label={t("detail.customer")} value={container.customer_name || "\u2014"} />
            <Row label={t("detail.destination")} value={container.destination || "\u2014"} />
            <Row label={t("detail.exportDate")} value={container.export_date ? new Date(container.export_date).toLocaleDateString() : "\u2014"} />
            <Row label={t("detail.sealNumber")} value={container.seal_number || "\u2014"} />
          </div>
        )}
      </div>

      {/* Pallets table */}
      <div className="bg-white rounded-lg border p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-700">
            {t("detail.pallets")} ({container.pallets.length})
          </h3>
          {canLoadPallets && (
            <button
              onClick={handleOpenLoadModal}
              className="px-3 py-1.5 text-xs font-medium rounded-md bg-green-600 text-white hover:bg-green-700 transition-colors"
            >
              {t("detail.loadPallets")}
            </button>
          )}
        </div>
        {container.pallets.length > 0 ? (
          <table className="w-full text-sm">
            <thead className="text-gray-500 text-xs">
              <tr>
                <th className="text-left px-2 py-1.5 font-medium">{t("detail.headers.palletNumber")}</th>
                <th className="text-left px-2 py-1.5 font-medium">{t("detail.headers.fruit")}</th>
                <th className="text-left px-2 py-1.5 font-medium">{t("detail.headers.grade")}</th>
                <th className="text-left px-2 py-1.5 font-medium">{t("detail.headers.size")}</th>
                <th className="text-left px-2 py-1.5 font-medium">{t("detail.headers.boxType")}</th>
                <th className="text-right px-2 py-1.5 font-medium">{t("detail.headers.boxes")}</th>
                <th className="text-left px-2 py-1.5 font-medium">{t("detail.headers.status")}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {container.pallets.map((p) => (
                <tr key={p.id} className="hover:bg-green-50/50 even:bg-gray-50/50">
                  <td className="px-2 py-1.5">
                    <Link to={`/pallets/${p.id}`} className="font-mono text-xs text-green-700 hover:underline">
                      {p.pallet_number}
                    </Link>
                  </td>
                  <td className="px-2 py-1.5">{p.fruit_type || "\u2014"}</td>
                  <td className="px-2 py-1.5">{p.grade || "\u2014"}</td>
                  <td className="px-2 py-1.5">{p.size || "\u2014"}</td>
                  <td className="px-2 py-1.5">{p.box_size_name || "\u2014"}</td>
                  <td className="px-2 py-1.5 text-right font-medium">{p.current_boxes}</td>
                  <td className="px-2 py-1.5">
                    <StatusBadge status={p.status} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-gray-400 text-sm">{t("detail.noPallets")}</p>
        )}
      </div>

      {/* Traceability */}
      {container.traceability.length > 0 && (
        <div className="bg-white rounded-lg border p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">
            {t("detail.traceability")}
          </h3>
          <div className="space-y-4">
            {container.traceability.map((tp) => (
              <div key={tp.pallet_number} className="border rounded p-3">
                <p className="text-xs font-semibold text-gray-600 mb-2">
                  Pallet {tp.pallet_number} ({tp.current_boxes} {t("common:units.boxes")})
                </p>

                {/* Lots */}
                {tp.lots.length > 0 && (
                  <div className="ml-4 mb-2">
                    <p className="text-xs text-gray-500 mb-1">{t("detail.lots")}</p>
                    <div className="space-y-1">
                      {tp.lots.map((lot, i) => (
                        <p key={i} className="text-xs text-gray-700">
                          <span className="font-mono text-green-700">{lot.lot_code}</span>
                          {" \u2014 "}
                          {lot.grade || "?"} / {lot.size || "?"}{lot.box_size_name ? ` \u00b7 ${lot.box_size_name}` : ""} ({lot.box_count} {t("common:units.boxes")})
                        </p>
                      ))}
                    </div>
                  </div>
                )}

                {/* Batches / Growers */}
                {tp.batches.length > 0 && (
                  <div className="ml-4">
                    <p className="text-xs text-gray-500 mb-1">{t("detail.grns")}</p>
                    <div className="space-y-1">
                      {tp.batches.map((b, i) => (
                        <p key={i} className="text-xs text-gray-700">
                          <span className="font-mono text-green-700">{b.batch_code}</span>
                          {" \u2190 "}
                          <span className="font-medium">{b.grower_name || "?"}</span>
                          {" \u00b7 "}
                          {b.fruit_type}
                          {b.intake_date && ` \u00b7 ${new Date(b.intake_date).toLocaleDateString()}`}
                        </p>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* QR Code */}
      <div className="bg-white rounded-lg border p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">{t("detail.qrCode")}</h3>
        <div className="flex flex-col items-center gap-2">
          <QRCodeSVG
            value={JSON.stringify({
              type: "container",
              container_id: container.id,
              number: container.container_number,
              container_type: container.container_type,
              customer: container.customer_name,
              destination: container.destination,
              pallets: container.pallets.map((p) => p.pallet_number).slice(0, 20),
              total_cartons: container.total_cartons,
            })}
            size={160}
            fgColor="#15803d"
            level="M"
          />
          <span className="text-xs text-gray-500 font-mono">{container.container_number}</span>
        </div>
      </div>

      {/* Notes (view mode only -- editable from edit form above) */}
      {!editing && container.notes && (
        <div className="bg-white rounded-lg border p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">{t("detail.notes")}</h3>
          <p className="text-sm text-gray-600">{container.notes}</p>
        </div>
      )}

      {/* Meta */}
      <div className="text-xs text-gray-400">
        Created: {new Date(container.created_at).toLocaleString()} | Updated: {new Date(container.updated_at).toLocaleString()}
      </div>

      {/* Load Pallets Modal */}
      {showLoadModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl mx-4 max-h-[80vh] flex flex-col">
            {/* Modal header */}
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <h2 className="text-lg font-semibold text-gray-800">{t("loadPallets.title")}</h2>
              <button
                onClick={() => setShowLoadModal(false)}
                className="text-gray-400 hover:text-gray-600 text-xl leading-none"
              >
                &times;
              </button>
            </div>

            {/* Modal body */}
            <div className="flex-1 overflow-y-auto px-5 py-4">
              {loadingPallets ? (
                <p className="text-sm text-gray-400">{t("loadPallets.loading")}</p>
              ) : availablePallets.length === 0 ? (
                <p className="text-sm text-gray-500">{t("loadPallets.empty")}</p>
              ) : (
                <>
                  <p className="text-xs text-gray-500 mb-3">
                    {t("loadPallets.help", { count: selectedPalletIds.size })}
                  </p>
                  <table className="w-full text-sm">
                    <thead className="text-gray-500 text-xs">
                      <tr>
                        <th className="text-left px-2 py-1.5 font-medium w-8">
                          <input
                            type="checkbox"
                            checked={
                              availablePallets.length > 0 &&
                              selectedPalletIds.size === availablePallets.length
                            }
                            onChange={() => {
                              if (selectedPalletIds.size === availablePallets.length) {
                                setSelectedPalletIds(new Set());
                              } else {
                                setSelectedPalletIds(new Set(availablePallets.map((p) => p.id)));
                              }
                            }}
                            className="rounded border-gray-300"
                          />
                        </th>
                        <th className="text-left px-2 py-1.5 font-medium">{t("detail.headers.palletNumber")}</th>
                        <th className="text-right px-2 py-1.5 font-medium">{t("detail.headers.boxes")}</th>
                        <th className="text-left px-2 py-1.5 font-medium">{t("detail.headers.fruit")}</th>
                        <th className="text-left px-2 py-1.5 font-medium">{t("detail.headers.grade")}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {availablePallets.map((p) => (
                        <tr
                          key={p.id}
                          className={`cursor-pointer ${
                            selectedPalletIds.has(p.id) ? "bg-green-50" : "hover:bg-gray-50"
                          }`}
                          onClick={() => togglePalletSelection(p.id)}
                        >
                          <td className="px-2 py-1.5">
                            <input
                              type="checkbox"
                              checked={selectedPalletIds.has(p.id)}
                              onChange={() => togglePalletSelection(p.id)}
                              onClick={(e) => e.stopPropagation()}
                              className="rounded border-gray-300"
                            />
                          </td>
                          <td className="px-2 py-1.5 font-mono text-xs text-green-700">
                            {p.pallet_number}
                          </td>
                          <td className="px-2 py-1.5 text-right font-medium">
                            {p.current_boxes}
                          </td>
                          <td className="px-2 py-1.5">{p.fruit_type || "\u2014"}</td>
                          <td className="px-2 py-1.5">{p.grade || "\u2014"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </>
              )}
            </div>

            {/* Modal footer */}
            <div className="flex items-center justify-end gap-3 px-5 py-4 border-t">
              <button
                onClick={() => setShowLoadModal(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
              >
                {t("common:actions.cancel")}
              </button>
              <button
                onClick={handleLoadSelected}
                disabled={selectedPalletIds.size === 0 || submittingLoad}
                className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {submittingLoad
                  ? t("loadPallets.loadingButton")
                  : t("loadPallets.loadSelected", { count: selectedPalletIds.size })}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white rounded-lg border p-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-lg font-semibold text-gray-800">{value}</p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <>
      <span className="text-gray-500">{label}</span>
      <span className="text-gray-800">{value}</span>
    </>
  );
}
