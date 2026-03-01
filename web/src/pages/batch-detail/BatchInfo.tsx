import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useForm } from "react-hook-form";
import {
  BatchDetail as BatchDetailType,
  BatchUpdatePayload,
  updateBatch,
} from "../../api/batches";
import { getBinTypes, BinTypeConfig } from "../../api/pallets";
import { showToast as globalToast } from "../../store/toastStore";
import { LockBanner } from "../../components/LockIndicator";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <>
      <span className="text-gray-500">{label}</span>
      <span className="text-gray-800">{value}</span>
    </>
  );
}

interface EditFormData {
  variety: string;
  harvest_date: string;
  gross_weight_kg: string;
  tare_weight_kg: string;
  bin_count: string;
  bin_type: string;
  vehicle_reg: string;
  driver_name: string;
  notes: string;
  rejection_reason: string;
}

export default React.memo(function BatchInfo({
  batch,
  onRefresh,
}: {
  batch: BatchDetailType;
  onRefresh?: () => Promise<void>;
}) {
  const { t } = useTranslation("batches");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [binTypes, setBinTypes] = useState<BinTypeConfig[]>([]);

  useEffect(() => {
    if (editing && binTypes.length === 0) {
      getBinTypes().then(setBinTypes).catch(() => {});
    }
  }, [editing, binTypes.length]);

  const { register, handleSubmit, watch, setValue, reset } = useForm<EditFormData>({
    defaultValues: {
      variety: batch.variety || "",
      harvest_date: batch.harvest_date?.split("T")[0] || "",
      gross_weight_kg: batch.gross_weight_kg?.toString() || "",
      tare_weight_kg: batch.tare_weight_kg?.toString() || "0",
      bin_count: batch.bin_count?.toString() || "",
      bin_type: batch.bin_type || "",
      vehicle_reg: batch.vehicle_reg || "",
      driver_name: batch.driver_name || "",
      notes: batch.notes || "",
      rejection_reason: batch.rejection_reason || "",
    },
  });

  const grossStr = watch("gross_weight_kg");
  const tareStr = watch("tare_weight_kg");
  const gross = parseFloat(grossStr);
  const tare = parseFloat(tareStr);
  const netWeight = !isNaN(gross) && gross > 0 ? gross - (isNaN(tare) ? 0 : tare) : null;

  const watchedBinCount = watch("bin_count");
  const watchedBinType = watch("bin_type");

  useEffect(() => {
    if (!watchedBinType || !watchedBinCount) return;
    const bt = binTypes.find((b) => b.name === watchedBinType);
    if (!bt) return;
    const count = Number(watchedBinCount) || 0;
    if (count <= 0) return;
    if (bt.default_weight_kg > 0) {
      setValue("gross_weight_kg", (bt.default_weight_kg * count).toString());
    }
    if (bt.tare_weight_kg > 0) {
      setValue("tare_weight_kg", (bt.tare_weight_kg * count).toString());
    }
  }, [watchedBinCount, watchedBinType, binTypes, setValue]);

  const startEditing = () => {
    reset({
      variety: batch.variety || "",
      harvest_date: batch.harvest_date?.split("T")[0] || "",
      gross_weight_kg: batch.gross_weight_kg?.toString() || "",
      tare_weight_kg: batch.tare_weight_kg?.toString() || "0",
      bin_count: batch.bin_count?.toString() || "",
      bin_type: batch.bin_type || "",
      vehicle_reg: batch.vehicle_reg || "",
      driver_name: batch.driver_name || "",
      notes: batch.notes || "",
      rejection_reason: batch.rejection_reason || "",
    });
    setEditing(true);
  };

  const cancelEditing = () => {
    setEditing(false);
  };

  const onSubmit = async (data: EditFormData) => {
    setSaving(true);
    try {
      const payload: BatchUpdatePayload = {};
      if (data.variety !== (batch.variety || "")) payload.variety = data.variety;
      if (data.harvest_date !== (batch.harvest_date?.split("T")[0] || ""))
        payload.harvest_date = data.harvest_date || undefined;
      const newGross = parseFloat(data.gross_weight_kg);
      if (!isNaN(newGross) && newGross !== batch.gross_weight_kg)
        payload.gross_weight_kg = newGross;
      const newTare = parseFloat(data.tare_weight_kg);
      if (!isNaN(newTare) && newTare !== batch.tare_weight_kg)
        payload.tare_weight_kg = newTare;
      const newBinCount = parseInt(data.bin_count, 10);
      if (!isNaN(newBinCount) && newBinCount !== batch.bin_count)
        payload.bin_count = newBinCount;
      if (data.bin_type !== (batch.bin_type || "")) payload.bin_type = data.bin_type;
      if (data.vehicle_reg !== (batch.vehicle_reg || ""))
        payload.vehicle_reg = data.vehicle_reg;
      if (data.driver_name !== (batch.driver_name || ""))
        payload.driver_name = data.driver_name;
      if (data.notes !== (batch.notes || "")) payload.notes = data.notes;
      if (data.rejection_reason !== (batch.rejection_reason || ""))
        payload.rejection_reason = data.rejection_reason;

      if (Object.keys(payload).length === 0) {
        setEditing(false);
        return;
      }

      await updateBatch(batch.id, payload);
      globalToast("success", t("info.updated"));
      setEditing(false);
      if (onRefresh) await onRefresh();
    } catch {
      globalToast("error", t("info.updateFailed"));
    } finally {
      setSaving(false);
    }
  };

  const inputCls =
    "w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-400";

  if (editing) {
    return (
      <form onSubmit={handleSubmit(onSubmit)} className="bg-white rounded-lg border p-4 space-y-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-gray-700">{t("info.editTitle")}</h3>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="bg-green-600 text-white px-4 py-1.5 rounded text-sm font-medium hover:bg-green-700 disabled:opacity-50"
            >
              {saving ? t("common:actions.saving") : t("common:actions.saveChanges")}
            </button>
            <button
              type="button"
              onClick={cancelEditing}
              className="border text-gray-600 px-4 py-1.5 rounded text-sm hover:bg-gray-50"
            >
              {t("common:actions.cancel")}
            </button>
          </div>
        </div>

        {batch.locked_fields && batch.locked_fields.length > 0 && (
          <LockBanner message={t("common:locks.batchPayment")} />
        )}

        {/* Weights */}
        <div>
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            {t("info.weights")}
          </h4>
          <div className="grid grid-cols-4 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">{t("info.binType")}</label>
              <select
                {...register("bin_type")}
                disabled={batch.locked_fields?.includes("bin_type")}
                className={`${inputCls} disabled:bg-gray-100 disabled:cursor-not-allowed`}
              >
                <option value="">—</option>
                {binTypes.map((bt) => (
                  <option key={bt.id} value={bt.name}>
                    {bt.name}
                    {bt.default_weight_kg > 0 ? ` (${bt.default_weight_kg} kg)` : ""}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">{t("info.binCount")}</label>
              <input
                type="number"
                {...register("bin_count")}
                disabled={batch.locked_fields?.includes("bin_count")}
                className={`${inputCls} disabled:bg-gray-100 disabled:cursor-not-allowed`}
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">{t("info.gross")}</label>
              <input
                type="number"
                step="0.1"
                {...register("gross_weight_kg")}
                disabled={batch.locked_fields?.includes("gross_weight_kg")}
                className={`${inputCls} disabled:bg-gray-100 disabled:cursor-not-allowed`}
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">{t("info.tare")}</label>
              <input
                type="number"
                step="0.1"
                {...register("tare_weight_kg")}
                disabled={batch.locked_fields?.includes("tare_weight_kg")}
                className={`${inputCls} disabled:bg-gray-100 disabled:cursor-not-allowed`}
              />
            </div>
          </div>
          <div className="mt-2">
            <span className="text-xs text-gray-500">{t("info.net")}: </span>
            <span className="text-sm font-semibold text-gray-800">
              {netWeight != null
                ? `${netWeight.toLocaleString(undefined, { maximumFractionDigits: 1 })} kg`
                : "—"}
            </span>
          </div>
        </div>

        {/* Fruit Details */}
        <div>
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            {t("info.fruitDetails")}
          </h4>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">{t("info.fruitType")}</label>
              <p className="px-2 py-1.5 text-sm text-gray-600 bg-gray-100 rounded">
                {batch.fruit_type}
              </p>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">{t("info.variety")}</label>
              <input {...register("variety")} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">{t("info.harvestDate")}</label>
              <input type="date" {...register("harvest_date")} className={inputCls} />
            </div>
          </div>
        </div>

        {/* Delivery & Vehicle */}
        <div>
          <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
            {t("info.delivery")}
          </h4>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">{t("info.vehicleReg")}</label>
              <input {...register("vehicle_reg")} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">{t("info.driverName")}</label>
              <input {...register("driver_name")} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">{t("info.notes")}</label>
              <input {...register("notes")} className={inputCls} />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">
                {t("info.rejectionReason")}
              </label>
              <input {...register("rejection_reason")} className={inputCls} />
            </div>
          </div>
        </div>

      </form>
    );
  }

  return (
    <>
      {/* Edit button row */}
      {batch.status !== "complete" && batch.status !== "completed" && (
        <div className="flex justify-end">
          <button
            onClick={startEditing}
            className="flex items-center gap-1.5 text-sm text-green-700 hover:text-green-800 font-medium"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
              />
            </svg>
            {t("info.editBatch")}
          </button>
        </div>
      )}

      {/* Weights card */}
      <div className="bg-white rounded-lg border p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">{t("info.weights")}</h3>
        <div className="grid grid-cols-3 gap-4 text-sm">
          <div>
            <p className="text-gray-500">{t("info.gross")}</p>
            <p className="text-gray-800 font-medium">
              {batch.gross_weight_kg != null
                ? `${batch.gross_weight_kg.toLocaleString()} kg`
                : t("info.pending")}
            </p>
          </div>
          <div>
            <p className="text-gray-500">{t("info.tare")}</p>
            <p className="text-gray-800 font-medium">
              {batch.tare_weight_kg.toLocaleString()} kg
            </p>
          </div>
          <div>
            <p className="text-gray-500">{t("info.net")}</p>
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
        <h3 className="text-sm font-semibold text-gray-700 mb-3">{t("info.growerPackhouse")}</h3>
        <div className="grid grid-cols-2 gap-y-2 text-sm">
          <Row label={t("common:table.grower")} value={batch.grower_code ? `${batch.grower_name || batch.grower_id} (${batch.grower_code})` : (batch.grower_name || batch.grower_id)} />
          <Row label={t("info.packhouse")} value={batch.packhouse_name || batch.packhouse_id} />
          <Row label={t("info.harvestTeam")} value={batch.harvest_team_name || "—"} />
          <Row
            label={t("info.harvestDate")}
            value={batch.harvest_date ? new Date(batch.harvest_date).toLocaleDateString() : "—"}
          />
          <Row
            label={t("info.intakeDate")}
            value={batch.intake_date ? new Date(batch.intake_date).toLocaleDateString() : "—"}
          />
        </div>
      </div>

      {/* Fruit Details card */}
      <div className="bg-white rounded-lg border p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">{t("info.fruitDetails")}</h3>
        <div className="grid grid-cols-2 gap-y-2 text-sm">
          <Row label={t("info.fruitType")} value={batch.fruit_type} />
          <Row label={t("info.variety")} value={batch.variety || "—"} />
          <Row label={t("info.binCount")} value={batch.bin_count?.toString() || "—"} />
          <Row label={t("info.binType")} value={batch.bin_type || "—"} />
        </div>
      </div>

      {/* Delivery & Vehicle card */}
      <div className="bg-white rounded-lg border p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">{t("info.delivery")}</h3>
        <div className="grid grid-cols-2 gap-y-2 text-sm">
          <Row label={t("info.vehicleReg")} value={batch.vehicle_reg || "—"} />
          <Row label={t("info.driverName")} value={batch.driver_name || "—"} />
          <Row label={t("info.notes")} value={batch.notes || "—"} />
          <Row label={t("info.rejectionReason")} value={batch.rejection_reason || "—"} />
        </div>
      </div>
    </>
  );
});
