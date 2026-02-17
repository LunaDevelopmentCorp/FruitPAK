import React, { useEffect, useState } from "react";
import {
  getPackagingStock,
  receivePackaging,
  updateMinStock,
  adjustStock,
  listMovements,
  PackagingStockItem,
  PackagingMovement,
} from "../api/packaging";
import { showToast as globalToast } from "../store/toastStore";

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

  // Min stock editing state
  const [editingMinId, setEditingMinId] = useState<string | null>(null);
  const [editMinValue, setEditMinValue] = useState(0);
  const [minSaving, setMinSaving] = useState(false);

  const refresh = async () => {
    try {
      const [s, m] = await Promise.all([getPackagingStock(), listMovements()]);
      setStock(s);
      setMovements(m);
    } catch {
      globalToast("error", "Failed to load packaging data.");
    }
  };

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-6 py-8">
        <p className="text-gray-400 text-sm">Loading packaging stock...</p>
      </div>
    );
  }

  const boxes = stock.filter((s) => s.packaging_type === "box");
  const pallets = stock.filter((s) => s.packaging_type === "pallet");

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Packaging Stock</h1>
        <button
          onClick={() => setShowReceive(true)}
          className="bg-green-600 text-white px-4 py-2 rounded text-sm font-medium hover:bg-green-700"
        >
          + Receive Stock
        </button>
      </div>

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
                } catch {
                  globalToast("error", "Failed to receive stock.");
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
          onClick={() => { setTab("movements"); listMovements().then(setMovements).catch(() => {}); }}
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
                      <tr key={s.id} className="hover:bg-gray-50">
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
                                value={editMinValue}
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
                        <td className="px-4 py-2 text-right">
                          {adjustingId === s.id ? (
                            <div className="flex items-center justify-end gap-1">
                              <input
                                type="number"
                                value={adjustQty}
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
                                  } catch {
                                    globalToast("error", "Adjustment failed (may cause negative stock).");
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
                          ) : (
                            <button
                              onClick={() => setAdjustingId(s.id)}
                              className="text-xs text-blue-600 hover:text-blue-700"
                            >
                              Adjust
                            </button>
                          )}
                        </td>
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
                      <tr key={s.id} className="hover:bg-gray-50">
                        <td className="px-4 py-2 font-medium text-gray-800">{s.name || "—"}</td>
                        <td className="px-4 py-2 text-right font-semibold">{s.current_quantity}</td>
                        <td className="px-4 py-2 text-right">
                          {editingMinId === s.id ? (
                            <div className="flex items-center justify-end gap-1">
                              <input
                                type="number"
                                min={0}
                                value={editMinValue}
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
                        <td className="px-4 py-2 text-right">
                          {adjustingId === s.id ? (
                            <div className="flex items-center justify-end gap-1">
                              <input
                                type="number"
                                value={adjustQty}
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
                                  } catch {
                                    globalToast("error", "Adjustment failed (may cause negative stock).");
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
                          ) : (
                            <button
                              onClick={() => setAdjustingId(s.id)}
                              className="text-xs text-blue-600 hover:text-blue-700"
                            >
                              Adjust
                            </button>
                          )}
                        </td>
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
        <div className="bg-white rounded-lg border">
          {movements.length > 0 ? (
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
                {movements.map((m) => {
                  const stockItem = stock.find((s) => s.id === m.stock_id);
                  return (
                    <tr key={m.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2 text-gray-600 text-xs">
                        {new Date(m.recorded_at).toLocaleString()}
                      </td>
                      <td className="px-4 py-2 text-gray-800">{stockItem?.name || m.stock_id}</td>
                      <td className="px-4 py-2">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                          m.movement_type === "receipt" ? "bg-green-50 text-green-700"
                          : m.movement_type === "consumption" ? "bg-blue-50 text-blue-700"
                          : m.movement_type === "reversal" ? "bg-yellow-50 text-yellow-700"
                          : "bg-gray-100 text-gray-600"
                        }`}>
                          {m.movement_type}
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
            <p className="px-4 py-6 text-sm text-gray-400 text-center">No movements recorded yet.</p>
          )}
        </div>
      )}
    </div>
  );
}
