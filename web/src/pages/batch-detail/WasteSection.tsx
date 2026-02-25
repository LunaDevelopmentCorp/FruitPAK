import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { updateBatch } from "../../api/batches";
import { showToast as globalToast } from "../../store/toastStore";
import { BatchSectionProps } from "./types";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <>
      <span className="text-gray-500">{label}</span>
      <span className="text-gray-800">{value}</span>
    </>
  );
}

export default function WasteSection({ batch, batchId, onRefresh }: BatchSectionProps) {
  const { t } = useTranslation("batches");
  const [editingWaste, setEditingWaste] = useState(false);
  const [wasteKg, setWasteKg] = useState(0);
  const [wasteReason, setWasteReason] = useState("");
  const [wasteSaving, setWasteSaving] = useState(false);

  return (
    <div className="bg-white rounded-lg border p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-700">{t("waste.title")}</h3>
        {!editingWaste && batch.status !== "complete" && (
          <button
            onClick={() => { setEditingWaste(true); setWasteKg(batch.waste_kg ?? 0); setWasteReason(batch.waste_reason || ""); }}
            className="text-sm text-green-600 hover:text-green-700 font-medium"
          >
            {batch.waste_kg > 0 ? t("waste.editWaste") : t("waste.addWaste")}
          </button>
        )}
      </div>
      {batch.waste_kg > 0 && !editingWaste && (
        <div className="grid grid-cols-2 gap-y-2 text-sm">
          <Row label={t("waste.wasteWeight")} value={`${batch.waste_kg.toLocaleString()} kg`} />
          <Row label={t("waste.reason")} value={batch.waste_reason || "—"} />
        </div>
      )}
      {!batch.waste_kg && !editingWaste && (
        <p className="text-gray-400 text-sm">{t("waste.noWaste")}</p>
      )}
      {editingWaste && (
        <div className="space-y-3 p-3 bg-gray-50 rounded-lg border">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">{t("waste.weightLabel")}</label>
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
              <label className="block text-xs text-gray-500 mb-1">{t("waste.reason")}</label>
              <input
                value={wasteReason}
                onChange={(e) => setWasteReason(e.target.value)}
                placeholder={t("waste.reasonPlaceholder")}
                className="w-full border rounded px-2 py-1.5 text-sm"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={async () => {
                setWasteSaving(true);
                try {
                  await updateBatch(batchId, { waste_kg: wasteKg, waste_reason: wasteReason || undefined });
                  await onRefresh();
                  setEditingWaste(false);
                  globalToast("success", t("waste.wasteUpdated"));
                } catch {
                  globalToast("error", t("waste.wasteFailed"));
                } finally {
                  setWasteSaving(false);
                }
              }}
              disabled={wasteSaving}
              className="bg-green-600 text-white px-3 py-1.5 rounded text-sm font-medium hover:bg-green-700 disabled:opacity-50"
            >
              {wasteSaving ? t("common:actions.saving") : t("waste.saveWaste")}
            </button>
            <button
              onClick={() => setEditingWaste(false)}
              className="border text-gray-600 px-3 py-1.5 rounded text-sm hover:bg-gray-50"
            >
              {t("common:actions.cancel")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
