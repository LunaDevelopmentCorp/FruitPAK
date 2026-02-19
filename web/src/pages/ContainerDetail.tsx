import { useEffect, useState, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import { getContainer, loadPalletsIntoContainer, ContainerDetailType } from "../api/containers";
import { listPallets, PalletSummary } from "../api/pallets";
import { getErrorMessage } from "../api/client";
import { showToast } from "../store/toastStore";

const STATUS_COLORS: Record<string, string> = {
  open: "bg-blue-50 text-blue-700",
  loading: "bg-yellow-50 text-yellow-700",
  sealed: "bg-green-50 text-green-700",
  dispatched: "bg-purple-50 text-purple-700",
  delivered: "bg-gray-100 text-gray-600",
};

export default function ContainerDetail() {
  const { containerId } = useParams<{ containerId: string }>();
  const [container, setContainer] = useState<ContainerDetailType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  // Open the "Load Pallets" modal and fetch available (closed) pallets
  const handleOpenLoadModal = async () => {
    setShowLoadModal(true);
    setSelectedPalletIds(new Set());
    setLoadingPallets(true);
    try {
      const pallets = await listPallets({ status: "closed" });
      // Exclude pallets already loaded in this container
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
      showToast("success", `Loaded ${selectedPalletIds.size} pallet(s) into container`);
      setShowLoadModal(false);
      setSelectedPalletIds(new Set());
      fetchContainer();
    } catch (err) {
      showToast("error", getErrorMessage(err, "Failed to load pallets"));
    } finally {
      setSubmittingLoad(false);
    }
  };

  if (loading) return <p className="p-6 text-gray-400 text-sm">Loading container...</p>;
  if (error) return <div className="p-6 text-red-600 text-sm">{error}</div>;
  if (!container) return <div className="p-6 text-gray-400 text-sm">Container not found.</div>;

  const fillPct = container.capacity_pallets > 0
    ? Math.round((container.pallet_count / container.capacity_pallets) * 100)
    : 0;

  const canLoadPallets = container.status === "open" || container.status === "loading";

  return (
    <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Link to="/containers" className="text-sm text-gray-500 hover:text-gray-700">
            &larr; All Containers
          </Link>
          <h1 className="text-2xl font-bold text-gray-800 mt-1">{container.container_number}</h1>
        </div>
        <span className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${
          STATUS_COLORS[container.status] || "bg-gray-100 text-gray-600"
        }`}>
          {container.status}
        </span>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card label="Pallets" value={`${container.pallet_count} / ${container.capacity_pallets}`} />
        <Card label="Fill" value={`${fillPct}%`} />
        <Card label="Total Cartons" value={container.total_cartons.toLocaleString()} />
        <Card label="Weight" value={container.gross_weight_kg ? `${container.gross_weight_kg.toLocaleString()} kg` : "\u2014"} />
      </div>

      {/* Fill bar */}
      <div className="bg-white rounded-lg border p-4">
        <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
          <span>Capacity</span>
          <span>{container.pallet_count} / {container.capacity_pallets} pallets</span>
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

      {/* Shipment info */}
      <div className="bg-white rounded-lg border p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Shipment Details</h3>
        <div className="grid grid-cols-2 gap-y-2 text-sm">
          <Row label="Type" value={container.container_type} />
          <Row label="Shipping Container #" value={container.shipping_container_number || "\u2014"} />
          <Row label="Customer" value={container.customer_name || "\u2014"} />
          <Row label="Destination" value={container.destination || "\u2014"} />
          <Row label="Export Date" value={container.export_date ? new Date(container.export_date).toLocaleDateString() : "\u2014"} />
          <Row label="Seal Number" value={container.seal_number || "\u2014"} />
        </div>
      </div>

      {/* Pallets table */}
      <div className="bg-white rounded-lg border p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-gray-700">
            Pallets ({container.pallets.length})
          </h3>
          {canLoadPallets && (
            <button
              onClick={handleOpenLoadModal}
              className="px-3 py-1.5 text-xs font-medium rounded-md bg-green-600 text-white hover:bg-green-700 transition-colors"
            >
              Load Pallets
            </button>
          )}
        </div>
        {container.pallets.length > 0 ? (
          <table className="w-full text-sm">
            <thead className="text-gray-500 text-xs">
              <tr>
                <th className="text-left px-2 py-1.5 font-medium">Pallet #</th>
                <th className="text-left px-2 py-1.5 font-medium">Fruit</th>
                <th className="text-left px-2 py-1.5 font-medium">Grade</th>
                <th className="text-left px-2 py-1.5 font-medium">Size</th>
                <th className="text-left px-2 py-1.5 font-medium">Box Type</th>
                <th className="text-right px-2 py-1.5 font-medium">Boxes</th>
                <th className="text-left px-2 py-1.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {container.pallets.map((p) => (
                <tr key={p.id} className="hover:bg-gray-50">
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
                    <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700">
                      {p.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-gray-400 text-sm">No pallets loaded.</p>
        )}
      </div>

      {/* Traceability */}
      {container.traceability.length > 0 && (
        <div className="bg-white rounded-lg border p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">
            Full Traceability
          </h3>
          <div className="space-y-4">
            {container.traceability.map((tp) => (
              <div key={tp.pallet_number} className="border rounded p-3">
                <p className="text-xs font-semibold text-gray-600 mb-2">
                  Pallet {tp.pallet_number} ({tp.current_boxes} boxes)
                </p>

                {/* Lots */}
                {tp.lots.length > 0 && (
                  <div className="ml-4 mb-2">
                    <p className="text-xs text-gray-500 mb-1">Lots:</p>
                    <div className="space-y-1">
                      {tp.lots.map((lot, i) => (
                        <p key={i} className="text-xs text-gray-700">
                          <span className="font-mono text-green-700">{lot.lot_code}</span>
                          {" \u2014 "}
                          {lot.grade || "?"} / {lot.size || "?"}{lot.box_size_name ? ` \u00b7 ${lot.box_size_name}` : ""} ({lot.box_count} boxes)
                        </p>
                      ))}
                    </div>
                  </div>
                )}

                {/* Batches / Growers */}
                {tp.batches.length > 0 && (
                  <div className="ml-4">
                    <p className="text-xs text-gray-500 mb-1">GRNs / Growers:</p>
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
        <h3 className="text-sm font-semibold text-gray-700 mb-3">QR Code</h3>
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

      {/* Notes */}
      {container.notes && (
        <div className="bg-white rounded-lg border p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Notes</h3>
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
              <h2 className="text-lg font-semibold text-gray-800">Load Pallets</h2>
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
                <p className="text-sm text-gray-400">Loading available pallets...</p>
              ) : availablePallets.length === 0 ? (
                <p className="text-sm text-gray-500">No closed pallets available to load.</p>
              ) : (
                <>
                  <p className="text-xs text-gray-500 mb-3">
                    Select closed pallets to load into this container. {selectedPalletIds.size} selected.
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
                        <th className="text-left px-2 py-1.5 font-medium">Pallet #</th>
                        <th className="text-right px-2 py-1.5 font-medium">Boxes</th>
                        <th className="text-left px-2 py-1.5 font-medium">Fruit</th>
                        <th className="text-left px-2 py-1.5 font-medium">Grade</th>
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
                Cancel
              </button>
              <button
                onClick={handleLoadSelected}
                disabled={selectedPalletIds.size === 0 || submittingLoad}
                className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {submittingLoad
                  ? "Loading..."
                  : `Load Selected (${selectedPalletIds.size})`}
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
