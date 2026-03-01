import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  updateLot,
  createLotsFromBatch,
  LotFromBatchItem,
  LotUpdatePayload,
} from "../../api/batches";
import { getBoxSizes, BoxSizeConfig, BinTypeConfig } from "../../api/pallets";
import { FruitTypeConfig } from "../../api/config";
import StatusBadge from "../../components/StatusBadge";
import { showToast as globalToast } from "../../store/toastStore";
import { BatchSectionProps, BatchConfigs, LotRowForm } from "./types";
import { useTableSort, sortRows, sortableThClass } from "../../hooks/useTableSort";

const LOTS_PER_PAGE = 15;

interface Props extends BatchSectionProps {
  configs: BatchConfigs;
}

export default function LotsSection({ batch, batchId, onRefresh, configs }: Props) {
  const { t } = useTranslation("batches");
  const { boxSizes, binTypes, fruitConfigs } = configs;
  const { sortCol, sortDir, toggleSort, sortIndicator } = useTableSort();

  const [creatingLots, setCreatingLots] = useState(false);
  const emptyRow = (): LotRowForm => ({ grade: "", carton_count: 0, unit: "cartons" as const });
  const [lotRows, setLotRows] = useState<LotRowForm[]>(() => Array.from({ length: 7 }, emptyRow));
  const [lotSaving, setLotSaving] = useState(false);
  const [lotValidationError, setLotValidationError] = useState(false);

  // Inline lot editing
  const [editingLotId, setEditingLotId] = useState<string | null>(null);
  const [editLotForm, setEditLotForm] = useState<LotUpdatePayload>({});
  const [lotUpdateSaving, setLotUpdateSaving] = useState(false);
  // Bin editing (class 2 lots) — local only, used for weight calculation
  const [editBinTypeId, setEditBinTypeId] = useState<string>("");
  const [editBinCount, setEditBinCount] = useState<number>(0);

  // Pagination
  const [lotsPage, setLotsPage] = useState(0);

  // Derived grades/sizes from fruit config
  const availableGrades = useMemo(() => {
    const config = fruitConfigs.find(
      (fc) => fc.fruit_type.toLowerCase() === batch.fruit_type.toLowerCase(),
    );
    return config?.grades ?? [];
  }, [fruitConfigs, batch.fruit_type]);

  const availableSizes = useMemo(() => {
    const config = fruitConfigs.find(
      (fc) => fc.fruit_type.toLowerCase() === batch.fruit_type.toLowerCase(),
    );
    const sizes = config?.sizes ?? [];
    return [...sizes].sort((a, b) => {
      const na = parseFloat(a);
      const nb = parseFloat(b);
      if (!isNaN(na) && !isNaN(nb)) return na - nb;
      return a.localeCompare(b);
    });
  }, [fruitConfigs, batch.fruit_type]);

  // Memoized auto-waste calculation
  const autoWasteInfo = useMemo(() => {
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
    return { incomingNet, existingLotWeight, existingLotWaste, newLotWeight, autoWaste };
  }, [batch.lots, batch.net_weight_kg, lotRows, binTypes, boxSizes]);

  // Paginated lots
  const lots = batch.lots || [];
  const totalPages = Math.max(1, Math.ceil(lots.length / LOTS_PER_PAGE));
  const paginatedLots = lots.slice(lotsPage * LOTS_PER_PAGE, (lotsPage + 1) * LOTS_PER_PAGE);

  const handleCreateLots = async () => {
    const hasAnyData = lotRows.some(
      (r) => r.grade || (r.carton_count ?? 0) > 0 || (r.bin_count && r.bin_count > 0) || r.box_size_id || r.size
    );
    const filledRows = lotRows.filter(
      (r) => r.grade || (r.carton_count ?? 0) > 0 || (r.bin_count && r.bin_count > 0) || r.box_size_id || r.size
    );
    const missingGrade = filledRows.some((r) => !r.grade);
    const missingSize = filledRows.some((r) => !r.size);
    const missingBoxType = filledRows.some((r) => r.unit === "cartons" && !r.box_size_id);
    if (!hasAnyData) {
      setLotValidationError(true);
      globalToast("error", t("lots.atLeastOneLot"));
      return;
    }
    if (missingGrade || missingSize || missingBoxType) {
      setLotValidationError(true);
      globalToast("error",
        missingGrade ? t("lots.gradeRequired")
        : missingSize ? t("lots.sizeRequired")
        : t("lots.boxTypeRequired"));
      return;
    }
    setLotValidationError(false);
    const valid = lotRows.filter((r) => r.grade);
    const apiLots: LotFromBatchItem[] = valid.map((r) => {
      if (r.unit === "bins") {
        const bt = binTypes.find((b) => b.id === r.bin_type_id);
        const netPerBin = bt ? bt.default_weight_kg - bt.tare_weight_kg : 0;
        return { grade: r.grade, size: r.size, carton_count: 0, weight_kg: (r.bin_count || 0) * netPerBin, notes: r.notes };
      }
      return { grade: r.grade, size: r.size, box_size_id: r.box_size_id, carton_count: r.carton_count, notes: r.notes };
    });
    setLotSaving(true);
    try {
      await createLotsFromBatch(batchId, apiLots);
      globalToast("success", t("lots.lotsCreated", { count: apiLots.length }));
      setCreatingLots(false);
      setLotRows(Array.from({ length: 7 }, emptyRow));
      // Backend auto-recalculates batch waste — just refresh UI
      await onRefresh();
    } catch {
      globalToast("error", t("lots.lotCreateFailed"));
    } finally {
      setLotSaving(false);
    }
  };

  return (
    <div className="bg-white rounded-lg border p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-700">
          {t("lots.title")} {lots.length > 0 && `(${lots.length})`}
        </h3>
        {!creatingLots && batch.status !== "complete" && batch.status !== "completed" && (
          <button
            onClick={() => {
              setCreatingLots(true);
              setLotValidationError(false);
              getBoxSizes().catch(() => {});
            }}
            className="text-sm text-green-600 hover:text-green-700 font-medium"
          >
            {t("lots.createLots")}
          </button>
        )}
      </div>

      {/* Create lots form */}
      {creatingLots && (
        <div className="mb-4 p-4 bg-gray-50 rounded-lg border space-y-3">
          <p className="text-xs text-gray-500">
            {t("lots.splitHelp")}
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
                  <label className="block text-xs text-gray-500 mb-1">{t("lots.grade")}</label>
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
                    <option value="">{t("lots.selectGrade")}</option>
                    {availableGrades.map((g) => (
                      <option key={g} value={g}>{g}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">{t("lots.sizeLot")}</label>
                  <select
                    value={row.size || ""}
                    onChange={(e) => {
                      const updated = [...lotRows];
                      updated[idx] = { ...updated[idx], size: e.target.value || undefined };
                      setLotRows(updated);
                      if (e.target.value) setLotValidationError(false);
                    }}
                    className={`w-full border rounded px-2 py-1.5 text-sm ${lotValidationError && !row.size && row.grade ? "border-red-400 bg-red-50" : ""}`}
                  >
                    <option value="">{t("lots.selectSize")}</option>
                    {availableSizes.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">{t("lots.unit")}</label>
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
                    <option value="cartons">{t("lots.cartons")}</option>
                    <option value="bins">{t("lots.bins")}</option>
                  </select>
                </div>
                {row.unit === "cartons" ? (
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">{t("lots.boxType")}</label>
                    <select
                      value={row.box_size_id || ""}
                      onChange={(e) => {
                        const updated = [...lotRows];
                        updated[idx] = { ...updated[idx], box_size_id: e.target.value || undefined };
                        setLotRows(updated);
                        if (e.target.value) setLotValidationError(false);
                      }}
                      className={`w-full border rounded px-2 py-1.5 text-sm ${lotValidationError && !row.box_size_id && row.grade ? "border-red-400 bg-red-50" : ""}`}
                    >
                      <option value="">{t("lots.selectBox")}</option>
                      {boxSizes.map((bs) => (
                        <option key={bs.id} value={bs.id}>
                          {bs.name} ({bs.weight_kg} kg)
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs text-gray-500 mb-1">{t("lots.binType")}</label>
                    <select
                      value={row.bin_type_id || ""}
                      onChange={(e) => {
                        const updated = [...lotRows];
                        updated[idx] = { ...updated[idx], bin_type_id: e.target.value || undefined };
                        setLotRows(updated);
                      }}
                      className="w-full border rounded px-2 py-1.5 text-sm"
                    >
                      <option value="">{t("lots.selectBin")}</option>
                      {binTypes.map((bt) => (
                        <option key={bt.id} value={bt.id}>
                          {bt.name} ({(bt.default_weight_kg - bt.tare_weight_kg).toFixed(0)} kg net)
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <div>
                  <label className="block text-xs text-gray-500 mb-1">{row.unit === "bins" ? t("lots.bins") : t("lots.cartons")}</label>
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
                  <label className="block text-xs text-gray-500 mb-1">{t("lots.weight")}</label>
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
                      {t("common:actions.remove")}
                    </button>
                  )}
                </div>
              </div>
            </div>
            );
          })}

          {/* Auto-waste summary (memoized) */}
          {autoWasteInfo.incomingNet > 0 && (
            <div className={`mt-2 p-2 rounded text-xs ${autoWasteInfo.autoWaste >= 0 ? "bg-blue-50 text-blue-700" : "bg-yellow-50 text-yellow-700"}`}>
              <span className="font-medium">{t("lots.autoWaste")}</span>{" "}
              {autoWasteInfo.autoWaste >= 0
                ? `${autoWasteInfo.autoWaste.toLocaleString(undefined, { maximumFractionDigits: 1 })} kg ${t("lots.autoWasteText")}`
                : t("lots.overweightWarning", { excess: Math.abs(autoWasteInfo.autoWaste).toLocaleString(undefined, { maximumFractionDigits: 1 }) })}
              <span className="text-gray-500 ml-2">
                ({autoWasteInfo.incomingNet.toLocaleString()} net − {(autoWasteInfo.existingLotWeight + autoWasteInfo.newLotWeight).toLocaleString()} lots − {autoWasteInfo.existingLotWaste.toLocaleString()} waste)
              </span>
            </div>
          )}

          <button
            type="button"
            onClick={() => setLotRows([...lotRows, { grade: "", carton_count: 0, unit: "cartons" as const }])}
            className="text-xs text-green-600 hover:text-green-700"
          >
            {t("lots.addRow")}
          </button>
          <div className="flex gap-2 pt-2 border-t">
            <button
              onClick={handleCreateLots}
              disabled={lotSaving}
              className="bg-green-600 text-white px-3 py-1.5 rounded text-sm font-medium hover:bg-green-700 disabled:opacity-50"
            >
              {lotSaving ? t("lots.creating") : t("lots.create")}
            </button>
            <button
              onClick={() => { setCreatingLots(false); setLotRows(Array.from({ length: 7 }, emptyRow)); }}
              className="border text-gray-600 px-3 py-1.5 rounded text-sm hover:bg-gray-50"
            >
              {t("common:actions.cancel")}
            </button>
          </div>
        </div>
      )}

      {/* Lots table with pagination */}
      {lots.length > 0 ? (
        <>
          <table className="w-full text-sm">
            <thead className="text-gray-500 text-xs">
              <tr>
                <th onClick={() => toggleSort("lot_code")} className={`text-left px-2 py-1.5 font-medium ${sortableThClass}`}>{t("lots.lotCode")}{sortIndicator("lot_code")}</th>
                <th onClick={() => toggleSort("grade")} className={`text-left px-2 py-1.5 font-medium ${sortableThClass}`}>{t("common:table.grade")}{sortIndicator("grade")}</th>
                <th onClick={() => toggleSort("size_label")} className={`text-left px-2 py-1.5 font-medium ${sortableThClass}`}>{t("common:table.size")}{sortIndicator("size_label")}</th>
                <th onClick={() => toggleSort("box_type")} className={`text-left px-2 py-1.5 font-medium ${sortableThClass}`}>{t("palletize.boxType")}{sortIndicator("box_type")}</th>
                <th onClick={() => toggleSort("cartons")} className={`text-right px-2 py-1.5 font-medium ${sortableThClass}`}>{t("lots.cartons")}{sortIndicator("cartons")}</th>
                <th onClick={() => toggleSort("weight")} className={`text-right px-2 py-1.5 font-medium ${sortableThClass}`}>{t("lots.weight")}{sortIndicator("weight")}</th>
                <th onClick={() => toggleSort("unallocated")} className={`text-right px-2 py-1.5 font-medium ${sortableThClass}`}>{t("lots.unallocated")}{sortIndicator("unallocated")}</th>
                <th onClick={() => toggleSort("status")} className={`text-left px-2 py-1.5 font-medium ${sortableThClass}`}>{t("common:table.status")}{sortIndicator("status")}</th>
                <th className="px-2 py-1.5 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {sortRows(paginatedLots, sortCol, sortDir, {
                lot_code: (r) => r.lot_code,
                grade: (r) => r.grade,
                size_label: (r) => r.size,
                box_type: (r) => boxSizes.find((bs) => bs.id === r.box_size_id)?.name ?? null,
                cartons: (r) => r.carton_count,
                weight: (r) => r.weight_kg,
                unallocated: (r) => r.carton_count - (r.palletized_boxes ?? 0),
                status: (r) => r.status,
              }).map((lot) => {
                const unallocated = lot.carton_count - (lot.palletized_boxes ?? 0);
                const isEditing = editingLotId === lot.id;
                const isBinGrade = /^2$|class\s*2|industrial/i.test((isEditing ? editLotForm.grade : lot.grade) || "");
                const isEditingBins = isEditing && isBinGrade && !editLotForm.box_size_id;
                const editBoxSize = isEditing && !isEditingBins ? boxSizes.find((bs) => bs.id === editLotForm.box_size_id) : null;
                const editBinType = isEditingBins ? binTypes.find((bt) => bt.id === editBinTypeId) : null;
                const editWeight = isEditing
                  ? isEditingBins && editBinType && editBinCount > 0
                    ? editBinCount * (editBinType.default_weight_kg - editBinType.tare_weight_kg)
                    : editLotForm.carton_count && editBoxSize
                      ? editLotForm.carton_count * editBoxSize.weight_kg
                      : null
                  : null;
                return (
                  <React.Fragment key={lot.id}>
                    <tr className={isEditing ? "bg-green-50/50" : "hover:bg-gray-50"}>
                      <td className="px-2 py-1.5 font-mono text-xs text-green-700">{lot.lot_code}</td>
                      <td className="px-2 py-1.5">
                        {isEditing ? (
                          <select
                            value={editLotForm.grade || ""}
                            onChange={(e) => setEditLotForm({ ...editLotForm, grade: e.target.value || undefined })}
                            className="w-full border rounded px-1.5 py-1 text-sm bg-white"
                          >
                            <option value="">—</option>
                            {availableGrades.map((g) => (
                              <option key={g} value={g}>{g}</option>
                            ))}
                          </select>
                        ) : (lot.grade || "—")}
                      </td>
                      <td className="px-2 py-1.5">
                        {isEditing ? (
                          <select
                            value={editLotForm.size || ""}
                            onChange={(e) => setEditLotForm({ ...editLotForm, size: e.target.value || undefined })}
                            className="w-full border rounded px-1.5 py-1 text-sm bg-white"
                          >
                            <option value="">—</option>
                            {availableSizes.map((s) => (
                              <option key={s} value={s}>{s}</option>
                            ))}
                          </select>
                        ) : (lot.size || "—")}
                      </td>
                      <td className="px-2 py-1.5 text-xs text-gray-600">
                        {isEditing ? (
                          isEditingBins ? (
                            <select
                              value={editBinTypeId}
                              onChange={(e) => setEditBinTypeId(e.target.value)}
                              className="w-full border rounded px-1.5 py-1 text-sm bg-white"
                            >
                              <option value="">{t("lots.selectBin")}</option>
                              {binTypes.map((bt) => (
                                <option key={bt.id} value={bt.id}>
                                  {bt.name} ({(bt.default_weight_kg - bt.tare_weight_kg).toFixed(0)} kg net)
                                </option>
                              ))}
                            </select>
                          ) : (
                            <select
                              value={editLotForm.box_size_id || ""}
                              onChange={(e) => setEditLotForm({ ...editLotForm, box_size_id: e.target.value || undefined })}
                              className="w-full border rounded px-1.5 py-1 text-sm bg-white"
                            >
                              <option value="">—</option>
                              {boxSizes.map((bs) => (
                                <option key={bs.id} value={bs.id}>
                                  {bs.name} ({bs.weight_kg} kg)
                                </option>
                              ))}
                            </select>
                          )
                        ) : (boxSizes.find((bs) => bs.id === lot.box_size_id)?.name || (isBinGrade ? t("lots.bins") : "—"))}
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        {isEditing ? (
                          isEditingBins ? (
                            <input
                              type="number"
                              min={0}
                              value={editBinCount || ""}
                              onChange={(e) => setEditBinCount(e.target.value ? Number(e.target.value) : 0)}
                              className="w-20 border rounded px-1.5 py-1 text-sm text-right bg-white"
                              placeholder={t("lots.bins")}
                            />
                          ) : (
                            <input
                              type="number"
                              min={0}
                              value={editLotForm.carton_count ?? ""}
                              onChange={(e) => setEditLotForm({ ...editLotForm, carton_count: e.target.value ? Number(e.target.value) : undefined })}
                              className="w-20 border rounded px-1.5 py-1 text-sm text-right bg-white"
                            />
                          )
                        ) : lot.carton_count}
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        {isEditing ? (
                          editWeight != null ? (
                            <span className="text-xs text-gray-500">
                              {editWeight.toLocaleString()} kg
                            </span>
                          ) : (
                            <input
                              type="number"
                              step="0.1"
                              min={0}
                              value={editLotForm.weight_kg ?? ""}
                              onChange={(e) => setEditLotForm({ ...editLotForm, weight_kg: e.target.value ? Number(e.target.value) : undefined })}
                              className="w-24 border rounded px-1.5 py-1 text-sm text-right bg-white"
                              placeholder="kg"
                            />
                          )
                        ) : (lot.weight_kg != null ? `${lot.weight_kg.toLocaleString()} kg` : "—")}
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
                        {!isEditing && batch.status !== "complete" && batch.status !== "completed" ? (
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => {
                                const isBinLot = /^2$|class\s*2|industrial/i.test(lot.grade || "") && !lot.box_size_id;
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
                                // Init bin state for class 2 lots
                                if (isBinLot) {
                                  const batchBin = binTypes.find((bt) => bt.name === batch?.bin_type);
                                  setEditBinTypeId(batchBin?.id || "");
                                  setEditBinCount(0);
                                } else {
                                  setEditBinTypeId("");
                                  setEditBinCount(0);
                                }
                              }}
                              className="text-xs text-green-600 hover:text-green-700 font-medium"
                            >
                              {t("common:actions.edit")}
                            </button>
                            {/^2$|class\s*2|industrial/i.test(lot.grade || "") && lot.status !== "returned" && (
                              <button
                                onClick={async () => {
                                  if (!confirm(`Return lot ${lot.lot_code} to grower?`)) return;
                                  setLotUpdateSaving(true);
                                  try {
                                    await updateLot(lot.id, { status: "returned", notes: "Returned to grower" });
                                    await onRefresh();
                                    globalToast("success", `${lot.lot_code} ${t("lots.lotReturned")}`);
                                  } catch {
                                    globalToast("error", t("lots.lotReturnFailed"));
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
                        ) : null}
                      </td>
                    </tr>
                    {isEditing && (
                      <tr>
                        <td colSpan={9} className="px-2 py-2 bg-green-50 border-t-0 border-l-2 border-l-green-400">
                          <div className="flex items-end gap-3">
                            <div className="flex-1 grid grid-cols-3 gap-3">
                              <div>
                                <label className="block text-xs text-gray-500 mb-1">{t("waste.wasteWeight")}</label>
                                <input
                                  type="number"
                                  step="0.1"
                                  min={0}
                                  value={editLotForm.waste_kg ?? ""}
                                  onChange={(e) => setEditLotForm({ ...editLotForm, waste_kg: e.target.value ? Number(e.target.value) : 0 })}
                                  className="w-full border rounded px-2 py-1.5 text-sm"
                                />
                              </div>
                              <div>
                                <label className="block text-xs text-gray-500 mb-1">{t("waste.reason")}</label>
                                <input
                                  value={editLotForm.waste_reason || ""}
                                  onChange={(e) => setEditLotForm({ ...editLotForm, waste_reason: e.target.value || undefined })}
                                  placeholder="e.g. Sorting rejects"
                                  className="w-full border rounded px-2 py-1.5 text-sm"
                                />
                              </div>
                              <div>
                                <label className="block text-xs text-gray-500 mb-1">{t("common:table.notes")}</label>
                                <input
                                  value={editLotForm.notes || ""}
                                  onChange={(e) => setEditLotForm({ ...editLotForm, notes: e.target.value || undefined })}
                                  className="w-full border rounded px-2 py-1.5 text-sm"
                                />
                              </div>
                            </div>
                            <div className="flex gap-2 shrink-0">
                              <button
                                disabled={lotUpdateSaving}
                                onClick={async () => {
                                  setLotUpdateSaving(true);
                                  try {
                                    const payload = { ...editLotForm };
                                    // Calculate weight: bins × net-per-bin OR cartons × box weight
                                    const binLot = /^2$|class\s*2|industrial/i.test(payload.grade || "") && !payload.box_size_id;
                                    if (binLot && editBinTypeId && editBinCount > 0) {
                                      const bt = binTypes.find((b) => b.id === editBinTypeId);
                                      if (bt) {
                                        payload.weight_kg = editBinCount * (bt.default_weight_kg - bt.tare_weight_kg);
                                      }
                                    } else {
                                      const bs = boxSizes.find((b) => b.id === payload.box_size_id);
                                      if (bs && payload.carton_count != null) {
                                        payload.weight_kg = payload.carton_count * bs.weight_kg;
                                      }
                                    }
                                    await updateLot(lot.id, payload);
                                    // Backend auto-recalculates batch waste — just refresh UI
                                    await onRefresh();
                                    setEditingLotId(null);
                                    globalToast("success", t("lots.lotUpdated"));
                                  } catch {
                                    globalToast("error", t("lots.lotUpdateFailed"));
                                  } finally {
                                    setLotUpdateSaving(false);
                                  }
                                }}
                                className="bg-green-600 text-white px-3 py-1.5 rounded text-sm font-medium hover:bg-green-700 disabled:opacity-50"
                              >
                                {lotUpdateSaving ? t("common:actions.saving") : t("common:actions.save")}
                              </button>
                              <button
                                onClick={() => setEditingLotId(null)}
                                className="border text-gray-600 px-3 py-1.5 rounded text-sm hover:bg-gray-50"
                              >
                                {t("common:actions.cancel")}
                              </button>
                              {/^2$|class\s*2|industrial/i.test(lot.grade || "") && lot.status !== "returned" && (
                                <button
                                  disabled={lotUpdateSaving}
                                  onClick={async () => {
                                    if (!confirm(`Return lot ${lot.lot_code} to grower?`)) return;
                                    setLotUpdateSaving(true);
                                    try {
                                      await updateLot(lot.id, { status: "returned", notes: "Returned to grower" });
                                      await onRefresh();
                                      setEditingLotId(null);
                                      globalToast("success", `${lot.lot_code} ${t("lots.lotReturned")}`);
                                    } catch {
                                      globalToast("error", t("lots.lotReturnFailed"));
                                    } finally {
                                      setLotUpdateSaving(false);
                                    }
                                  }}
                                  className="bg-purple-600 text-white px-3 py-1.5 rounded text-sm font-medium hover:bg-purple-700 disabled:opacity-50"
                                >
                                  {t("lots.returnToGrower")}
                                </button>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
            <tfoot className="border-t-2 border-gray-300 bg-gray-50 font-semibold text-sm">
              <tr>
                <td className="px-2 py-2" colSpan={4}>{t("lots.totals")}</td>
                <td className="px-2 py-2 text-right">{lots.reduce((s, l) => s + l.carton_count, 0).toLocaleString()}</td>
                <td className="px-2 py-2 text-right">
                  {lots.reduce((s, l) => s + (l.weight_kg ?? 0), 0).toLocaleString()} kg
                </td>
                <td className="px-2 py-2 text-right">
                  {lots.reduce((s, l) => s + l.carton_count - (l.palletized_boxes ?? 0), 0).toLocaleString()}
                </td>
                <td colSpan={2}></td>
              </tr>
            </tfoot>
          </table>

          {/* Pagination controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between mt-3 pt-3 border-t">
              <p className="text-xs text-gray-500">
                {t("lots.showingLots", { start: lotsPage * LOTS_PER_PAGE + 1, end: Math.min((lotsPage + 1) * LOTS_PER_PAGE, lots.length), total: lots.length })}
              </p>
              <div className="flex gap-1">
                <button
                  onClick={() => setLotsPage(Math.max(0, lotsPage - 1))}
                  disabled={lotsPage === 0}
                  className="px-2 py-1 text-xs border rounded disabled:opacity-30 hover:bg-gray-50"
                >
                  Prev
                </button>
                {Array.from({ length: totalPages }, (_, i) => (
                  <button
                    key={i}
                    onClick={() => setLotsPage(i)}
                    className={`px-2 py-1 text-xs border rounded ${i === lotsPage ? "bg-green-600 text-white border-green-600" : "hover:bg-gray-50"}`}
                  >
                    {i + 1}
                  </button>
                ))}
                <button
                  onClick={() => setLotsPage(Math.min(totalPages - 1, lotsPage + 1))}
                  disabled={lotsPage >= totalPages - 1}
                  className="px-2 py-1 text-xs border rounded disabled:opacity-30 hover:bg-gray-50"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </>
      ) : !creatingLots ? (
        <p className="text-gray-400 text-sm">{t("lots.noLots")}</p>
      ) : null}
    </div>
  );
}
