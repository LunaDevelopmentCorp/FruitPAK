import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useForm } from "react-hook-form";
import { BatchUpdatePayload, updateBatch } from "../../api/batches";
import { getErrorMessage } from "../../api/client";
import { showToast as globalToast } from "../../store/toastStore";
import { InlineEditPanelProps } from "./types";

export default function InlineEditPanel({
  batch,
  binTypes,
  onSave,
  onCancel,
}: InlineEditPanelProps) {
  const { t } = useTranslation("grn");
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const { register, handleSubmit, watch, setValue } = useForm<BatchUpdatePayload>({
    defaultValues: {
      variety: batch.variety || "",
      bin_type: batch.bin_type || "",
      bin_count: batch.bin_count ?? undefined,
      gross_weight_kg: batch.gross_weight_kg ?? undefined,
      tare_weight_kg: batch.tare_weight_kg,
      harvest_date: batch.harvest_date?.split("T")[0] || "",
      vehicle_reg: batch.vehicle_reg || "",
      driver_name: batch.driver_name || "",
      notes: batch.notes || "",
    },
  });

  // Weight recalculation when bin count or bin type changes
  const watchedBinCount = watch("bin_count");
  const watchedBinType = watch("bin_type");
  const grossWeight = watch("gross_weight_kg");
  const tareWeight = watch("tare_weight_kg");
  const netWeight =
    grossWeight != null && Number(grossWeight) > 0
      ? Number(grossWeight) - (Number(tareWeight) || 0)
      : null;

  useEffect(() => {
    if (!watchedBinType || !watchedBinCount) return;
    const bt = binTypes.find((b) => b.name === watchedBinType);
    if (!bt) return;
    const count = Number(watchedBinCount) || 0;
    if (count <= 0) return;
    if (bt.default_weight_kg > 0) {
      setValue("gross_weight_kg", bt.default_weight_kg * count);
    }
    if (bt.tare_weight_kg > 0) {
      setValue("tare_weight_kg", bt.tare_weight_kg * count);
    }
  }, [watchedBinCount, watchedBinType, binTypes, setValue]);

  const onEditSubmit = async (data: BatchUpdatePayload) => {
    setSaving(true);
    setEditError(null);
    try {
      const payload: BatchUpdatePayload = {};
      if (data.variety) payload.variety = data.variety;
      if (data.harvest_date) payload.harvest_date = data.harvest_date;
      if (data.gross_weight_kg) payload.gross_weight_kg = Number(data.gross_weight_kg);
      if (data.tare_weight_kg !== undefined) payload.tare_weight_kg = Number(data.tare_weight_kg);
      if (data.bin_count) payload.bin_count = Number(data.bin_count);
      if (data.bin_type) payload.bin_type = data.bin_type;
      if (data.vehicle_reg !== undefined) payload.vehicle_reg = data.vehicle_reg;
      if (data.driver_name !== undefined) payload.driver_name = data.driver_name;
      if (data.notes !== undefined) payload.notes = data.notes;

      await updateBatch(batch.id, payload);
      globalToast("success", t("recent.batchUpdated", { code: batch.batch_code }));
      onSave();
    } catch (err: unknown) {
      setEditError(getErrorMessage(err, t("recent.updateFailed")));
    } finally {
      setSaving(false);
    }
  };

  const inputCls = "w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400";

  return (
    <form onSubmit={handleSubmit(onEditSubmit)} className="bg-amber-50 border border-amber-200 rounded-b-lg p-4 space-y-3">
      {editError && (
        <div className="p-2 bg-red-50 text-red-700 rounded text-xs">{editError}</div>
      )}

      <div className="grid grid-cols-4 gap-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">{t("edit.variety")}</label>
          <input {...register("variety")} className={inputCls} />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">{t("edit.binType")}</label>
          <select {...register("bin_type")} className={inputCls}>
            <option value="">{t("edit.selectBinType")}</option>
            {binTypes.map((bt) => (
              <option key={bt.id} value={bt.name}>
                {bt.name}{bt.default_weight_kg > 0 ? ` (${bt.default_weight_kg} kg)` : ""}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">{t("edit.binCount")}</label>
          <input type="number" {...register("bin_count", { valueAsNumber: true })} className={inputCls} />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">{t("edit.harvestDate")}</label>
          <input type="date" {...register("harvest_date")} className={inputCls} />
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">{t("edit.grossWeight")}</label>
          <input type="number" step="0.1" {...register("gross_weight_kg", { valueAsNumber: true })} className={inputCls} />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">{t("edit.tareWeight")}</label>
          <input type="number" step="0.1" {...register("tare_weight_kg", { valueAsNumber: true })} className={inputCls} />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">{t("edit.netWeight")}</label>
          <p className="px-2 py-1.5 text-sm text-gray-600 bg-amber-100 rounded">
            {netWeight != null ? `${netWeight.toLocaleString(undefined, { maximumFractionDigits: 1 })} kg` : "\u2014"}
          </p>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">{t("edit.notes")}</label>
          <input {...register("notes")} className={inputCls} placeholder={t("edit.notesPlaceholder")} />
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">{t("edit.vehicleReg")}</label>
          <input {...register("vehicle_reg")} className={inputCls} placeholder={t("edit.vehicleRegPlaceholder")} />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">{t("edit.driverName")}</label>
          <input {...register("driver_name")} className={inputCls} placeholder={t("edit.driverNamePlaceholder")} />
        </div>
      </div>

      {watchedBinType && binTypes.find((b) => b.name === watchedBinType) && (
        <p className="text-xs text-gray-500">
          {t("recent.autoCalcHint")}
        </p>
      )}

      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          disabled={saving}
          className="bg-amber-600 text-white px-4 py-1.5 rounded text-sm font-medium hover:bg-amber-700 disabled:opacity-50"
        >
          {saving ? t("common:actions.saving") : t("common:actions.saveChanges")}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="border text-gray-600 px-4 py-1.5 rounded text-sm hover:bg-gray-50"
        >
          {t("common:actions.cancel")}
        </button>
      </div>
    </form>
  );
}
