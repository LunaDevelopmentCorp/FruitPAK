import React, { useMemo, useState } from "react";
import { getErrorMessage } from "../../api/client";
import { closeProductionRun, finalizeGRN, getBatch } from "../../api/batches";
import { showToast as globalToast } from "../../store/toastStore";
import { BatchSectionProps } from "./types";

export default function ProductionActions({ batch, batchId, onRefresh }: BatchSectionProps) {
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
    const diff = Math.abs(incomingNet - (lotWeight + lotWaste + batchWaste));
    return { balanced: diff < 0.5, diff };
  }, [batch.net_weight_kg, batch.waste_kg, lots]);

  if (lots.length === 0) return null;

  return (
    <>
      {/* Close Production Run */}
      {batch.status !== "complete" && (
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
                await closeProductionRun(batchId);
                await onRefresh();
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
      )}

      {/* Finalize GRN */}
      {batch.status === "complete" && (
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
                await finalizeGRN(batchId);
                await onRefresh();
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
      )}
    </>
  );
}
