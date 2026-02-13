import React, { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import {
  getBatch,
  updateBatch,
  createLotsFromBatch,
  BatchDetail as BatchDetailType,
  BatchUpdatePayload,
  LotFromBatchItem,
} from "../api/batches";
import {
  getPalletTypes,
  createPalletsFromLots,
  PalletTypeConfig,
  LotAssignment,
} from "../api/pallets";
import BatchQR from "../components/BatchQR";
import { showToast as globalToast } from "../store/toastStore";

export default function BatchDetail() {
  const { batchId } = useParams<{ batchId: string }>();
  const [batch, setBatch] = useState<BatchDetailType | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const navigate = useNavigate();
  const [creatingLots, setCreatingLots] = useState(false);
  const [lotRows, setLotRows] = useState<LotFromBatchItem[]>([{ grade: "", carton_count: 0 }]);
  const [lotSaving, setLotSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Pallet creation state
  const [creatingPallet, setCreatingPallet] = useState(false);
  const [palletTypes, setPalletTypes] = useState<PalletTypeConfig[]>([]);
  const [selectedPalletType, setSelectedPalletType] = useState("");
  const [palletCapacity, setPalletCapacity] = useState(240);
  const [lotAssignments, setLotAssignments] = useState<Record<string, number>>({});
  const [palletSaving, setPalletSaving] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { isSubmitting },
  } = useForm<BatchUpdatePayload>();

  useEffect(() => {
    if (!batchId) return;
    getBatch(batchId)
      .then((b) => {
        setBatch(b);
        reset({
          variety: b.variety || "",
          harvest_date: b.harvest_date?.split("T")[0] || "",
          gross_weight_kg: b.gross_weight_kg ?? undefined,
          tare_weight_kg: b.tare_weight_kg,
          arrival_temp_c: b.arrival_temp_c ?? undefined,
          brix_reading: b.brix_reading ?? undefined,
          status: b.status,
          bin_count: b.bin_count ?? undefined,
          bin_type: b.bin_type || "",
          notes: b.notes || "",
        });
      })
      .catch(() => setError("Failed to load batch"))
      .finally(() => setLoading(false));
  }, [batchId, reset]);

  const onSubmit = async (data: BatchUpdatePayload) => {
    if (!batchId) return;
    setError(null);
    setSuccess(null);

    // Clean up: only send fields that changed, convert numbers
    const payload: BatchUpdatePayload = {};
    if (data.variety) payload.variety = data.variety;
    if (data.harvest_date) payload.harvest_date = data.harvest_date;
    if (data.gross_weight_kg) payload.gross_weight_kg = Number(data.gross_weight_kg);
    if (data.tare_weight_kg !== undefined) payload.tare_weight_kg = Number(data.tare_weight_kg);
    if (data.arrival_temp_c) payload.arrival_temp_c = Number(data.arrival_temp_c);
    if (data.brix_reading) payload.brix_reading = Number(data.brix_reading);
    if (data.status) payload.status = data.status;
    if (data.bin_count) payload.bin_count = Number(data.bin_count);
    if (data.bin_type) payload.bin_type = data.bin_type;
    if (data.notes !== undefined) payload.notes = data.notes;

    try {
      await updateBatch(batchId, payload);
      // Re-fetch full detail (PATCH returns BatchOut without names/history)
      const refreshed = await getBatch(batchId);
      setBatch(refreshed);
      reset({
        variety: refreshed.variety || "",
        harvest_date: refreshed.harvest_date?.split("T")[0] || "",
        gross_weight_kg: refreshed.gross_weight_kg ?? undefined,
        tare_weight_kg: refreshed.tare_weight_kg,
        arrival_temp_c: refreshed.arrival_temp_c ?? undefined,
        brix_reading: refreshed.brix_reading ?? undefined,
        status: refreshed.status,
        bin_count: refreshed.bin_count ?? undefined,
        bin_type: refreshed.bin_type || "",
        notes: refreshed.notes || "",
      });
      setEditing(false);
      setSuccess("Batch updated successfully");
    } catch (err: unknown) {
      if (err && typeof err === "object" && "response" in err) {
        const axiosErr = err as { response?: { data?: { detail?: string } } };
        setError(axiosErr.response?.data?.detail || "Update failed");
      } else {
        setError("Network error");
      }
    }
  };

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-8">
        <p className="text-gray-400 text-sm">Loading batch...</p>
      </div>
    );
  }

  if (!batch) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-8">
        <p className="text-red-600 text-sm">Batch not found</p>
        <Link to="/batches" className="text-green-600 text-sm hover:underline mt-2 inline-block">
          Back to Batches
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link to="/batches" className="text-sm text-gray-500 hover:text-gray-700">
            &larr; Back to Batches
          </Link>
          <h1 className="text-2xl font-bold text-gray-800 mt-1">
            {batch.batch_code}
          </h1>
          <p className="text-sm text-gray-500">
            Intake: {batch.intake_date ? new Date(batch.intake_date).toLocaleString() : "—"}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span
            className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${
              batch.status === "received"
                ? "bg-blue-50 text-blue-700"
                : batch.status === "processing"
                ? "bg-yellow-50 text-yellow-700"
                : batch.status === "rejected"
                ? "bg-red-50 text-red-700"
                : "bg-gray-100 text-gray-600"
            }`}
          >
            {batch.status}
          </span>
          {!editing && (
            <button
              onClick={() => { setEditing(true); setSuccess(null); }}
              className="bg-green-600 text-white px-4 py-2 rounded text-sm font-medium hover:bg-green-700"
            >
              Edit
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 text-red-700 rounded text-sm">{error}</div>
      )}
      {success && (
        <div className="mb-4 p-3 bg-green-50 text-green-700 rounded text-sm">{success}</div>
      )}

      {editing ? (
        /* ── Edit form ───────────────────────────────────── */
        <form onSubmit={handleSubmit(onSubmit)} className="bg-white border rounded-lg p-6 space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Variety">
              <input {...register("variety")} className={inputClass} />
            </Field>
            <Field label="Status">
              <select {...register("status")} className={inputClass}>
                <option value="received">Received</option>
                <option value="processing">Processing</option>
                <option value="packed">Packed</option>
                <option value="rejected">Rejected</option>
                <option value="dispatched">Dispatched</option>
              </select>
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Gross Weight (kg)">
              <input type="number" step="0.1" {...register("gross_weight_kg")} className={inputClass} />
            </Field>
            <Field label="Tare Weight (kg)">
              <input type="number" step="0.1" {...register("tare_weight_kg")} className={inputClass} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Harvest Date">
              <input type="date" {...register("harvest_date")} className={inputClass} />
            </Field>
            <Field label="Bin Count">
              <input type="number" {...register("bin_count")} className={inputClass} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Arrival Temp (&deg;C)">
              <input type="number" step="0.1" {...register("arrival_temp_c")} className={inputClass} />
            </Field>
            <Field label="Brix Reading">
              <input type="number" step="0.1" {...register("brix_reading")} className={inputClass} />
            </Field>
          </div>

          <Field label="Notes">
            <textarea {...register("notes")} rows={3} className={inputClass} />
          </Field>

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={isSubmitting}
              className="bg-green-600 text-white px-4 py-2 rounded text-sm font-medium hover:bg-green-700 disabled:opacity-50"
            >
              {isSubmitting ? "Saving..." : "Save Changes"}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="border text-gray-600 px-4 py-2 rounded text-sm font-medium hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        /* ── Read-only detail ────────────────────────────── */
        <div className="space-y-6">
          {/* Weights card */}
          <div className="bg-white rounded-lg border p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Weights</h3>
            <div className="grid grid-cols-3 gap-4 text-sm">
              <div>
                <p className="text-gray-500">Gross</p>
                <p className="text-gray-800 font-medium">
                  {batch.gross_weight_kg != null
                    ? `${batch.gross_weight_kg.toLocaleString()} kg`
                    : "Pending"}
                </p>
              </div>
              <div>
                <p className="text-gray-500">Tare</p>
                <p className="text-gray-800 font-medium">
                  {batch.tare_weight_kg.toLocaleString()} kg
                </p>
              </div>
              <div>
                <p className="text-gray-500">Net</p>
                <p className="text-gray-800 font-semibold">
                  {batch.net_weight_kg
                    ? `${batch.net_weight_kg.toLocaleString()} kg`
                    : "—"}
                </p>
              </div>
            </div>
          </div>

          {/* Grower & Packhouse card */}
          <div className="bg-white rounded-lg border p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Grower & Packhouse</h3>
            <div className="grid grid-cols-2 gap-y-2 text-sm">
              <Row label="Grower" value={batch.grower_name || batch.grower_id} />
              <Row label="Packhouse" value={batch.packhouse_name || batch.packhouse_id} />
              <Row
                label="Harvest Date"
                value={batch.harvest_date ? new Date(batch.harvest_date).toLocaleDateString() : "—"}
              />
              <Row
                label="Intake Date"
                value={batch.intake_date ? new Date(batch.intake_date).toLocaleDateString() : "—"}
              />
            </div>
          </div>

          {/* Fruit Details card */}
          <div className="bg-white rounded-lg border p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Fruit Details</h3>
            <div className="grid grid-cols-2 gap-y-2 text-sm">
              <Row label="Fruit Type" value={batch.fruit_type} />
              <Row label="Variety" value={batch.variety || "—"} />
              <Row label="Bin Count" value={batch.bin_count?.toString() || "—"} />
              <Row label="Bin Type" value={batch.bin_type || "—"} />
            </div>
          </div>

          {/* Quality card */}
          <div className="bg-white rounded-lg border p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Quality</h3>
            <div className="grid grid-cols-2 gap-y-2 text-sm">
              <Row label="Arrival Temp" value={batch.arrival_temp_c ? `${batch.arrival_temp_c}°C` : "—"} />
              <Row label="Brix Reading" value={batch.brix_reading?.toString() || "—"} />
              <Row label="Rejection Reason" value={batch.rejection_reason || "—"} />
              <Row label="Notes" value={batch.notes || "—"} />
            </div>
          </div>

          {/* Packing Lots */}
          <div className="bg-white rounded-lg border p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-700">
                Packing Lots {batch.lots?.length > 0 && `(${batch.lots.length})`}
              </h3>
              {!creatingLots && (
                <button
                  onClick={() => setCreatingLots(true)}
                  className="text-sm text-green-600 hover:text-green-700 font-medium"
                >
                  + Create Lots
                </button>
              )}
            </div>

            {/* Create lots form */}
            {creatingLots && (
              <div className="mb-4 p-4 bg-gray-50 rounded-lg border space-y-3">
                <p className="text-xs text-gray-500">
                  Split this batch into lots by grade/size. Each row creates one lot.
                </p>
                {lotRows.map((row, idx) => (
                  <div key={idx} className="grid grid-cols-5 gap-2 items-end">
                    <div>
                      {idx === 0 && <label className="block text-xs text-gray-500 mb-1">Grade *</label>}
                      <select
                        value={row.grade}
                        onChange={(e) => {
                          const updated = [...lotRows];
                          updated[idx] = { ...updated[idx], grade: e.target.value };
                          setLotRows(updated);
                        }}
                        className="w-full border rounded px-2 py-1.5 text-sm"
                      >
                        <option value="">Select</option>
                        <option value="Class 1">Class 1</option>
                        <option value="Class 2">Class 2</option>
                        <option value="Class 3">Class 3</option>
                        <option value="Industrial">Industrial</option>
                      </select>
                    </div>
                    <div>
                      {idx === 0 && <label className="block text-xs text-gray-500 mb-1">Size</label>}
                      <input
                        value={row.size || ""}
                        onChange={(e) => {
                          const updated = [...lotRows];
                          updated[idx] = { ...updated[idx], size: e.target.value };
                          setLotRows(updated);
                        }}
                        placeholder="e.g. Large"
                        className="w-full border rounded px-2 py-1.5 text-sm"
                      />
                    </div>
                    <div>
                      {idx === 0 && <label className="block text-xs text-gray-500 mb-1">Weight (kg)</label>}
                      <input
                        type="number"
                        value={row.weight_kg ?? ""}
                        onChange={(e) => {
                          const updated = [...lotRows];
                          updated[idx] = { ...updated[idx], weight_kg: e.target.value ? Number(e.target.value) : undefined };
                          setLotRows(updated);
                        }}
                        className="w-full border rounded px-2 py-1.5 text-sm"
                      />
                    </div>
                    <div>
                      {idx === 0 && <label className="block text-xs text-gray-500 mb-1">Cartons</label>}
                      <input
                        type="number"
                        value={row.carton_count ?? ""}
                        onChange={(e) => {
                          const updated = [...lotRows];
                          updated[idx] = { ...updated[idx], carton_count: e.target.value ? Number(e.target.value) : 0 };
                          setLotRows(updated);
                        }}
                        className="w-full border rounded px-2 py-1.5 text-sm"
                      />
                    </div>
                    <div>
                      {lotRows.length > 1 && (
                        <button
                          onClick={() => setLotRows(lotRows.filter((_, i) => i !== idx))}
                          className="text-xs text-red-500 hover:text-red-700 py-1.5"
                        >
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setLotRows([...lotRows, { grade: "", carton_count: 0 }])}
                  className="text-xs text-green-600 hover:text-green-700"
                >
                  + Add row
                </button>
                <div className="flex gap-2 pt-2 border-t">
                  <button
                    onClick={async () => {
                      const valid = lotRows.filter((r) => r.grade);
                      if (valid.length === 0) {
                        globalToast("error", "At least one lot with a grade is required.");
                        return;
                      }
                      setLotSaving(true);
                      try {
                        await createLotsFromBatch(batchId!, valid);
                        globalToast("success", `${valid.length} lot(s) created.`);
                        setCreatingLots(false);
                        setLotRows([{ grade: "", carton_count: 0 }]);
                        // Refresh batch to show new lots
                        const refreshed = await getBatch(batchId!);
                        setBatch(refreshed);
                      } catch {
                        globalToast("error", "Failed to create lots.");
                      } finally {
                        setLotSaving(false);
                      }
                    }}
                    disabled={lotSaving}
                    className="bg-green-600 text-white px-3 py-1.5 rounded text-sm font-medium hover:bg-green-700 disabled:opacity-50"
                  >
                    {lotSaving ? "Creating..." : "Create Lots"}
                  </button>
                  <button
                    onClick={() => { setCreatingLots(false); setLotRows([{ grade: "", carton_count: 0 }]); }}
                    className="border text-gray-600 px-3 py-1.5 rounded text-sm hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Lots table */}
            {batch.lots && batch.lots.length > 0 ? (
              <table className="w-full text-sm">
                <thead className="text-gray-500 text-xs">
                  <tr>
                    <th className="text-left px-2 py-1.5 font-medium">Lot Code</th>
                    <th className="text-left px-2 py-1.5 font-medium">Grade</th>
                    <th className="text-left px-2 py-1.5 font-medium">Size</th>
                    <th className="text-right px-2 py-1.5 font-medium">Cartons</th>
                    <th className="text-right px-2 py-1.5 font-medium">Weight</th>
                    <th className="text-left px-2 py-1.5 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {batch.lots.map((lot) => (
                    <tr key={lot.id} className="hover:bg-gray-50">
                      <td className="px-2 py-1.5 font-mono text-xs text-green-700">{lot.lot_code}</td>
                      <td className="px-2 py-1.5">{lot.grade || "—"}</td>
                      <td className="px-2 py-1.5">{lot.size || "—"}</td>
                      <td className="px-2 py-1.5 text-right">{lot.carton_count}</td>
                      <td className="px-2 py-1.5 text-right">
                        {lot.weight_kg ? `${lot.weight_kg.toLocaleString()} kg` : "—"}
                      </td>
                      <td className="px-2 py-1.5">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                          lot.status === "created" ? "bg-blue-50 text-blue-700"
                          : lot.status === "palletizing" ? "bg-yellow-50 text-yellow-700"
                          : lot.status === "stored" ? "bg-green-50 text-green-700"
                          : "bg-gray-100 text-gray-600"
                        }`}>
                          {lot.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : !creatingLots ? (
              <p className="text-gray-400 text-sm">No lots yet. Click "Create Lots" to split this batch.</p>
            ) : null}
          </div>

          {/* Palletize */}
          {batch.lots && batch.lots.length > 0 && (
            <div className="bg-white rounded-lg border p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-gray-700">Palletize</h3>
                {!creatingPallet && (
                  <button
                    onClick={() => {
                      setCreatingPallet(true);
                      getPalletTypes().then(setPalletTypes).catch(() => {});
                      // Pre-fill lot assignments with carton counts
                      const init: Record<string, number> = {};
                      batch.lots.forEach((l) => { init[l.id] = l.carton_count; });
                      setLotAssignments(init);
                    }}
                    className="text-sm text-green-600 hover:text-green-700 font-medium"
                  >
                    + Create Pallet
                  </button>
                )}
              </div>

              {creatingPallet && (
                <div className="p-4 bg-gray-50 rounded-lg border space-y-4">
                  {/* Pallet type selection */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Pallet Type *</label>
                      {palletTypes.length > 0 ? (
                        <select
                          value={selectedPalletType}
                          onChange={(e) => {
                            setSelectedPalletType(e.target.value);
                            const pt = palletTypes.find((t) => t.name === e.target.value);
                            if (pt) setPalletCapacity(pt.capacity_boxes);
                          }}
                          className="w-full border rounded px-2 py-1.5 text-sm"
                        >
                          <option value="">Select pallet type</option>
                          {palletTypes.map((pt) => (
                            <option key={pt.id} value={pt.name}>
                              {pt.name} ({pt.capacity_boxes} boxes)
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          value={selectedPalletType}
                          onChange={(e) => setSelectedPalletType(e.target.value)}
                          placeholder="e.g. Standard 240"
                          className="w-full border rounded px-2 py-1.5 text-sm"
                        />
                      )}
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Capacity (boxes)</label>
                      <input
                        type="number"
                        value={palletCapacity}
                        onChange={(e) => setPalletCapacity(Number(e.target.value))}
                        min={1}
                        className="w-full border rounded px-2 py-1.5 text-sm"
                      />
                    </div>
                  </div>

                  {/* Lot assignment table */}
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Assign boxes from lots</label>
                    <div className="border rounded overflow-hidden">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-100 text-gray-600 text-xs">
                          <tr>
                            <th className="text-left px-2 py-1.5 font-medium">Lot</th>
                            <th className="text-left px-2 py-1.5 font-medium">Grade</th>
                            <th className="text-left px-2 py-1.5 font-medium">Size</th>
                            <th className="text-right px-2 py-1.5 font-medium">Available</th>
                            <th className="text-right px-2 py-1.5 font-medium">Assign</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {batch.lots.map((lot) => {
                            const assigned = lotAssignments[lot.id] ?? 0;
                            return (
                              <tr key={lot.id}>
                                <td className="px-2 py-1.5 font-mono text-xs text-green-700">{lot.lot_code}</td>
                                <td className="px-2 py-1.5">{lot.grade || "—"}</td>
                                <td className="px-2 py-1.5">{lot.size || "—"}</td>
                                <td className="px-2 py-1.5 text-right text-gray-500">{lot.carton_count}</td>
                                <td className="px-2 py-1.5 text-right">
                                  <input
                                    type="number"
                                    value={assigned}
                                    onChange={(e) => setLotAssignments({
                                      ...lotAssignments,
                                      [lot.id]: Math.max(0, Math.min(lot.carton_count, Number(e.target.value))),
                                    })}
                                    min={0}
                                    max={lot.carton_count}
                                    className="w-20 border rounded px-2 py-1 text-sm text-right"
                                  />
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    {(() => {
                      const totalAssigned = Object.values(lotAssignments).reduce((a, b) => a + b, 0);
                      const sizes = new Set(
                        batch.lots
                          .filter((l) => (lotAssignments[l.id] ?? 0) > 0)
                          .map((l) => l.size)
                          .filter(Boolean)
                      );
                      const mixedSizes = sizes.size > 1;
                      return (
                        <div className="mt-2 space-y-1">
                          <p className="text-xs text-gray-500">
                            Total: <span className="font-medium">{totalAssigned}</span> boxes
                            {palletCapacity > 0 && ` / ${palletCapacity} capacity`}
                            {totalAssigned > palletCapacity && (
                              <span className="text-yellow-600 ml-2">
                                (overflow: {Math.ceil(totalAssigned / palletCapacity)} pallets will be created)
                              </span>
                            )}
                          </p>
                          {mixedSizes && (
                            <p className="text-xs text-yellow-600 font-medium">
                              Warning: Mixed sizes on pallet ({[...sizes].join(", ")})
                            </p>
                          )}
                        </div>
                      );
                    })()}
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 pt-2 border-t">
                    <button
                      onClick={async () => {
                        if (!selectedPalletType) {
                          globalToast("error", "Select a pallet type.");
                          return;
                        }
                        const assignments: LotAssignment[] = Object.entries(lotAssignments)
                          .filter(([, count]) => count > 0)
                          .map(([lot_id, box_count]) => {
                            const lot = batch.lots.find((l) => l.id === lot_id);
                            return { lot_id, box_count, size: lot?.size || undefined };
                          });
                        if (assignments.length === 0) {
                          globalToast("error", "Assign boxes from at least one lot.");
                          return;
                        }
                        setPalletSaving(true);
                        try {
                          const pallets = await createPalletsFromLots({
                            pallet_type_name: selectedPalletType,
                            capacity_boxes: palletCapacity,
                            lot_assignments: assignments,
                            packhouse_id: batch.packhouse_id,
                          });
                          globalToast("success", `${pallets.length} pallet(s) created.`);
                          setCreatingPallet(false);
                          setSelectedPalletType("");
                          setLotAssignments({});
                          // Refresh batch
                          const refreshed = await getBatch(batchId!);
                          setBatch(refreshed);
                        } catch {
                          globalToast("error", "Failed to create pallet.");
                        } finally {
                          setPalletSaving(false);
                        }
                      }}
                      disabled={palletSaving}
                      className="bg-green-600 text-white px-3 py-1.5 rounded text-sm font-medium hover:bg-green-700 disabled:opacity-50"
                    >
                      {palletSaving ? "Creating..." : "Create Pallet"}
                    </button>
                    <button
                      onClick={() => { setCreatingPallet(false); setSelectedPalletType(""); setLotAssignments({}); }}
                      className="border text-gray-600 px-3 py-1.5 rounded text-sm hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                    <Link
                      to="/pallets"
                      className="ml-auto text-xs text-gray-500 hover:text-gray-700 self-center"
                    >
                      View all pallets &rarr;
                    </Link>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* QR Code */}
          <div className="bg-white rounded-lg border p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">QR Code</h3>
            <BatchQR batch={batch} />
          </div>

          {/* History Timeline */}
          {batch.history && batch.history.length > 0 && (
            <div className="bg-white rounded-lg border p-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">History</h3>
              <div className="space-y-0">
                {batch.history.map((event, idx) => (
                  <div key={event.id} className="flex gap-3">
                    <div className="flex flex-col items-center">
                      <div
                        className={`w-2.5 h-2.5 rounded-full mt-1.5 ${
                          idx === 0 ? "bg-green-500" : "bg-gray-300"
                        }`}
                      />
                      {idx < batch.history.length - 1 && (
                        <div className="w-px flex-1 bg-gray-200 mt-1" />
                      )}
                    </div>
                    <div className="pb-4">
                      <p className="text-sm font-medium text-gray-800">
                        {event.event_type}
                        {event.event_subtype && (
                          <span className="text-gray-500 font-normal">
                            {" "}/ {event.event_subtype}
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-gray-500">
                        {new Date(event.recorded_at).toLocaleString()}
                        {event.location_detail && ` — ${event.location_detail}`}
                      </p>
                      {event.notes && (
                        <p className="text-xs text-gray-600 mt-1">{event.notes}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Metadata */}
          <div className="text-xs text-gray-400 flex gap-4">
            <span>Created: {new Date(batch.created_at).toLocaleString()}</span>
            <span>Updated: {new Date(batch.updated_at).toLocaleString()}</span>
            <span>Received by: {batch.received_by || "—"}</span>
          </div>
        </div>
      )}
    </div>
  );
}

const inputClass =
  "w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      {children}
    </div>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <>
      <span className="text-gray-500">{label}</span>
      <span className={bold ? "font-semibold text-gray-800" : "text-gray-800"}>{value}</span>
    </>
  );
}
