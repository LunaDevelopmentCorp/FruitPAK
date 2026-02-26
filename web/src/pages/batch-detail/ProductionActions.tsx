import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { getErrorMessage } from "../../api/client";
import { closeProductionRun, finalizeGRN, reopenProductionRun } from "../../api/batches";
import { showToast as globalToast } from "../../store/toastStore";
import { BatchSectionProps } from "./types";

export default function ProductionActions({ batch, batchId, onRefresh }: BatchSectionProps) {
  const { t } = useTranslation("batches");
  const [closingSaving, setClosingSaving] = useState(false);
  const [finalizeSaving, setFinalizeSaving] = useState(false);
  const [reopenSaving, setReopenSaving] = useState(false);
  const lots = batch.lots || [];

  const { totalUnallocated, allAllocated } = useMemo(() => {
    const totalUnallocated = lots.reduce(
      (sum, l) => sum + l.carton_count - (l.palletized_boxes ?? 0), 0
    );
    return { totalUnallocated, allAllocated: totalUnallocated === 0 };
  }, [lots]);

  const { diff } = useMemo(() => {
    const incomingNet = batch.net_weight_kg ?? 0;
    const lotWeight = lots.reduce((sum, l) => sum + (l.weight_kg ?? 0), 0);
    const lotWaste = lots.reduce((sum, l) => sum + (l.waste_kg ?? 0), 0);
    const batchWaste = batch.waste_kg ?? 0;
    const diff = incomingNet - (lotWeight + lotWaste + batchWaste);
    return { diff };
  }, [batch.net_weight_kg, batch.waste_kg, lots]);

  if (lots.length === 0) return null;

  const isClosed = batch.status === "complete";
  const isFinalized = batch.status === "completed";

  return (
    <div className="bg-white rounded-lg border p-4 space-y-4">
      {/* ── Step 1: Close Production Run ────────────────────── */}
      <div>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-700">{t("production.closeTitle")}</h3>
          {isClosed && (
            <span className="text-xs font-medium text-green-700 bg-green-100 px-2 py-0.5 rounded">
              {t("production.closedLabel")}
            </span>
          )}
          {isFinalized && (
            <span className="text-xs font-medium text-blue-700 bg-blue-100 px-2 py-0.5 rounded">
              {t("production.finalizedLabel")}
            </span>
          )}
        </div>

        {/* Not yet closed — show close button */}
        {!isClosed && !isFinalized && (
          <div className="mt-3">
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

        {/* Closed — show reopen option */}
        {isClosed && (
          <div className="mt-3 flex items-center gap-3">
            <p className="text-sm text-gray-500">{t("production.closedHelp")}</p>
            <button
              onClick={async () => {
                setReopenSaving(true);
                try {
                  await reopenProductionRun(batchId);
                  await onRefresh();
                  globalToast("success", t("production.reopenedSuccess"));
                } catch (err: unknown) {
                  globalToast("error", getErrorMessage(err, t("production.reopenFailed")));
                } finally {
                  setReopenSaving(false);
                }
              }}
              disabled={reopenSaving}
              className="shrink-0 border border-amber-500 text-amber-600 px-3 py-1.5 rounded text-sm font-medium hover:bg-amber-50 disabled:opacity-50"
            >
              {reopenSaving ? t("production.reopening") : t("production.reopenButton")}
            </button>
          </div>
        )}
      </div>

      {/* ── Step 2: Finalize GRN ────────────────────────────── */}
      {(isClosed || isFinalized) && (
        <div className="border-t pt-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-700">{t("production.finalizeTitle")}</h3>
            {isFinalized && (
              <span className="text-xs font-medium text-blue-700 bg-blue-100 px-2 py-0.5 rounded">
                {t("production.finalizedLabel")}
              </span>
            )}
          </div>

          {isClosed && !isFinalized && (
            <div className="mt-3">
              <p className="text-sm text-gray-600 mb-3">
                {t("production.finalizeHelp")}
                {Math.abs(diff) > 0.5 && (
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

          {isFinalized && (
            <p className="mt-2 text-sm text-gray-500">{t("production.finalizedHelp")}</p>
          )}
        </div>
      )}
    </div>
  );
}
