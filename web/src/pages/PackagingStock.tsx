import React, { useEffect, useState, useCallback } from "react";
import {
  getPackagingStock,
  receivePackaging,
  updateMinStock,
  adjustStock,
  writeOffStock,
  listMovements,
  PackagingStockItem,
  PackagingMovement,
  MovementFilters,
} from "../api/packaging";
import { getErrorMessage } from "../api/client";
import { showToast as globalToast } from "../store/toastStore";
import PageHeader from "../components/PageHeader";

const MOVEMENT_TYPES = [
  { value: "", label: "All types" },
  { value: "receipt", label: "Receipt" },
  { value: "consumption", label: "Consumption" },
  { value: "adjustment", label: "Adjustment" },
  { value: "write_off", label: "Write-off" },
  { value: "reversal", label: "Reversal" },
];

const WRITE_OFF_REASONS = ["lost", "damaged", "expired", "other"] as const;

function movementBadgeClass(type: string): string {
  switch (type) {
    case "receipt": return "bg-green-50 text-green-700";
    case "consumption": return "bg-blue-50 text-blue-700";
    case "reversal": return "bg-yellow-50 text-yellow-700";
    case "write_off": return "bg-red-50 text-red-700";
    default: return "bg-gray-100 text-gray-600";
  }
}

function movementLabel(type: string): string {
  return type === "write_off" ? "write-off" : type;
}

