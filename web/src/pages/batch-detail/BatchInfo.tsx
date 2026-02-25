import React from "react";
import { useTranslation } from "react-i18next";
import { BatchDetail as BatchDetailType } from "../../api/batches";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <>
      <span className="text-gray-500">{label}</span>
      <span className="text-gray-800">{value}</span>
    </>
  );
}

export default React.memo(function BatchInfo({ batch }: { batch: BatchDetailType }) {
  const { t } = useTranslation("batches");

  return (
    <>
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
          <Row label={t("common:table.grower")} value={batch.grower_name || batch.grower_id} />
          <Row label={t("info.packhouse")} value={batch.packhouse_name || batch.packhouse_id} />
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
