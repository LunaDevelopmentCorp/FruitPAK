import React, { useEffect, useMemo, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { getErrorMessage } from "../api/client";
import {
  getBatch,
  updateBatch,
  updateLot,
  deleteBatch,
  createLotsFromBatch,
  closeProductionRun,
  finalizeGRN,
  BatchDetail as BatchDetailType,
  LotFromBatchItem,
  LotUpdatePayload,
} from "../api/batches";
import {
  getBoxSizes,
  getPalletTypes,
  getPalletTypeCapacities,
  createPalletsFromLots,
  listPallets,
  allocateBoxesToPallet,
  getBinTypes,
  BoxSizeConfig,
  BinTypeConfig,
  PalletTypeConfig,
  PalletTypeCapacity,
  PalletSummary,
  LotAssignment,
} from "../api/pallets";
import { getFruitTypeConfigs, FruitTypeConfig } from "../api/config";
import BatchQR from "../components/BatchQR";
import PageHeader from "../components/PageHeader";
import StatusBadge from "../components/StatusBadge";
import { showToast as globalToast } from "../store/toastStore";

/** Extended lot row with UI-only fields for unit selection. */
type LotRowForm = LotFromBatchItem & {
  unit: "cartons" | "bins";
  bin_type_id?: string;
  bin_count?: number;
};

export default function BatchDetail() {
  const { batchId } = useParams<{ batchId: string }>();
  const [batch, setBatch] = useState<BatchDetailType | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const [creatingLots, setCreatingLots] = useState(false);
  const [lotRows, setLotRows] = useState<LotRowForm[]>([{ grade: "", carton_count: 0, unit: "cartons" }]);
  const [lotSaving, setLotSaving] = useState(false);
  const [lotValidationError, setLotValidationError] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
  // Bin types for weight recalculation
  const [binTypes, setBinTypes] = useState<BinTypeConfig[]>([]);
  // Fruit type configs for grade/size dropdowns
  const [fruitConfigs, setFruitConfigs] = useState<FruitTypeConfig[]>([]);

  // Inline lot editing state
  const [editingLotId, setEditingLotId] = useState<string | null>(null);
  const [editLotForm, setEditLotForm] = useState<LotUpdatePayload>({});
  const [lotUpdateSaving, setLotUpdateSaving] = useState(false);

  // Pallet creation state
  const [creatingPallet, setCreatingPallet] = useState(false);
  const [palletTypes, setPalletTypes] = useState<PalletTypeConfig[]>([]);
  const [selectedPalletType, setSelectedPalletType] = useState("");
  const [palletCapacity, setPalletCapacity] = useState(240);
  const [palletBoxCapacities, setPalletBoxCapacities] = useState<PalletTypeCapacity | null>(null);
  const [lotAssignments, setLotAssignments] = useState<Record<string, number>>({});
  const [palletSaving, setPalletSaving] = useState(false);

  // Pallet size & box type selection
  const [palletSize, setPalletSize] = useState("");
  const [palletBoxSizeId, setPalletBoxSizeId] = useState("");
  const [allowMixedSizes, setAllowMixedSizes] = useState(false);
  const [allowMixedBoxTypes, setAllowMixedBoxTypes] = useState(false);

  // Allocate to existing pallet state
  const [allocatingToExisting, setAllocatingToExisting] = useState(false);
  const [openPallets, setOpenPallets] = useState<PalletSummary[]>([]);
  const [selectedPalletId, setSelectedPalletId] = useState("");
  const [allocateSaving, setAllocateSaving] = useState(false);

  useEffect(() => {
    if (!batchId) return;
    getBatch(batchId)
      .then(setBatch)
      .catch(() => setError("Failed to load batch"))
      .finally(() => setLoading(false));
    getBoxSizes().then(setBoxSizes).catch(() => {});
    getBinTypes().then(setBinTypes).catch(() => {});
    getFruitTypeConfigs().then(setFruitConfigs).catch(() => {});
  }, [batchId]);

  // Derive available grades & sizes from fruit type configs matching this batch's fruit type
  const availableGrades = useMemo(() => {
    if (!batch) return [];
    const config = fruitConfigs.find(
      (fc) => fc.fruit_type.toLowerCase() === batch.fruit_type.toLowerCase(),
    );
    return config?.grades ?? [];
  }, [fruitConfigs, batch]);

  const availableSizes = useMemo(() => {
    if (!batch) return [];
    const config = fruitConfigs.find(
      (fc) => fc.fruit_type.toLowerCase() === batch.fruit_type.toLowerCase(),
    );
    return config?.sizes ?? [];
  }, [fruitConfigs, batch]);

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
      <PageHeader
        title={batch.batch_code}
        subtitle={`Intake: ${batch.intake_date ? new Date(batch.intake_date).toLocaleString() : "—"}`}
        backTo="/batches"
        backLabel="Back to Batches"
        action={
          <div className="flex items-center gap-3">
            <StatusBadge status={batch.status} className="text-sm px-3 py-1" />
            <button
              onClick={() => setConfirmDelete(true)}
              className="border border-red-300 text-red-600 px-4 py-2 rounded text-sm font-medium hover:bg-red-50"
            >
              Delete
            </button>
          </div>
        }
      />

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

          {/* Notes card */}
          <div className="bg-white rounded-lg border p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Notes</h3>
            <div className="grid grid-cols-2 gap-y-2 text-sm">
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
                    setLotValidationError(false);
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
                  const selectedBin = binTypes.find((bt) => bt.id === row.bin_type_id);
                  const autoWeight =
                    row.unit === "bins" && selectedBin && row.bin_count
                      ? row.bin_count * (selectedBin.default_weight_kg - selectedBin.tare_weight_kg)
                      : row.unit === "cartons" && selectedBox && row.carton_count
                        ? row.carton_count * selectedBox.weight_kg
                        : null;
                  return (
                  <div key={idx}>
                    <div className="grid grid-cols-7 gap-2 items-end">
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Grade *</label>
                        <select
                          value={row.grade}
                          onChange={(e) => {
                            const updated = [...lotRows];
                            const grade = e.target.value;
                            const isBinGrade = /^2$|class\s*2|industrial/i.test(grade);
                            const batchBin = binTypes.find((bt) => bt.name === batch?.bin_type);
                            updated[idx] = {
                              ...updated[idx],
                              grade,
                              unit: isBinGrade ? "bins" : updated[idx].unit,
                              bin_type_id: isBinGrade && !updated[idx].bin_type_id ? batchBin?.id : updated[idx].bin_type_id,
                            };
                            setLotRows(updated);
                            if (grade) setLotValidationError(false);
                          }}
                          className={`w-full border rounded px-2 py-1.5 text-sm ${lotValidationError && !row.grade ? "border-red-400 bg-red-50" : ""}`}
                        >
                          <option value="">Select</option>
                          {availableGrades.map((g) => (
                            <option key={g} value={g}>{g}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Size</label>
                        <select
                          value={row.size || ""}
                          onChange={(e) => {
                            const updated = [...lotRows];
                            updated[idx] = { ...updated[idx], size: e.target.value || undefined };
                            setLotRows(updated);
                          }}
                          className="w-full border rounded px-2 py-1.5 text-sm"
                        >
                          <option value="">Select</option>
                          {availableSizes.map((s) => (
                            <option key={s} value={s}>{s}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Unit</label>
                        <select
                          value={row.unit}
                          onChange={(e) => {
                            const updated = [...lotRows];
                            const unit = e.target.value as "cartons" | "bins";
                            const batchBin = binTypes.find((bt) => bt.name === batch?.bin_type);
                            updated[idx] = {
                              ...updated[idx],
                              unit,
                              bin_type_id: unit === "bins" && !updated[idx].bin_type_id ? batchBin?.id : updated[idx].bin_type_id,
                            };
                            setLotRows(updated);
                          }}
                          className="w-full border rounded px-2 py-1.5 text-sm"
                        >
                          <option value="cartons">Cartons</option>
                          <option value="bins">Bins</option>
                        </select>
                      </div>
                      {row.unit === "cartons" ? (
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Box Type *</label>
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
                      ) : (
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Bin Type *</label>
                          <select
                            value={row.bin_type_id || ""}
                            onChange={(e) => {
                              const updated = [...lotRows];
                              updated[idx] = { ...updated[idx], bin_type_id: e.target.value || undefined };
                              setLotRows(updated);
                            }}
                            className="w-full border rounded px-2 py-1.5 text-sm"
                          >
                            <option value="">Select bin</option>
                            {binTypes.map((bt) => (
                              <option key={bt.id} value={bt.id}>
                                {bt.name} ({(bt.default_weight_kg - bt.tare_weight_kg).toFixed(0)} kg net)
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">{row.unit === "bins" ? "Bins" : "Cartons"}</label>
                        <input
                          type="number"
                          value={row.unit === "bins" ? (row.bin_count || "") : (row.carton_count || "")}
                          onChange={(e) => {
                            const updated = [...lotRows];
                            const val = e.target.value ? Number(e.target.value) : 0;
                            if (row.unit === "bins") {
                              updated[idx] = { ...updated[idx], bin_count: val };
                            } else {
                              updated[idx] = { ...updated[idx], carton_count: val };
                            }
                            setLotRows(updated);
                          }}
                          className="w-full border rounded px-2 py-1.5 text-sm"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-500 mb-1">Weight</label>
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
                  </div>
                  );
                })}
                {/* Auto-waste summary */}
                {(() => {
                  const existingLotWeight = (batch.lots || []).reduce((s, l) => s + (l.weight_kg ?? 0), 0);
                  const existingLotWaste = (batch.lots || []).reduce((s, l) => s + (l.waste_kg ?? 0), 0);
                  const newLotWeight = lotRows.reduce((s, r) => {
                    if (r.unit === "bins") {
                      const bt = binTypes.find((b) => b.id === r.bin_type_id);
                      return s + (r.bin_count || 0) * (bt ? bt.default_weight_kg - bt.tare_weight_kg : 0);
                    }
                    const bs = boxSizes.find((b) => b.id === r.box_size_id);
                    return s + (r.carton_count || 0) * (bs ? bs.weight_kg : 0);
                  }, 0);
                  const incomingNet = batch.net_weight_kg ?? 0;
                  const autoWaste = incomingNet - existingLotWeight - existingLotWaste - newLotWeight;
                  return incomingNet > 0 ? (
                    <div className={`mt-2 p-2 rounded text-xs ${autoWaste >= 0 ? "bg-blue-50 text-blue-700" : "bg-yellow-50 text-yellow-700"}`}>
                      <span className="font-medium">Auto-waste:</span>{" "}
                      {autoWaste >= 0
                        ? `${autoWaste.toLocaleString(undefined, { maximumFractionDigits: 1 })} kg will be recorded to balance mass.`
                        : `Lot weights exceed incoming net by ${Math.abs(autoWaste).toLocaleString(undefined, { maximumFractionDigits: 1 })} kg — check quantities.`}
                      <span className="text-gray-500 ml-2">
                        ({incomingNet.toLocaleString()} net − {(existingLotWeight + newLotWeight).toLocaleString()} lots − {existingLotWaste.toLocaleString()} waste)
                      </span>
                    </div>
                  ) : null;
                })()}
                <button
                  type="button"
                  onClick={() => setLotRows([...lotRows, { grade: "", carton_count: 0, unit: "cartons" as const }])}
                  className="text-xs text-green-600 hover:text-green-700"
                >
                  + Add row
                </button>
                <div className="flex gap-2 pt-2 border-t">
                  <button
                    onClick={async () => {
                      // Check for rows missing a grade
                      const hasAnyData = lotRows.some(
                        (r) => r.grade || (r.carton_count ?? 0) > 0 || (r.bin_count && r.bin_count > 0) || r.box_size_id || r.size
                      );
                      const missingGrade = lotRows.some(
                        (r) => !r.grade && ((r.carton_count ?? 0) > 0 || (r.bin_count && r.bin_count > 0) || r.box_size_id || r.size)
                      );
                      if (missingGrade || (!hasAnyData)) {
                        setLotValidationError(true);
                        globalToast("error", missingGrade
                          ? "Every row needs a grade selected before saving."
                          : "At least one lot with a grade is required.");
                        return;
                      }
                      setLotValidationError(false);
                      const valid = lotRows.filter((r) => r.grade);
                      // Map form rows to API payload
                      const apiLots: LotFromBatchItem[] = valid.map((r) => {
                        if (r.unit === "bins") {
                          const bt = binTypes.find((b) => b.id === r.bin_type_id);
                          const netPerBin = bt ? bt.default_weight_kg - bt.tare_weight_kg : 0;
                          return {
                            grade: r.grade,
                            size: r.size,
                            carton_count: 0,
                            weight_kg: (r.bin_count || 0) * netPerBin,
                            notes: r.notes,
                          };
                        }
                        return {
                          grade: r.grade,
                          size: r.size,
                          box_size_id: r.box_size_id,
                          carton_count: r.carton_count,
                          notes: r.notes,
                        };
                      });
                      setLotSaving(true);
                      try {
                        await createLotsFromBatch(batchId!, apiLots);
                        globalToast("success", `${apiLots.length} lot(s) created.`);
                        setCreatingLots(false);
                        setLotRows([{ grade: "", carton_count: 0, unit: "cartons" as const }]);
                        // Refresh batch to show new lots
                        const refreshed = await getBatch(batchId!);
                        setBatch(refreshed);
                        // Auto-calculate and save batch waste to balance mass
                        const incomingNet = refreshed.net_weight_kg ?? 0;
                        if (incomingNet > 0) {
                          const allLotWeight = (refreshed.lots || []).reduce((s, l) => s + (l.weight_kg ?? 0), 0);
                          const allLotWaste = (refreshed.lots || []).reduce((s, l) => s + (l.waste_kg ?? 0), 0);
                          const autoWaste = Math.max(0, incomingNet - allLotWeight - allLotWaste);
                          await updateBatch(batchId!, { waste_kg: autoWaste, waste_reason: "Auto-calculated balance" });
                          const refreshed2 = await getBatch(batchId!);
                          setBatch(refreshed2);
                        }
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
                    onClick={() => { setCreatingLots(false); setLotRows([{ grade: "", carton_count: 0, unit: "cartons" as const }]); }}
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
                    <th className="px-2 py-1.5 font-medium"></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {batch.lots.map((lot) => {
                    const unallocated = lot.carton_count - (lot.palletized_boxes ?? 0);
                    const isEditing = editingLotId === lot.id;
                    return (
                      <React.Fragment key={lot.id}>
                        <tr className="hover:bg-gray-50">
                          <td className="px-2 py-1.5 font-mono text-xs text-green-700">{lot.lot_code}</td>
                          <td className="px-2 py-1.5">{lot.grade || "—"}</td>
                          <td className="px-2 py-1.5">{lot.size || "—"}</td>
                          <td className="px-2 py-1.5 text-xs text-gray-600">
                            {boxSizes.find((bs) => bs.id === lot.box_size_id)?.name || "—"}
                          </td>
                          <td className="px-2 py-1.5 text-right">{lot.carton_count}</td>
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
                            <StatusBadge status={lot.status} />
                          </td>
                          <td className="px-2 py-1.5 text-right">
                            {!isEditing && (
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  onClick={() => {
                                    setEditingLotId(lot.id);
                                    setEditLotForm({
                                      grade: lot.grade || undefined,
                                      size: lot.size || undefined,
                                      box_size_id: lot.box_size_id || undefined,
                                      carton_count: lot.carton_count,
                                      weight_kg: lot.weight_kg ?? undefined,
                                      waste_kg: lot.waste_kg ?? 0,
                                      waste_reason: lot.waste_reason || undefined,
                                      notes: lot.notes || undefined,
                                    });
                                  }}
                                  className="text-xs text-green-600 hover:text-green-700 font-medium"
                                >
                                  Edit
                                </button>
                                {/^2$|class\s*2|industrial/i.test(lot.grade || "") && lot.status !== "returned" && (
                                  <button
                                    onClick={async () => {
                                      if (!confirm(`Return lot ${lot.lot_code} to grower?`)) return;
                                      setLotUpdateSaving(true);
                                      try {
                                        await updateLot(lot.id, { status: "returned", notes: "Returned to grower" });
                                        const refreshed = await getBatch(batchId!);
                                        setBatch(refreshed);
                                        globalToast("success", `${lot.lot_code} marked as returned to grower.`);
                                      } catch {
                                        globalToast("error", "Failed to update lot status.");
                                      } finally {
                                        setLotUpdateSaving(false);
                                      }
                                    }}
                                    disabled={lotUpdateSaving}
                                    className="text-xs text-purple-600 hover:text-purple-700 font-medium"
                                  >
                                    Return
                                  </button>
                                )}
                              </div>
                            )}
                          </td>
                        </tr>
                        {isEditing && (
                          <tr>
                            <td colSpan={9} className="px-2 py-3 bg-gray-50 border-t-0">
                              <div className="grid grid-cols-4 gap-3">
                                <div>
                                  <label className="block text-xs text-gray-500 mb-1">Grade</label>
                                  <select
                                    value={editLotForm.grade || ""}
                                    onChange={(e) => setEditLotForm({ ...editLotForm, grade: e.target.value || undefined })}
                                    className="w-full border rounded px-2 py-1.5 text-sm"
                                  >
                                    <option value="">Select</option>
                                    {availableGrades.map((g) => (
                                      <option key={g} value={g}>{g}</option>
                                    ))}
                                  </select>
                                </div>
                                <div>
                                  <label className="block text-xs text-gray-500 mb-1">Size</label>
                                  <select
                                    value={editLotForm.size || ""}
                                    onChange={(e) => setEditLotForm({ ...editLotForm, size: e.target.value || undefined })}
                                    className="w-full border rounded px-2 py-1.5 text-sm"
                                  >
                                    <option value="">Select</option>
                                    {availableSizes.map((s) => (
                                      <option key={s} value={s}>{s}</option>
                                    ))}
                                  </select>
                                </div>
                                <div>
                                  <label className="block text-xs text-gray-500 mb-1">Box Type</label>
                                  <select
                                    value={editLotForm.box_size_id || ""}
                                    onChange={(e) => setEditLotForm({ ...editLotForm, box_size_id: e.target.value || undefined })}
                                    className="w-full border rounded px-2 py-1.5 text-sm"
                                  >
                                    <option value="">Select</option>
                                    {boxSizes.map((bs) => (
                                      <option key={bs.id} value={bs.id}>
                                        {bs.name} ({bs.weight_kg} kg)
                                      </option>
                                    ))}
                                  </select>
                                </div>
                                <div>
                                  <label className="block text-xs text-gray-500 mb-1">Carton Count</label>
                                  <input
                                    type="number"
                                    min={0}
                                    value={editLotForm.carton_count || ""}
                                    onChange={(e) => setEditLotForm({ ...editLotForm, carton_count: Number(e.target.value) })}
                                    className="w-full border rounded px-2 py-1.5 text-sm"
                                  />
                                </div>
                              </div>
                              <div className="grid grid-cols-4 gap-3 mt-3">
                                <div>
                                  <label className="block text-xs text-gray-500 mb-1">Waste (kg)</label>
                                  <input
                                    type="number"
                                    step="0.1"
                                    min={0}
                                    value={editLotForm.waste_kg || ""}
                                    onChange={(e) => setEditLotForm({ ...editLotForm, waste_kg: Number(e.target.value) })}
                                    className="w-full border rounded px-2 py-1.5 text-sm"
                                  />
                                </div>
                                <div>
                                  <label className="block text-xs text-gray-500 mb-1">Waste Reason</label>
                                  <input
                                    value={editLotForm.waste_reason || ""}
                                    onChange={(e) => setEditLotForm({ ...editLotForm, waste_reason: e.target.value || undefined })}
                                    placeholder="e.g. Sorting rejects"
                                    className="w-full border rounded px-2 py-1.5 text-sm"
                                  />
                                </div>
                                <div className="col-span-2">
                                  <label className="block text-xs text-gray-500 mb-1">Notes</label>
                                  <input
                                    value={editLotForm.notes || ""}
                                    onChange={(e) => setEditLotForm({ ...editLotForm, notes: e.target.value || undefined })}
                                    className="w-full border rounded px-2 py-1.5 text-sm"
                                  />
                                </div>
                              </div>
                              <div className="flex gap-2 mt-3">
                                <button
                                  disabled={lotUpdateSaving}
                                  onClick={async () => {
                                    setLotUpdateSaving(true);
                                    try {
                                      await updateLot(lot.id, editLotForm);
                                      const refreshed = await getBatch(batchId!);
                                      setBatch(refreshed);
                                      setEditingLotId(null);
                                      globalToast("success", "Lot updated.");
                                    } catch {
                                      globalToast("error", "Failed to update lot.");
                                    } finally {
                                      setLotUpdateSaving(false);
                                    }
                                  }}
                                  className="bg-green-600 text-white px-3 py-1.5 rounded text-sm font-medium hover:bg-green-700 disabled:opacity-50"
                                >
                                  {lotUpdateSaving ? "Saving..." : "Save"}
                                </button>
                                <button
                                  onClick={() => setEditingLotId(null)}
                                  className="border text-gray-600 px-3 py-1.5 rounded text-sm hover:bg-gray-50"
                                >
                                  Cancel
                                </button>
                                {/^2$|class\s*2|industrial/i.test(lot.grade || "") && lot.status !== "returned" && (
                                  <button
                                    disabled={lotUpdateSaving}
                                    onClick={async () => {
                                      if (!confirm(`Return lot ${lot.lot_code} to grower?`)) return;
                                      setLotUpdateSaving(true);
                                      try {
                                        await updateLot(lot.id, { status: "returned", notes: "Returned to grower" });
                                        const refreshed = await getBatch(batchId!);
                                        setBatch(refreshed);
                                        setEditingLotId(null);
                                        globalToast("success", `${lot.lot_code} marked as returned to grower.`);
                                      } catch {
                                        globalToast("error", "Failed to update lot status.");
                                      } finally {
                                        setLotUpdateSaving(false);
                                      }
                                    }}
                                    className="ml-auto bg-purple-600 text-white px-3 py-1.5 rounded text-sm font-medium hover:bg-purple-700 disabled:opacity-50"
                                  >
                                    Return to Grower
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
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
                          onChange={async (e) => {
                            const name = e.target.value;
                            setSelectedPalletType(name);
                            const pt = palletTypes.find((t) => t.name === name);
                            if (pt) {
                              setPalletCapacity(pt.capacity_boxes);
                              // Fetch per-box-size capacities
                              try {
                                const caps = await getPalletTypeCapacities(pt.id);
                                setPalletBoxCapacities(caps);
                                // Auto-resolve: if lots share a box_size_id with a specific capacity, use it
                                if (caps.box_capacities.length > 0 && batch?.lots) {
                                  const assignedLots = batch.lots.filter((l) => (lotAssignments[l.id] ?? 0) > 0);
                                  const lotBoxIds = [...new Set(assignedLots.map((l) => l.box_size_id).filter(Boolean))];
                                  if (lotBoxIds.length === 1) {
                                    const match = caps.box_capacities.find((bc) => bc.box_size_id === lotBoxIds[0]);
                                    if (match) setPalletCapacity(match.capacity);
                                  }
                                }
                              } catch {
                                setPalletBoxCapacities(null);
                              }
                            } else {
                              setPalletBoxCapacities(null);
                            }
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
                        value={palletCapacity || ""}
                        onChange={(e) => setPalletCapacity(Number(e.target.value))}
                        min={1}
                        className="w-full border rounded px-2 py-1.5 text-sm"
                      />
                      {palletBoxCapacities && palletBoxCapacities.box_capacities.length > 0 && (
                        <p className="text-xs text-blue-600 mt-1">
                          Per-box capacities: {palletBoxCapacities.box_capacities.map(
                            (bc) => `${bc.box_size_name}: ${bc.capacity}`
                          ).join(", ")}
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Pallet size & box type selection — from lot data in this batch */}
                  {(() => {
                    const availLots = batch.lots.filter((l) => l.carton_count - (l.palletized_boxes ?? 0) > 0);
                    const lotSizes = [...new Set(availLots.map((l) => l.size).filter(Boolean))] as string[];
                    const lotBoxTypes = [...new Set(availLots.map((l) => l.box_size_id).filter(Boolean))] as string[];
                    const boxTypeOptions = lotBoxTypes
                      .map((id) => boxSizes.find((bs) => bs.id === id))
                      .filter((bs): bs is BoxSizeConfig => !!bs);
                    return (
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Pallet Size *</label>
                          {lotSizes.length > 0 ? (
                            <select
                              value={palletSize}
                              onChange={(e) => setPalletSize(e.target.value)}
                              className="w-full border rounded px-2 py-1.5 text-sm"
                            >
                              <option value="">Select size</option>
                              {lotSizes.map((s) => (
                                <option key={s} value={s}>{s}</option>
                              ))}
                            </select>
                          ) : (
                            <p className="text-xs text-yellow-600">
                              No lot sizes found — set sizes on lots first.
                            </p>
                          )}
                        </div>
                        <div>
                          <label className="block text-xs text-gray-500 mb-1">Box Type</label>
                          {boxTypeOptions.length > 0 ? (
                            <select
                              value={palletBoxSizeId}
                              onChange={async (e) => {
                                const boxId = e.target.value;
                                setPalletBoxSizeId(boxId);
                                if (selectedPalletType && boxId) {
                                  const pt = palletTypes.find((t) => t.name === selectedPalletType);
                                  if (pt) {
                                    try {
                                      const caps = await getPalletTypeCapacities(pt.id);
                                      const match = caps.box_capacities.find((bc) => bc.box_size_id === boxId);
                                      if (match) setPalletCapacity(match.capacity);
                                    } catch {}
                                  }
                                }
                              }}
                              className="w-full border rounded px-2 py-1.5 text-sm"
                            >
                              <option value="">Select box type</option>
                              {boxTypeOptions.map((bs) => (
                                <option key={bs.id} value={bs.id}>{bs.name} ({bs.weight_kg} kg)</option>
                              ))}
                            </select>
                          ) : (
                            <p className="text-xs text-yellow-600">
                              No lot box types found — set box types on lots first.
                            </p>
                          )}
                        </div>
                        <p className="col-span-2 text-xs text-gray-400">
                          Only lots matching the selected size and box type will be shown below.
                        </p>
                      </div>
                    );
                  })()}

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
                          {batch.lots
                            .filter((lot) => (!palletSize || lot.size === palletSize) && (!palletBoxSizeId || lot.box_size_id === palletBoxSizeId))
                            .map((lot) => {
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
                                    value={assigned || ""}
                                    onChange={(e) => {
                                      const newAssignments = {
                                        ...lotAssignments,
                                        [lot.id]: Math.max(0, Math.min(available, Number(e.target.value))),
                                      };
                                      setLotAssignments(newAssignments);
                                      // Auto-resolve capacity from per-box-size overrides
                                      if (palletBoxCapacities && palletBoxCapacities.box_capacities.length > 0 && batch) {
                                        const assignedLots = batch.lots.filter((l) => (newAssignments[l.id] ?? 0) > 0);
                                        const boxIds = [...new Set(assignedLots.map((l) => l.box_size_id).filter(Boolean))];
                                        if (boxIds.length === 1) {
                                          const match = palletBoxCapacities.box_capacities.find((bc) => bc.box_size_id === boxIds[0]);
                                          if (match) setPalletCapacity(match.capacity);
                                        }
                                      }
                                    }}
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
                    {(palletSize || palletBoxSizeId) && batch.lots.filter((l) => (!palletSize || l.size === palletSize) && (!palletBoxSizeId || l.box_size_id === palletBoxSizeId)).length === 0 && (
                      <p className="text-xs text-yellow-600 mt-1">No lots match the selected size/box type filter.</p>
                    )}
                    {(() => {
                      // Only count lots visible in the current size/box type filter
                      const visibleLots = batch.lots.filter((l) =>
                        (!palletSize || l.size === palletSize) && (!palletBoxSizeId || l.box_size_id === palletBoxSizeId)
                      );
                      const totalAssigned = visibleLots.reduce((sum, l) => sum + (lotAssignments[l.id] ?? 0), 0);
                      const sizes = new Set(
                        visibleLots
                          .filter((l) => (lotAssignments[l.id] ?? 0) > 0)
                          .map((l) => l.size)
                          .filter(Boolean)
                      );
                      const mixedSizes = sizes.size > 1;
                      const boxTypeIds = new Set(
                        visibleLots
                          .filter((l) => (lotAssignments[l.id] ?? 0) > 0)
                          .map((l) => l.box_size_id)
                          .filter(Boolean)
                      );
                      const mixedBoxTypes = boxTypeIds.size > 1;
                      const boxTypeNames = [...boxTypeIds].map((id) => {
                        const bs = boxSizes.find((b) => b.id === id);
                        return bs?.name || id;
                      });
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
                            <label className="flex items-center gap-2 text-xs text-yellow-600 font-medium">
                              <input
                                type="checkbox"
                                checked={allowMixedSizes}
                                onChange={(e) => setAllowMixedSizes(e.target.checked)}
                                className="rounded"
                              />
                              Allow mixed sizes on pallet ({[...sizes].join(", ")})
                            </label>
                          )}
                          {mixedBoxTypes && (
                            <label className="flex items-center gap-2 text-xs text-yellow-600 font-medium">
                              <input
                                type="checkbox"
                                checked={allowMixedBoxTypes}
                                onChange={(e) => setAllowMixedBoxTypes(e.target.checked)}
                                className="rounded"
                              />
                              Allow mixed box types on pallet ({boxTypeNames.join(", ")})
                            </label>
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
                        if (!palletSize && !allowMixedSizes) {
                          globalToast("error", "Select a pallet size.");
                          return;
                        }
                        // Only include lots visible in the current filter
                        const visibleLotIds = new Set(
                          batch.lots
                            .filter((l) => (!palletSize || l.size === palletSize) && (!palletBoxSizeId || l.box_size_id === palletBoxSizeId))
                            .map((l) => l.id)
                        );
                        const assignments: LotAssignment[] = Object.entries(lotAssignments)
                          .filter(([lot_id, count]) => count > 0 && visibleLotIds.has(lot_id))
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
                            size: palletSize || undefined,
                            allow_mixed_sizes: allowMixedSizes,
                            allow_mixed_box_types: allowMixedBoxTypes,
                          });
                          globalToast("success", `${pallets.length} pallet(s) created.`);
                          setCreatingPallet(false);
                          setSelectedPalletType("");
                          setPalletSize("");
                          setAllowMixedSizes(false);
                          setAllowMixedBoxTypes(false);
                          setLotAssignments({});
                          // Refresh batch
                          const refreshed = await getBatch(batchId!);
                          setBatch(refreshed);
                        } catch (err: unknown) {
                          globalToast("error", getErrorMessage(err, "Failed to create pallet."));
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
                      onClick={() => { setCreatingPallet(false); setSelectedPalletType(""); setPalletSize(""); setPalletBoxSizeId(""); setAllowMixedSizes(false); setLotAssignments({}); }}
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
              {allocatingToExisting && (() => {
                // Filter pallets by selected pallet's size or show all if no pallet selected
                const selectedPallet = openPallets.find((p) => p.id === selectedPalletId);
                const palletFilterSize = selectedPallet?.size;
                const palletFilterBoxSizeId = selectedPallet?.box_size_id;
                // Show pallets whose size/box type matches the lots being assigned
                const assignedLotSizes = [...new Set(
                  batch.lots
                    .filter((l) => (lotAssignments[l.id] ?? 0) > 0)
                    .map((l) => l.size)
                    .filter(Boolean)
                )];
                const assignedLotBoxTypeIds = [...new Set(
                  batch.lots
                    .filter((l) => (lotAssignments[l.id] ?? 0) > 0)
                    .map((l) => l.box_size_id)
                    .filter(Boolean)
                )];
                const compatiblePallets = openPallets.filter((p) =>
                  (!p.size || assignedLotSizes.length === 0 || assignedLotSizes.includes(p.size)) &&
                  (!p.box_size_id || assignedLotBoxTypeIds.length === 0 || assignedLotBoxTypeIds.includes(p.box_size_id))
                );
                return (
                <div className="p-4 bg-blue-50 rounded-lg border border-blue-200 space-y-4">
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">Select Open Pallet *</label>
                    {openPallets.length > 0 ? (
                      <>
                        <select
                          value={selectedPalletId}
                          onChange={(e) => {
                            const pid = e.target.value;
                            setSelectedPalletId(pid);
                            // Zero out assignments for lots that don't match the selected pallet's size/box type
                            const pal = openPallets.find((p) => p.id === pid);
                            if (pal?.size || pal?.box_size_id) {
                              const updated: Record<string, number> = {};
                              for (const lot of batch.lots) {
                                const avail = lot.carton_count - (lot.palletized_boxes ?? 0);
                                const sizeMatch = !pal.size || lot.size === pal.size;
                                const boxTypeMatch = !pal.box_size_id || lot.box_size_id === pal.box_size_id;
                                updated[lot.id] = (sizeMatch && boxTypeMatch) ? (lotAssignments[lot.id] ?? avail) : 0;
                              }
                              setLotAssignments(updated);
                            }
                          }}
                          className="w-full border rounded px-2 py-1.5 text-sm"
                        >
                          <option value="">Select a pallet</option>
                          {compatiblePallets.map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.pallet_number} — {p.pallet_type_name || "Unknown type"} ({p.current_boxes}/{p.capacity_boxes} boxes)
                              {p.grade ? ` · ${p.grade}` : ""}
                              {p.size ? ` · Size: ${p.size}` : " · No size set"}
                              {p.box_size_name ? ` · Box: ${p.box_size_name}` : ""}
                            </option>
                          ))}
                        </select>
                        {(palletFilterSize || palletFilterBoxSizeId) && (
                          <p className="text-xs text-blue-600 mt-1">
                            {palletFilterSize && <>Pallet size: <span className="font-medium">{palletFilterSize}</span></>}
                            {palletFilterSize && palletFilterBoxSizeId && " · "}
                            {palletFilterBoxSizeId && <>Box type: <span className="font-medium">{selectedPallet?.box_size_name || palletFilterBoxSizeId}</span></>}
                            {" — only matching lots should be assigned."}
                          </p>
                        )}
                      </>
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
                            {batch.lots
                              .filter((lot) => (!palletFilterSize || lot.size === palletFilterSize) && (!palletFilterBoxSizeId || lot.box_size_id === palletFilterBoxSizeId))
                              .map((lot) => {
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
                                      value={assigned || ""}
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
                        // Only count lots visible in the current pallet filter
                        const visibleAllocLots = batch.lots.filter((l) =>
                          (!palletFilterSize || l.size === palletFilterSize) && (!palletFilterBoxSizeId || l.box_size_id === palletFilterBoxSizeId)
                        );
                        const totalAssigned = visibleAllocLots.reduce((sum, l) => sum + (lotAssignments[l.id] ?? 0), 0);
                        const remaining = selectedPallet ? selectedPallet.capacity_boxes - selectedPallet.current_boxes : 0;
                        return (
                          <div className="mt-2">
                            <p className="text-xs text-gray-500">
                              Total: <span className="font-medium">{totalAssigned}</span> boxes
                              {selectedPallet && ` · Pallet has ${remaining} spaces remaining`}
                              {selectedPallet && totalAssigned > remaining && (
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
                        const selPal = openPallets.find((p) => p.id === selectedPalletId);
                        const assignments: LotAssignment[] = Object.entries(lotAssignments)
                          .filter(([lot_id, count]) => {
                            if (count <= 0) return false;
                            const lot = batch.lots.find((l) => l.id === lot_id);
                            // Only include lots that match the pallet's size
                            if (selPal?.size && lot && lot.size && lot.size !== selPal.size) return false;
                            // Only include lots that match the pallet's box type
                            if (selPal?.box_size_id && lot && lot.box_size_id && lot.box_size_id !== selPal.box_size_id) return false;
                            return true;
                          })
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
                          globalToast("success", `Boxes allocated to ${selectedPallet?.pallet_number || "pallet"}.`);
                          setAllocatingToExisting(false);
                          setSelectedPalletId("");
                          setLotAssignments({});
                          const refreshed = await getBatch(batchId!);
                          setBatch(refreshed);
                        } catch (err: unknown) {
                          globalToast("error", getErrorMessage(err, "Failed to allocate boxes."));
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
                );
              })()}
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
                      value={wasteKg || ""}
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
                      globalToast("error", getErrorMessage(err, "Failed to close run."));
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
                      globalToast("error", getErrorMessage(err, "Failed to finalize GRN."));
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