export default function PackagingStock() {
  const [stock, setStock] = useState<PackagingStockItem[]>([]);
  const [movements, setMovements] = useState<PackagingMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"stock" | "movements">("stock");

  // Receive form state
  const [showReceive, setShowReceive] = useState(false);
  const [receiveStockId, setReceiveStockId] = useState("");
  const [receiveQty, setReceiveQty] = useState(0);
  const [receiveCost, setReceiveCost] = useState<number | undefined>();
  const [receiveNotes, setReceiveNotes] = useState("");
  const [receiveSaving, setReceiveSaving] = useState(false);

  // Adjustment form state
  const [adjustingId, setAdjustingId] = useState<string | null>(null);
  const [adjustQty, setAdjustQty] = useState(0);
  const [adjustNotes, setAdjustNotes] = useState("");
  const [adjustSaving, setAdjustSaving] = useState(false);

  // Write-off form state
  const [writeOffId, setWriteOffId] = useState<string | null>(null);
  const [writeOffQty, setWriteOffQty] = useState(0);
  const [writeOffReason, setWriteOffReason] = useState<string>("damaged");
  const [writeOffNotes, setWriteOffNotes] = useState("");
  const [writeOffSaving, setWriteOffSaving] = useState(false);

  // Min stock editing state
  const [editingMinId, setEditingMinId] = useState<string | null>(null);
  const [editMinValue, setEditMinValue] = useState(0);
  const [minSaving, setMinSaving] = useState(false);

  // Movement history filters
  const [filterStockId, setFilterStockId] = useState("");
  const [filterType, setFilterType] = useState("");
  const [filterDateFrom, setFilterDateFrom] = useState("");
  const [filterDateTo, setFilterDateTo] = useState("");

  const fetchMovements = useCallback(async (stockId?: string, movementType?: string) => {
    const params: MovementFilters = { limit: 200 };
    if (stockId) params.stock_id = stockId;
    if (movementType) params.movement_type = movementType;
    const m = await listMovements(params);
    setMovements(m);
  }, []);

  const refresh = async () => {
    try {
      const [s, m] = await Promise.all([
        getPackagingStock(),
        listMovements({ limit: 200 }),
      ]);
      setStock(s);
      setMovements(m);
    } catch {
      globalToast("error", "Failed to load packaging data.");
    }
  };

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, []);

  // Re-fetch movements when server-side filters change
  const handleFilterChange = (newStockId: string, newType: string) => {
    setFilterStockId(newStockId);
    setFilterType(newType);
    fetchMovements(newStockId || undefined, newType || undefined).catch(() => {});
  };

  // Apply client-side date filtering
  const filteredMovements = movements.filter((m) => {
    if (filterDateFrom) {
      const from = new Date(filterDateFrom);
      if (new Date(m.recorded_at) < from) return false;
    }
    if (filterDateTo) {
      const to = new Date(filterDateTo);
      to.setDate(to.getDate() + 1); // include the entire "to" day
      if (new Date(m.recorded_at) >= to) return false;
    }
    return true;
  });

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-6 py-8">
        <p className="text-gray-400 text-sm">Loading packaging stock...</p>
      </div>
    );
  }

  const boxes = stock.filter((s) => s.packaging_type === "box");
  const pallets = stock.filter((s) => s.packaging_type === "pallet");

  // Shared inline action renderer for stock rows
  const renderActions = (s: PackagingStockItem) => {
    // Write-off form active
    if (writeOffId === s.id) {
      return (
        <div className="flex items-center justify-end gap-1 flex-wrap">
          <input
            type="number"
            min={1}
            max={s.current_quantity}
            value={writeOffQty || ""}
            onChange={(e) => setWriteOffQty(Number(e.target.value))}
            placeholder="Qty"
            autoFocus
            className="w-16 border rounded px-1.5 py-0.5 text-sm text-right"
          />
          <select
            value={writeOffReason}
            onChange={(e) => setWriteOffReason(e.target.value)}
            className="border rounded px-1 py-0.5 text-xs"
          >
            {WRITE_OFF_REASONS.map((r) => (
              <option key={r} value={r}>{r.charAt(0).toUpperCase() + r.slice(1)}</option>
            ))}
          </select>
          <input
            value={writeOffNotes}
            onChange={(e) => setWriteOffNotes(e.target.value)}
            placeholder="Notes"
            className="w-24 border rounded px-1.5 py-0.5 text-sm"
          />
          <button
            disabled={writeOffSaving}
            onClick={async () => {
              if (writeOffQty <= 0) { setWriteOffId(null); return; }
              setWriteOffSaving(true);
              try {
                await writeOffStock(s.id, writeOffQty, writeOffReason, writeOffNotes || undefined);
                globalToast("success", `Wrote off ${writeOffQty} × ${s.name || "item"} (${writeOffReason}).`);
                setWriteOffId(null);
                setWriteOffQty(0);
                setWriteOffReason("damaged");
                setWriteOffNotes("");
                await refresh();
              } catch (err) {
                globalToast("error", getErrorMessage(err, "Write-off failed (may cause negative stock)."));
              } finally {
                setWriteOffSaving(false);
              }
            }}
            className="text-red-600 text-xs font-medium"
          >
            {writeOffSaving ? "..." : "Go"}
          </button>
          <button onClick={() => { setWriteOffId(null); setWriteOffQty(0); setWriteOffNotes(""); }} className="text-gray-400 text-xs">
            ✕
          </button>
        </div>
      );
    }

    // Adjustment form active
    if (adjustingId === s.id) {
      return (
        <div className="flex items-center justify-end gap-1">
          <input
            type="number"
            value={adjustQty || ""}
            onChange={(e) => setAdjustQty(Number(e.target.value))}
            placeholder="+/-"
            autoFocus
            className="w-16 border rounded px-1.5 py-0.5 text-sm text-right"
          />
          <input
            value={adjustNotes}
            onChange={(e) => setAdjustNotes(e.target.value)}
            placeholder="Reason"
            className="w-24 border rounded px-1.5 py-0.5 text-sm"
          />
          <button
            disabled={adjustSaving}
            onClick={async () => {
              if (adjustQty === 0) { setAdjustingId(null); return; }
              setAdjustSaving(true);
              try {
                await adjustStock(s.id, adjustQty, adjustNotes || undefined);
                globalToast("success", `Stock adjusted by ${adjustQty > 0 ? "+" : ""}${adjustQty}.`);
                setAdjustingId(null);
                setAdjustQty(0);
                setAdjustNotes("");
                await refresh();
              } catch (err) {
                globalToast("error", getErrorMessage(err, "Adjustment failed (may cause negative stock)."));
              } finally {
                setAdjustSaving(false);
              }
            }}
            className="text-green-600 text-xs font-medium"
          >
            {adjustSaving ? "..." : "Go"}
          </button>
          <button onClick={() => { setAdjustingId(null); setAdjustQty(0); setAdjustNotes(""); }} className="text-gray-400 text-xs">
            ✕
          </button>
        </div>
      );
    }

    // Default — show action buttons
    return (
      <div className="flex items-center justify-end gap-2">
        <button
          onClick={() => { setAdjustingId(s.id); setWriteOffId(null); }}
          className="text-xs text-blue-600 hover:text-blue-700"
        >
          Adjust
        </button>
        <button
          onClick={() => { setWriteOffId(s.id); setAdjustingId(null); }}
          className="text-xs text-red-500 hover:text-red-600"
        >
          Write Off
        </button>
      </div>
    );
  };

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <PageHeader
        title="Packaging Stock"
        action={
          <button
            onClick={() => setShowReceive(true)}
            className="bg-green-600 text-white px-4 py-2 rounded text-sm font-medium hover:bg-green-700"
          >
            + Receive Stock
          </button>
        }
      />

      {/* Receive stock form */}
      {showReceive && (
        <div className="mb-6 p-4 bg-gray-50 rounded-lg border space-y-3">
          <h3 className="text-sm font-semibold text-gray-700">Receive Packaging Stock</h3>
          <div className="grid grid-cols-4 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Packaging Item *</label>
              <select
                value={receiveStockId}
                onChange={(e) => setReceiveStockId(e.target.value)}
                className="w-full border rounded px-2 py-1.5 text-sm"
              >
                <option value="">Select item</option>
                {boxes.length > 0 && (
                  <optgroup label="Boxes">
                    {boxes.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name || "Unnamed"} {s.weight_kg ? `(${s.weight_kg} kg)` : ""}
                      </option>
                    ))}
                  </optgroup>
                )}
                {pallets.length > 0 && (
                  <optgroup label="Pallets">
                    {pallets.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name || "Unnamed"}
                      </option>
                    ))}
                  </optgroup>
                )}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Quantity *</label>
              <input
                type="number"
                min={1}
                value={receiveQty || ""}
                onChange={(e) => setReceiveQty(Number(e.target.value))}
                className="w-full border rounded px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Cost per Unit</label>
              <input
                type="number"
                step="0.01"
                min={0}
                value={receiveCost ?? ""}
                onChange={(e) => setReceiveCost(e.target.value ? Number(e.target.value) : undefined)}
                placeholder="Optional"
                className="w-full border rounded px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Notes</label>
              <input
                value={receiveNotes}
                onChange={(e) => setReceiveNotes(e.target.value)}
                placeholder="e.g. Delivery ref"
                className="w-full border rounded px-2 py-1.5 text-sm"
              />
            </div>
          </div>
          <div className="flex gap-2 pt-2 border-t">
            <button
              disabled={receiveSaving}
              onClick={async () => {
                const selected = stock.find((s) => s.id === receiveStockId);
                if (!selected || receiveQty <= 0) {
                  globalToast("error", "Select an item and enter a quantity.");
                  return;
                }
                setReceiveSaving(true);
                try {
                  await receivePackaging({
                    box_size_id: selected.box_size_id || undefined,
                    pallet_type_id: selected.pallet_type_id || undefined,
                    quantity: receiveQty,
                    cost_per_unit: receiveCost,
                    notes: receiveNotes || undefined,
                  });
                  globalToast("success", `Received ${receiveQty} × ${selected.name || "item"}.`);
                  setShowReceive(false);
                  setReceiveStockId("");
                  setReceiveQty(0);
                  setReceiveCost(undefined);
                  setReceiveNotes("");
                  await refresh();
                } catch (err) {
                  globalToast("error", getErrorMessage(err, "Failed to receive stock."));
                } finally {
                  setReceiveSaving(false);
                }
              }}
              className="bg-green-600 text-white px-3 py-1.5 rounded text-sm font-medium hover:bg-green-700 disabled:opacity-50"
            >
              {receiveSaving ? "Saving..." : "Receive"}
            </button>
            <button
              onClick={() => { setShowReceive(false); setReceiveStockId(""); setReceiveQty(0); setReceiveCost(undefined); setReceiveNotes(""); }}
              className="border text-gray-600 px-3 py-1.5 rounded text-sm hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-4 border-b">
        <button
          onClick={() => setTab("stock")}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
            tab === "stock" ? "border-green-600 text-green-700" : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          Stock Levels
        </button>
        <button
          onClick={() => { setTab("movements"); fetchMovements(filterStockId || undefined, filterType || undefined).catch(() => {}); }}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
            tab === "movements" ? "border-green-600 text-green-700" : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          Movement History
        </button>
      </div>

      {/* Stock Levels tab */}
      {tab === "stock" && (
        <div className="space-y-6">
          {/* Boxes */}
          <div className="bg-white rounded-lg border">
            <div className="px-4 py-3 border-b">
              <h3 className="text-sm font-semibold text-gray-700">Boxes</h3>
            </div>
            {boxes.length > 0 ? (
              <table className="w-full text-sm">
                <thead className="text-gray-500 text-xs bg-gray-50">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium">Name</th>
                    <th className="text-right px-4 py-2 font-medium">Weight</th>
                    <th className="text-right px-4 py-2 font-medium">Cost/Unit</th>
                    <th className="text-right px-4 py-2 font-medium">In Stock</th>
                    <th className="text-right px-4 py-2 font-medium">Min Level</th>
                    <th className="text-right px-4 py-2 font-medium">Status</th>
                    <th className="text-right px-4 py-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {boxes.map((s) => {
                    const low = s.min_stock_level > 0 && s.current_quantity <= s.min_stock_level;
                    return (
                      <tr key={s.id} className="hover:bg-green-50/50 even:bg-gray-50/50">
                        <td className="px-4 py-2 font-medium text-gray-800">{s.name || "—"}</td>
                        <td className="px-4 py-2 text-right text-gray-600">{s.weight_kg ? `${s.weight_kg} kg` : "—"}</td>
                        <td className="px-4 py-2 text-right text-gray-600">{s.cost_per_unit != null ? `$${s.cost_per_unit.toFixed(2)}` : "—"}</td>
                        <td className="px-4 py-2 text-right font-semibold">{s.current_quantity}</td>
                        <td className="px-4 py-2 text-right">
                          {editingMinId === s.id ? (
                            <div className="flex items-center justify-end gap-1">
                              <input
                                type="number"
                                min={0}
                                value={editMinValue || ""}
                                onChange={(e) => setEditMinValue(Number(e.target.value))}
                                onKeyDown={(e) => {
                                  if (e.key === "Escape") setEditingMinId(null);
                                }}
                                autoFocus
                                className="w-16 border rounded px-1.5 py-0.5 text-sm text-right"
                              />
                              <button
                                disabled={minSaving}
                                onClick={async () => {
                                  setMinSaving(true);
                                  try {
                                    await updateMinStock(s.id, editMinValue);
                                    setEditingMinId(null);
                                    await refresh();
                                  } catch {
                                    globalToast("error", "Failed to update min stock.");
                                  } finally {
                                    setMinSaving(false);
                                  }
                                }}
                                className="text-green-600 text-xs font-medium"
                              >
                                {minSaving ? "..." : "Save"}
                              </button>
                            </div>
                          ) : (
                            <span
                              onClick={() => { setEditingMinId(s.id); setEditMinValue(s.min_stock_level); }}
                              className="cursor-pointer hover:text-green-700 hover:underline"
                              title="Click to edit"
                            >
                              {s.min_stock_level}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-right">
                          {low ? (
                            <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-700">Low</span>
                          ) : (
                            <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700">OK</span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-right">{renderActions(s)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <p className="px-4 py-3 text-sm text-gray-400">No box types configured. Add them in Setup Wizard.</p>
            )}
          </div>

          {/* Pallets */}
          <div className="bg-white rounded-lg border">
            <div className="px-4 py-3 border-b">
              <h3 className="text-sm font-semibold text-gray-700">Pallets</h3>
            </div>
            {pallets.length > 0 ? (
              <table className="w-full text-sm">
                <thead className="text-gray-500 text-xs bg-gray-50">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium">Name</th>
                    <th className="text-right px-4 py-2 font-medium">In Stock</th>
                    <th className="text-right px-4 py-2 font-medium">Min Level</th>
                    <th className="text-right px-4 py-2 font-medium">Status</th>
                    <th className="text-right px-4 py-2 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {pallets.map((s) => {
                    const low = s.min_stock_level > 0 && s.current_quantity <= s.min_stock_level;
                    return (
                      <tr key={s.id} className="hover:bg-green-50/50 even:bg-gray-50/50">
                        <td className="px-4 py-2 font-medium text-gray-800">{s.name || "—"}</td>
                        <td className="px-4 py-2 text-right font-semibold">{s.current_quantity}</td>
                        <td className="px-4 py-2 text-right">
                          {editingMinId === s.id ? (
                            <div className="flex items-center justify-end gap-1">
                              <input
                                type="number"
                                min={0}
                                value={editMinValue || ""}
                                onChange={(e) => setEditMinValue(Number(e.target.value))}
                                onKeyDown={(e) => { if (e.key === "Escape") setEditingMinId(null); }}
                                autoFocus
                                className="w-16 border rounded px-1.5 py-0.5 text-sm text-right"
                              />
                              <button
                                disabled={minSaving}
                                onClick={async () => {
                                  setMinSaving(true);
                                  try {
                                    await updateMinStock(s.id, editMinValue);
                                    setEditingMinId(null);
                                    await refresh();
                                  } catch {
                                    globalToast("error", "Failed to update min stock.");
                                  } finally {
                                    setMinSaving(false);
                                  }
                                }}
                                className="text-green-600 text-xs font-medium"
                              >
                                {minSaving ? "..." : "Save"}
                              </button>
                            </div>
                          ) : (
                            <span
                              onClick={() => { setEditingMinId(s.id); setEditMinValue(s.min_stock_level); }}
                              className="cursor-pointer hover:text-green-700 hover:underline"
                              title="Click to edit"
                            >
                              {s.min_stock_level}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-right">
                          {low ? (
                            <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-700">Low</span>
                          ) : (
                            <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700">OK</span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-right">{renderActions(s)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <p className="px-4 py-3 text-sm text-gray-400">No pallet types configured. Add them in Setup Wizard.</p>
            )}
          </div>
        </div>
      )}

      {/* Movement History tab */}
      {tab === "movements" && (
        <div className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap items-end gap-3 bg-gray-50 rounded-lg border p-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Item</label>
              <select
                value={filterStockId}
                onChange={(e) => handleFilterChange(e.target.value, filterType)}
                className="border rounded px-2 py-1.5 text-sm min-w-[160px]"
              >
                <option value="">All items</option>
                {boxes.length > 0 && (
                  <optgroup label="Boxes">
                    {boxes.map((s) => (
                      <option key={s.id} value={s.id}>{s.name || "Unnamed"}</option>
                    ))}
                  </optgroup>
                )}
                {pallets.length > 0 && (
                  <optgroup label="Pallets">
                    {pallets.map((s) => (
                      <option key={s.id} value={s.id}>{s.name || "Unnamed"}</option>
                    ))}
                  </optgroup>
                )}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Type</label>
              <select
                value={filterType}
                onChange={(e) => handleFilterChange(filterStockId, e.target.value)}
                className="border rounded px-2 py-1.5 text-sm min-w-[130px]"
              >
                {MOVEMENT_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">From</label>
              <input
                type="date"
                value={filterDateFrom}
                onChange={(e) => setFilterDateFrom(e.target.value)}
                className="border rounded px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">To</label>
              <input
                type="date"
                value={filterDateTo}
                onChange={(e) => setFilterDateTo(e.target.value)}
                className="border rounded px-2 py-1.5 text-sm"
              />
            </div>
            {(filterStockId || filterType || filterDateFrom || filterDateTo) && (
              <button
                onClick={() => { setFilterStockId(""); setFilterType(""); setFilterDateFrom(""); setFilterDateTo(""); fetchMovements().catch(() => {}); }}
                className="text-xs text-gray-500 hover:text-gray-700 pb-1.5"
              >
                Clear filters
              </button>
            )}
          </div>

          {/* Table */}
          <div className="bg-white rounded-lg border">
            {filteredMovements.length > 0 ? (
              <table className="w-full text-sm">
                <thead className="text-gray-500 text-xs bg-gray-50">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium">Date</th>
                    <th className="text-left px-4 py-2 font-medium">Item</th>
                    <th className="text-left px-4 py-2 font-medium">Type</th>
                    <th className="text-right px-4 py-2 font-medium">Qty</th>
                    <th className="text-right px-4 py-2 font-medium">Cost/Unit</th>
                    <th className="text-left px-4 py-2 font-medium">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredMovements.map((m) => {
                    const stockItem = stock.find((s) => s.id === m.stock_id);
                    return (
                      <tr key={m.id} className="hover:bg-green-50/50 even:bg-gray-50/50">
                        <td className="px-4 py-2 text-gray-600 text-xs">
                          {new Date(m.recorded_at).toLocaleString()}
                        </td>
                        <td className="px-4 py-2 text-gray-800">{stockItem?.name || m.stock_id}</td>
                        <td className="px-4 py-2">
                          <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${movementBadgeClass(m.movement_type)}`}>
                            {movementLabel(m.movement_type)}
                          </span>
                        </td>
                        <td className={`px-4 py-2 text-right font-medium ${m.quantity > 0 ? "text-green-700" : "text-red-600"}`}>
                          {m.quantity > 0 ? "+" : ""}{m.quantity}
                        </td>
                        <td className="px-4 py-2 text-right text-gray-600">
                          {m.cost_per_unit != null ? `$${m.cost_per_unit.toFixed(2)}` : "—"}
                        </td>
                        <td className="px-4 py-2 text-gray-500 text-xs">{m.notes || "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            ) : (
              <p className="px-4 py-6 text-sm text-gray-400 text-center">
                {movements.length === 0 ? "No movements recorded yet." : "No movements match the current filters."}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
