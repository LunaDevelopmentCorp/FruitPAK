import React, { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { BatchDetail as BatchDetailType } from "../../api/batches";

export default React.memo(function MassBalance({ batch }: { batch: BatchDetailType }) {
  const { t } = useTranslation("batches");
  const lots = batch.lots || [];
  if (lots.length === 0) return null;

  const { incomingNet, totalLotWeight, waste, diff, balanced } = useMemo(() => {
    const incomingNet = batch.net_weight_kg ?? 0;
    const totalLotWeight = lots.reduce((sum, l) => sum + (l.weight_kg ?? 0), 0);
    const totalLotWaste = lots.reduce((sum, l) => sum + (l.waste_kg ?? 0), 0);
    const waste = (batch.waste_kg ?? 0) + totalLotWaste;
    const accounted = totalLotWeight + waste;
    const diff = incomingNet - accounted;
    const balanced = Math.abs(diff) < 0.5;
    return { incomingNet, totalLotWeight, waste, diff, balanced };
  }, [batch.net_weight_kg, batch.waste_kg, lots]);

  return (
    <div className={`rounded-lg border p-4 ${balanced ? "bg-green-50 border-green-200" : "bg-yellow-50 border-yellow-200"}`}>
      <h3 className="text-sm font-semibold text-gray-700 mb-3">{t("massBalance.title")}</h3>
      <div className="grid grid-cols-4 gap-4 text-sm">
        <div>
          <p className="text-gray-500">{t("massBalance.incomingNet")}</p>
          <p className="font-medium">{incomingNet.toLocaleString()} kg</p>
        </div>
        <div>
          <p className="text-gray-500">{t("massBalance.lotWeight")}</p>
          <p className="font-medium">{totalLotWeight.toLocaleString()} kg</p>
        </div>
        <div>
          <p className="text-gray-500">{t("massBalance.waste")}</p>
          <p className="font-medium">{waste.toLocaleString()} kg</p>
        </div>
        <div>
          <p className="text-gray-500">{t("massBalance.difference")}</p>
          <p className={`font-semibold ${balanced ? "text-green-700" : "text-yellow-700"}`}>
            {diff > 0 ? "+" : ""}{diff.toLocaleString(undefined, { maximumFractionDigits: 1 })} kg
            {balanced && " \u2713"}
          </p>
        </div>
      </div>
    </div>
  );
});
