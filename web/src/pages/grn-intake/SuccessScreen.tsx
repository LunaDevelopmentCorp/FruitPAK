import React from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import BatchQR from "../../components/BatchQR";
import { Row } from "./helpers";
import { SuccessScreenProps } from "./types";

export default function SuccessScreen({ result, onNewIntake }: SuccessScreenProps) {
  const { t } = useTranslation("grn");

  return (
    <div className="bg-green-50 border border-green-200 rounded-lg p-6 max-w-2xl">
      <div className="flex items-center gap-2 mb-4">
        <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <h2 className="text-xl font-bold text-green-800">{t("success.title")}</h2>
      </div>

      <div className="space-y-2 text-sm">
        <Row label={t("success.batchCode")} value={result.batch.batch_code} mono />
        <Row label={t("success.fruit")} value={result.batch.fruit_type} />
        <Row label={t("success.variety")} value={result.batch.variety || "\u2014"} />
        {result.batch.gross_weight_kg != null ? (
          <>
            <Row
              label={t("success.grossWeight")}
              value={`${result.batch.gross_weight_kg.toLocaleString()} kg`}
            />
            <Row
              label={t("success.tareWeight")}
              value={`${result.batch.tare_weight_kg.toLocaleString()} kg`}
            />
            <Row
              label={t("success.netWeight")}
              value={`${result.batch.net_weight_kg?.toLocaleString() ?? "\u2014"} kg`}
              bold
            />
          </>
        ) : (
          <Row label={t("success.netWeight")} value={t("success.weightPending")} />
        )}
        <Row label={t("success.status")} value={result.batch.status} />
        <Row
          label={t("success.advancePayment")}
          value={result.advance_payment_linked ? t("success.linked", { ref: result.advance_payment_ref }) : t("success.none")}
        />
      </div>

      <div className="mt-6 pt-4 border-t border-green-200">
        <BatchQR batch={result.batch} size={140} />
      </div>

      <div className="mt-6 flex gap-3">
        <button
          onClick={onNewIntake}
          className="bg-green-600 text-white px-4 py-2 rounded text-sm font-medium hover:bg-green-700"
        >
          {t("success.newIntake")}
        </button>
        <Link
          to={`/batches/${result.batch.id}`}
          className="border border-gray-300 text-gray-700 px-4 py-2 rounded text-sm font-medium hover:bg-gray-50"
        >
          {t("success.viewEditBatch")}
        </Link>
      </div>
    </div>
  );
}
