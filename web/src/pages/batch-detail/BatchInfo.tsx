import React from "react";
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
  return (
    <>
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
    </>
  );
});
