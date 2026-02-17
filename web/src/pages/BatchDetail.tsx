import React, { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import {
  getBatch,
  updateBatch,
  updateLot,
  deleteBatch,
  createLotsFromBatch,
  closeProductionRun,
  finalizeGRN,
  BatchDetail as BatchDetailType,
  BatchUpdatePayload,
  LotFromBatchItem,
} from "../api/batches";
import {
  getBoxSizes,
  getPalletTypes,
  createPalletsFromLots,
  listPallets,
  allocateBoxesToPallet,
  BoxSizeConfig,
  PalletTypeConfig,
  PalletSummary,
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

  // Waste entry state
  const [editingWaste, setEditingWaste] = useState(false);
  const [wasteKg, setWasteKg] = useState(0);
  const [wasteReason, setWasteReason] = useState("");
  const [wasteSaving, setWasteSaving] = useState(false);
  const [closingSaving, setClosingSaving] = useState(false);
  const [finalizeSaving, setFinalizeSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Box sizes for lot creation
  const [boxSizes, setBoxSizes] = useState<BoxSizeConfig[]>([]);

  // Inline lot editing state
  const [editingLotId, setEditingLotId] = useState<string | null>(null);
  const [editCartonCount, setEditCartonCount] = useState(0);
  const [lotUpdateSaving, setLotUpdateSaving] = useState(false);

  // Pallet creation state
  const [creatingPallet, setCreatingPallet] = useState(false);
  const [palletTypes, setPalletTypes] = useState<PalletTypeConfig[]>([]);
  const [selectedPalletType, setSelectedPalletType] = useState("");
  const [palletCapacity, setPalletCapacity] = useState(240);
  const [lotAssignments, setLotAssignments] = useState<Record<string, number>>({});
  const [palletSaving, setPalletSaving] = useState(false);

  // Allocate to existing pallet state
  const [allocatingToExisting, setAllocatingToExisting] = useState(false);
  const [openPallets, setOpenPallets] = useState<PalletSummary[]>([]);
  const [selectedPalletId, setSelectedPalletId] = useState("");
  const [allocateSaving, setAllocateSaving] = useState(false);

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
    getBoxSizes().then(setBoxSizes).catch(() => {});
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
                : batch.status === "complete"
                ? "bg-green-50 text-green-700"
                : batch.status === "rejected"
                ? "bg-red-50 text-red-700"
                : "bg-gray-100 text-gray-600"
            }`}
          >
            {batch.status}
          </span>
          {!editing && (
            <>
              <button
                onClick={() => { setEditing(true); setSuccess(null); }}
                className="bg-green-600 text-white px-4 py-2 rounded text-sm font-medium hover:bg-green-700"
              >
                Edit
              </button>
              <button
                onClick={() => setConfirmDelete(true)}
                className="border border-red-300 text-red-600 px-4 py-2 rounded text-sm font-medium hover:bg-red-50"
              >
                Delete
              </button>
            </>
          )}
        </div>
      </div>

      {/* Delete confirmation */}
      {confirmDelete && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-800 font-medium mb-2">
            Are you sure you want to delete GRN {batch.batch_code}?
          </p>
          <p className="text-xs text-red-600 mb-3">
            This will soft-delete the batch and all its lots. This action can be reversed by an admin.
          </p>
          <div className="flex gap-2">
            <button
              onClick={async () => {
                setDeleting(true);
                try {
                  await deleteBatch(batchId!);
                  globalToast("success", `Batch ${batch.batch_code} deleted.`);
                  navigate("/batches");
                } catch {
                  globalToast("error", "Failed to delete batch.");
                  setDeleting(false);
                  setConfirmDelete(false);
                }
              }}
              disabled={deleting}
              className="bg-red-600 text-white px-4 py-2 rounded text-sm font-medium hover:bg-red-700 disabled:opacity-50"
            >
              {deleting ? "Deleting..." : "Yes, Delete"}
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              className="border text-gray-600 px-4 py-2 rounded text-sm font-medium hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

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
                <option value="complete">Complete</option>
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
                  onClick={() => {
                    setCreatingLots(true);
                    getBoxSizes().then(setBoxSizes).catch(() => {});
                  }}
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
                {lotRows.map((row, idx) => {
                  const selectedBox = boxSizes.find((bs) => bs.id === row.box_size_id);
                  const autoWeight = selectedBox && row.carton_count ? row.carton_count * selectedBox.weight_kg : null;
                  return (
                  <div key={idx} className="space-y-1">
                    <div className="grid grid-cols-6 gap-2 items-end">
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
                        {idx === 0 && <label className="block text-xs text-gray-500 mb-1">Box Type *</label>}
                        <select
                          value={row.box_size_id || ""}
                          onChange={(e) => {
                            const updated = [...lotRows];
                            updated[idx] = { ...updated[idx], box_size_id: e.target.value || undefined };
                            setLotRows(updated);
                          }}
                          className="w-full border rounded px-2 py-1.5 text-sm"
                        >
                          <option value="">Select box</option>
                          {boxSizes.map((bs) => (
                            <option key={bs.id} value={bs.id}>
                              {bs.name} ({bs.weight_kg} kg)
                            </option>
                          ))}
                        </select>
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
                        {idx === 0 && <label className="block text-xs text-gray-500 mb-1">Weight</label>}
                        <p className="px-2 py-1.5 text-sm text-gray-600 bg-gray-100 rounded text-right">
                          {autoWeight != null ? `${autoWeight.toLocaleString()} kg` : "—"}
                        </p>
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
                    {/* Waste fields */}
                    <div className="grid grid-cols-6 gap-2 items-end">
                      <div>
                        {idx === 0 && <label className="block text-xs text-gray-400 mb-1">Waste (kg)</label>}
                        <input
                          type="number"
                          step="0.1"
                          min="0"
                          value={row.waste_kg ?? ""}
                          onChange={(e) => {
                            const updated = [...lotRows];
                            updated[idx] = { ...updated[idx], waste_kg: e.target.value ? Number(e.target.value) : undefined };
                            setLotRows(updated);
                          }}
                          placeholder="0"
                          className="w-full border border-dashed rounded px-2 py-1.5 text-sm text-gray-600"
                        />
                      </div>
                      <div className="col-span-4">
                        {idx === 0 && <label className="block text-xs text-gray-400 mb-1">Waste Reason</label>}
                        <input
                          value={row.waste_reason || ""}
                          onChange={(e) => {
                            const updated = [...lotRows];
                            updated[idx] = { ...updated[idx], waste_reason: e.target.value };
                            setLotRows(updated);
                          }}
                          placeholder="e.g. Sorting rejects, bruised fruit"
                          className="w-full border border-dashed rounded px-2 py-1.5 text-sm text-gray-600"
                        />
                      </div>
                      <div />
                    </div>
                  </div>
                  );
                })}
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
                    <th className="text-left px-2 py-1.5 font-medium">Box Type</th>
                    <th className="text-right px-2 py-1.5 font-medium">Cartons</th>
                    <th className="text-right px-2 py-1.5 font-medium">Weight</th>
                    <th className="text-right px-2 py-1.5 font-medium">Unallocated</th>
                    <th className="text-left px-2 py-1.5 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {batch.lots.map((lot) => {
                    const unallocated = lot.carton_count - (lot.palletized_boxes ?? 0);
                    return (
                      <tr key={lot.id} className="hover:bg-gray-50">
                        <td className="px-2 py-1.5 font-mono text-xs text-green-700">{lot.lot_code}</td>
                        <td className="px-2 py-1.5">{lot.grade || "—"}</td>
                        <td className="px-2 py-1.5">{lot.size || "—"}</td>
                        <td className="px-2 py-1.5 text-xs text-gray-600">
                          {boxSizes.find((bs) => bs.id === lot.box_size_id)?.name || "—"}
                        </td>
                        <td className="px-2 py-1.5 text-right">
                          {editingLotId === lot.id ? (
                            <div className="flex items-center justify-end gap-1">
                              <input
                                type="number"
                                min={0}
                                value={editCartonCount}
                                onChange={(e) => setEditCartonCount(Number(e.target.value))}
                                onKeyDown={(e) => {
                                  if (e.key === "Escape") setEditingLotId(null);
                                  if (e.key === "Enter") {
                                    e.preventDefault();
                                    (e.target as HTMLInputElement).closest("td")?.querySelector<HTMLButtonElement>("button")?.click();
                                  }
                                }}
                                autoFocus
                                className="w-20 border rounded px-1.5 py-0.5 text-sm text-right"
                              />
                              <button
                                disabled={lotUpdateSaving}
                                onClick={async () => {
                                  if (editCartonCount === lot.carton_count) {
                                    setEditingLotId(null);
                                    return;
                                  }
                                  setLotUpdateSaving(true);
                                  try {
                                    await updateLot(lot.id, { carton_count: editCartonCount });
                                    const refreshed = await getBatch(batchId!);
                                    setBatch(refreshed);
                                    setEditingLotId(null);
                                    globalToast("success", "Carton count updated.");
                                  } catch {
                                    globalToast("error", "Failed to update carton count.");
                                  } finally {
                                    setLotUpdateSaving(false);
                                  }
                                }}
                                className="text-green-600 hover:text-green-700 text-xs font-medium"
                              >
                                {lotUpdateSaving ? "..." : "Save"}
                              </button>
                              <button
                                onClick={() => setEditingLotId(null)}
                                className="text-gray-400 hover:text-gray-600 text-xs"
                              >
                                ✕
                              </button>
                            </div>
                          ) : (
                            <span
                              onClick={() => { setEditingLotId(lot.id); setEditCartonCount(lot.carton_count); }}
                              className="cursor-pointer hover:text-green-700 hover:underline"
                              title="Click to edit"
                            >
                              {lot.carton_count}
                            </span>
                          )}
                        </td>
                        <td className="px-2 py-1.5 text-right">
                          {lot.weight_kg != null ? `${lot.weight_kg.toLocaleString()} kg` : "—"}
                        </td>
                        <td className="px-2 py-1.5 text-right">
                          {unallocated > 0 ? (
                            <span className="text-yellow-600 font-medium">{unallocated}</span>
                          ) : (
                            <span className="text-green-600">0</span>
                          )}
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
                    );
                  })}
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
                {!creatingPallet && !allocatingToExisting && (
                  <div className="flex gap-3">
                    <button
                      onClick={() => {
                        setCreatingPallet(true);
                        getPalletTypes().then(setPalletTypes).catch(() => {});
                        const init: Record<string, number> = {};
                        batch.lots.forEach((l) => { init[l.id] = l.carton_count - (l.palletized_boxes ?? 0); });
                        setLotAssignments(init);
                      }}
                      className="text-sm text-green-600 hover:text-green-700 font-medium"
                    >
                      + Create Pallet
                    </button>
                    <button
                      onClick={() => {
                        setAllocatingToExisting(true);
                        listPallets({ status: "open" }).then(setOpenPallets).catch(() => {});
                        const init: Record<string, number> = {};
                        batch.lots.forEach((l) => { init[l.id] = l.carton_count - (l.palletized_boxes ?? 0); });
                        setLotAssignments(init);
                      }}
                      className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                    >
                      + Add to Existing
                    </button>
                  </div>
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
                            const available = lot.carton_count - (lot.palletized_boxes ?? 0);
                            return (
                              <tr key={lot.id}>
                                <td className="px-2 py-1.5 font-mono text-xs text-green-700">{lot.lot_code}</td>
                                <td className="px-2 py-1.5">{lot.grade || "—"}</td>
                                <td className="px-2 py-1.5">{lot.size || "—"}</td>
                                <td className="px-2 py-1.5 text-right text-gray-500">{available}</td>
                                <td className="px-2 py-1.5 text-right">
                                  <input
                                    type="number"
                                    value={assigned}
                                    onChange={(e) => setLotAssignments({
                                      ...lotAssignments,
                                      [lot.id]: Math.max(0, Math.min(available, Number(e.target.value))),
                                    })}
                                    min={0}
                                    max={available}
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

              {/* Allocate to existing pallet form */}
              {allocatingToExisting && (
                <div className="p-4 bg-blue-50 rounded-lg border border-blue-200 space-y-4">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Select Open Pallet *</label>
                    {openPallets.length > 0 ? (
                      <select
                        value={selectedPalletId}
                        onChange={(e) => setSelectedPalletId(e.target.value)}
                        className="w-full border rounded px-2 py-1.5 text-sm"
                      >
                        <option value="">Select a pallet</option>
                        {openPallets.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.pallet_number} — {p.pallet_type_name || "Unknown type"} ({p.current_boxes}/{p.capacity_boxes} boxes)
                            {p.grade ? ` · ${p.grade}` : ""}
                            {p.size ? ` · ${p.size}` : ""}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <p className="text-sm text-gray-500">No open pallets found. Create a new pallet instead.</p>
                    )}
                  </div>

                  {/* Lot assignment table */}
                  {openPallets.length > 0 && (
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
                              const available = lot.carton_count - (lot.palletized_boxes ?? 0);
                              return (
                                <tr key={lot.id}>
                                  <td className="px-2 py-1.5 font-mono text-xs text-green-700">{lot.lot_code}</td>
                                  <td className="px-2 py-1.5">{lot.grade || "—"}</td>
                                  <td className="px-2 py-1.5">{lot.size || "—"}</td>
                                  <td className="px-2 py-1.5 text-right text-gray-500">{available}</td>
                                  <td className="px-2 py-1.5 text-right">
                                    <input
                                      type="number"
                                      value={assigned}
                                      onChange={(e) => setLotAssignments({
                                        ...lotAssignments,
                                        [lot.id]: Math.max(0, Math.min(available, Number(e.target.value))),
                                      })}
                                      min={0}
                                      max={available}
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
                        const selected = openPallets.find((p) => p.id === selectedPalletId);
                        const remaining = selected ? selected.capacity_boxes - selected.current_boxes : 0;
                        return (
                          <div className="mt-2">
                            <p className="text-xs text-gray-500">
                              Total: <span className="font-medium">{totalAssigned}</span> boxes
                              {selected && ` · Pallet has ${remaining} spaces remaining`}
                              {selected && totalAssigned > remaining && (
                                <span className="text-yellow-600 ml-2">(exceeds remaining capacity)</span>
                              )}
                            </p>
                          </div>
                        );
                      })()}
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex gap-2 pt-2 border-t">
                    <button
                      onClick={async () => {
                        if (!selectedPalletId) {
                          globalToast("error", "Select a pallet.");
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
                        setAllocateSaving(true);
                        try {
                          await allocateBoxesToPallet(selectedPalletId, { lot_assignments: assignments });
                          const selected = openPallets.find((p) => p.id === selectedPalletId);
                          globalToast("success", `Boxes allocated to ${selected?.pallet_number || "pallet"}.`);
                          setAllocatingToExisting(false);
                          setSelectedPalletId("");
                          setLotAssignments({});
                          const refreshed = await getBatch(batchId!);
                          setBatch(refreshed);
                        } catch {
                          globalToast("error", "Failed to allocate boxes.");
                        } finally {
                          setAllocateSaving(false);
                        }
                      }}
                      disabled={allocateSaving}
                      className="bg-blue-600 text-white px-3 py-1.5 rounded text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
                    >
                      {allocateSaving ? "Allocating..." : "Allocate to Pallet"}
                    </button>
                    <button
                      onClick={() => { setAllocatingToExisting(false); setSelectedPalletId(""); setLotAssignments({}); }}
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

          {/* Mass Balance */}
          {batch.lots && batch.lots.length > 0 && (() => {
            const incomingNet = batch.net_weight_kg ?? 0;
            const totalLotWeight = batch.lots.reduce(
              (sum, l) => sum + (l.weight_kg ?? 0), 0
            );
            const totalLotWaste = batch.lots.reduce(
              (sum, l) => sum + (l.waste_kg ?? 0), 0
            );
            const waste = (batch.waste_kg ?? 0) + totalLotWaste;
            const accounted = totalLotWeight + waste;
            const diff = incomingNet - accounted;
            const balanced = Math.abs(diff) < 0.5;
            return (
              <div className={`rounded-lg border p-4 ${balanced ? "bg-green-50 border-green-200" : "bg-yellow-50 border-yellow-200"}`}>
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Mass Balance</h3>
                <div className="grid grid-cols-4 gap-4 text-sm">
                  <div>
                    <p className="text-gray-500">Incoming Net</p>
                    <p className="font-medium">{incomingNet.toLocaleString()} kg</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Lot Weight</p>
                    <p className="font-medium">{totalLotWeight.toLocaleString()} kg</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Waste</p>
                    <p className="font-medium">{waste.toLocaleString()} kg</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Difference</p>
                    <p className={`font-semibold ${balanced ? "text-green-700" : "text-yellow-700"}`}>
                      {diff > 0 ? "+" : ""}{diff.toLocaleString(undefined, { maximumFractionDigits: 1 })} kg
                      {balanced && " ✓"}
                    </p>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Waste */}
          <div className="bg-white rounded-lg border p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-700">Waste</h3>
              {!editingWaste && batch.status !== "complete" && (
                <button
                  onClick={() => { setEditingWaste(true); setWasteKg(batch.waste_kg ?? 0); setWasteReason(batch.waste_reason || ""); }}
                  className="text-sm text-green-600 hover:text-green-700 font-medium"
                >
                  {batch.waste_kg > 0 ? "Edit Waste" : "+ Add Waste"}
                </button>
              )}
            </div>
            {batch.waste_kg > 0 && !editingWaste && (
              <div className="grid grid-cols-2 gap-y-2 text-sm">
                <Row label="Waste Weight" value={`${batch.waste_kg.toLocaleString()} kg`} />
                <Row label="Reason" value={batch.waste_reason || "—"} />
              </div>
            )}
            {!batch.waste_kg && !editingWaste && (
              <p className="text-gray-400 text-sm">No waste recorded.</p>
            )}
            {editingWaste && (
              <div className="space-y-3 p-3 bg-gray-50 rounded-lg border">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Waste Weight (kg)</label>
                    <input
                      type="number"
                      step="0.1"
                      min="0"
                      value={wasteKg}
                      onChange={(e) => setWasteKg(Number(e.target.value))}
                      className="w-full border rounded px-2 py-1.5 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Reason</label>
                    <input
                      value={wasteReason}
                      onChange={(e) => setWasteReason(e.target.value)}
                      placeholder="e.g. Sorting rejects, damage"
                      className="w-full border rounded px-2 py-1.5 text-sm"
                    />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={async () => {
                      setWasteSaving(true);
                      try {
                        await updateBatch(batchId!, { waste_kg: wasteKg, waste_reason: wasteReason || undefined });
                        const refreshed = await getBatch(batchId!);
                        setBatch(refreshed);
                        setEditingWaste(false);
                        globalToast("success", "Waste updated.");
                      } catch {
                        globalToast("error", "Failed to update waste.");
                      } finally {
                        setWasteSaving(false);
                      }
                    }}
                    disabled={wasteSaving}
                    className="bg-green-600 text-white px-3 py-1.5 rounded text-sm font-medium hover:bg-green-700 disabled:opacity-50"
                  >
                    {wasteSaving ? "Saving..." : "Save Waste"}
                  </button>
                  <button
                    onClick={() => setEditingWaste(false)}
                    className="border text-gray-600 px-3 py-1.5 rounded text-sm hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Close Production Run */}
          {batch.lots && batch.lots.length > 0 && batch.status !== "complete" && (() => {
            const totalUnallocated = batch.lots.reduce(
              (sum, l) => sum + l.carton_count - (l.palletized_boxes ?? 0), 0
            );
            const allAllocated = totalUnallocated === 0;
            return (
              <div className="bg-white rounded-lg border p-4">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Close Production Run</h3>
                {!allAllocated && (
                  <p className="text-sm text-yellow-600 mb-3">
                    {totalUnallocated} box(es) still unallocated to pallets. All boxes must be palletized before closing.
                  </p>
                )}
                <button
                  onClick={async () => {
                    setClosingSaving(true);
                    try {
                      const refreshed = await closeProductionRun(batchId!);
                      setBatch(refreshed);
                      globalToast("success", "Production run closed.");
                    } catch (err: unknown) {
                      if (err && typeof err === "object" && "response" in err) {
                        const axiosErr = err as { response?: { data?: { detail?: string } } };
                        globalToast("error", axiosErr.response?.data?.detail || "Failed to close run.");
                      } else {
                        globalToast("error", "Failed to close run.");
                      }
                    } finally {
                      setClosingSaving(false);
                    }
                  }}
                  disabled={!allAllocated || closingSaving}
                  className={`px-4 py-2 rounded text-sm font-medium ${
                    allAllocated
                      ? "bg-green-600 text-white hover:bg-green-700"
                      : "bg-gray-200 text-gray-400 cursor-not-allowed"
                  } disabled:opacity-50`}
                >
                  {closingSaving ? "Closing..." : "Close Production Run"}
                </button>
              </div>
            );
          })()}

          {/* Finalize GRN */}
          {batch.status === "complete" && batch.lots && batch.lots.length > 0 && (() => {
            const incomingNet = batch.net_weight_kg ?? 0;
            const lotWeight = batch.lots.reduce(
              (sum, l) => sum + (l.weight_kg ?? 0), 0
            );
            const lotWaste = batch.lots.reduce((sum, l) => sum + (l.waste_kg ?? 0), 0);
            const batchWaste = batch.waste_kg ?? 0;
            const diff = Math.abs(incomingNet - (lotWeight + lotWaste + batchWaste));
            const balanced = diff < 0.5;
            return (
              <div className="bg-white rounded-lg border p-4">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">Finalize GRN</h3>
                <p className="text-sm text-gray-600 mb-3">
                  Production run is closed. Finalize the GRN to mark it as completed.
                  {!balanced && (
                    <span className="text-yellow-600 block mt-1">
                      Mass balance difference is {diff.toFixed(1)} kg (tolerance: 0.5 kg). Adjust weights or waste before finalizing.
                    </span>
                  )}
                </p>
                <button
                  onClick={async () => {
                    setFinalizeSaving(true);
                    try {
                      const refreshed = await finalizeGRN(batchId!);
                      setBatch(refreshed);
                      globalToast("success", "GRN finalized — status set to completed.");
                    } catch (err: unknown) {
                      if (err && typeof err === "object" && "response" in err) {
                        const axiosErr = err as { response?: { data?: { detail?: string } } };
                        globalToast("error", axiosErr.response?.data?.detail || "Failed to finalize.");
                      } else {
                        globalToast("error", "Failed to finalize GRN.");
                      }
                    } finally {
                      setFinalizeSaving(false);
                    }
                  }}
                  disabled={finalizeSaving}
                  className="bg-green-600 text-white px-4 py-2 rounded text-sm font-medium hover:bg-green-700 disabled:opacity-50"
                >
                  {finalizeSaving ? "Finalizing..." : "Finalize GRN"}
                </button>
              </div>
            );
          })()}

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
                        {event.recorded_by_name && ` · ${event.recorded_by_name}`}
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
            <span>Received by: {batch.received_by_name || batch.received_by || "—"}</span>
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
