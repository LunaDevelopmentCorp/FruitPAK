import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { getErrorMessage } from "../../api/client";
import { closeProductionRun, finalizeGRN, getBatch } from "../../api/batches";
import { showToast as globalToast } from "../../store/toastStore";
import { BatchSectionProps } from "./types";

export default function ProductionActions({ batch, batchId, onRefresh }: BatchSectionProps) {
  const { t } = useTranslation("batches");
  const [closingSaving, setClosingSaving] = useState(false);
  const [finalizeSaving, setFinalizeSaving] = useState(false);
  const lots = batch.lots || [];

  const { totalUnallocated, allAllocated } = useMemo(() => {
    const totalUnallocated = lots.reduce(
      (sum, l) => sum + l.carton_count - (l.palletized_boxes ?? 0), 0
    );
    return { totalUnallocated, allAllocated: totalUnallocated === 0 };
  }, [lots]);

  const { balanced, diff } = useMemo(() => {
    const incomingNet = batch.net_weight_kg ?? 0;
    const lotWeight = lots.reduce((sum, l) => sum + (l.weight_kg ?? 0), 0);
    const lotWaste = lots.reduce((sum, l) => sum + (l.waste_kg ?? 0), 0);
    const batchWaste = batch.waste_kg ?? 0;
    const diff = incomingNet - (lotWeight + lotWaste + batchWaste);
    return { balanced: Math.abs(diff) < 0.5, diff };
  }, [batch.net_weight_kg, batch.waste_kg, lots]);

  if (lots.length === 0) return null;

  return (
    <>
      {/* Close Production Run */}
      {batch.status !== "complete" && (
        <div className="bg-white rounded-lg border p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">{t("production.closeTitle")}</h3>
          {!allAllocated && (
            <p className="text-sm text-yellow-600 mb-3">
              {t("production.unallocatedWarning", { count: totalUnallocated })}
            </p>
          )}
          <button
            onClick={async () => {
              setClosingSaving(true);
              try {
                await closeProductionRun(batchId);
                await onRefresh();
                globalToast("success", t("production.closedSuccess"));
              } catch (err: unknown) {
                globalToast("error", getErrorMessage(err, t("production.closeFailed")));
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
            {closingSaving ? t("production.closing") : t("production.closeButton")}
          </button>
        </div>
      )}

      {/* Finalize GRN */}
      {batch.status === "complete" && (
        <div className="bg-white rounded-lg border p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">{t("production.finalizeTitle")}</h3>
          <p className="text-sm text-gray-600 mb-3">
            {t("production.finalizeHelp")}
            {!balanced && (
              <span className="text-amber-600 block mt-1">
                {t("production.unaccountedWeight", { weight: `${diff > 0 ? "+" : ""}${diff.toFixed(1)}` })}
              </span>
            )}
          </p>
          <button
            onClick={async () => {
              setFinalizeSaving(true);
              try {
                await finalizeGRN(batchId);
                await onRefresh();
                globalToast("success", t("production.finalizedSuccess"));
              } catch (err: unknown) {
                globalToast("error", getErrorMessage(err, t("production.finalizeFailed")));
              } finally {
                setFinalizeSaving(false);
              }
            }}
            disabled={finalizeSaving}
            className="bg-green-600 text-white px-4 py-2 rounded text-sm font-medium hover:bg-green-700 disabled:opacity-50"
          >
            {finalizeSaving ? t("production.finalizing") : t("production.finalizeButton")}
          </button>
        </div>
      )}
    </>
  );
}
