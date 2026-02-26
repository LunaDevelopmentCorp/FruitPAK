import React, { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams, Link, useNavigate } from "react-router-dom";
import {
  getBatch,
  deleteBatch,
  BatchDetail as BatchDetailType,
} from "../api/batches";
import { getBoxSizes, getBinTypes, BoxSizeConfig, BinTypeConfig } from "../api/pallets";
import { getFruitTypeConfigs, FruitTypeConfig } from "../api/config";
import BatchQR from "../components/BatchQR";
import PageHeader from "../components/PageHeader";
import StatusBadge from "../components/StatusBadge";
import { showToast as globalToast } from "../store/toastStore";

// Sub-components (each manages its own local state)
import BatchInfo from "./batch-detail/BatchInfo";
import LotsSection from "./batch-detail/LotsSection";
import PalletizeSection from "./batch-detail/PalletizeSection";
import MassBalance from "./batch-detail/MassBalance";
import WasteSection from "./batch-detail/WasteSection";
import ProductionActions from "./batch-detail/ProductionActions";
import BatchHistory from "./batch-detail/BatchHistory";

export default function BatchDetail() {
  const { t } = useTranslation("batches");
  const { batchId } = useParams<{ batchId: string }>();
  const [batch, setBatch] = useState<BatchDetailType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Shared config data (loaded once)
  const [boxSizes, setBoxSizes] = useState<BoxSizeConfig[]>([]);
  const [binTypes, setBinTypes] = useState<BinTypeConfig[]>([]);
  const [fruitConfigs, setFruitConfigs] = useState<FruitTypeConfig[]>([]);

  useEffect(() => {
    if (!batchId) return;
    getBatch(batchId)
      .then(setBatch)
      .catch(() => setError("Failed to load batch"))
      .finally(() => setLoading(false));
    getBoxSizes().then(setBoxSizes).catch(() => {});
    getBinTypes().then(setBinTypes).catch(() => {});
    getFruitTypeConfigs().then(setFruitConfigs).catch(() => {});
  }, [batchId]);

  // Stable refresh callback shared with sub-components
  const handleRefresh = useCallback(async () => {
    if (!batchId) return;
    const refreshed = await getBatch(batchId);
    setBatch(refreshed);
  }, [batchId]);

  if (loading) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-8">
        <p className="text-gray-400 text-sm">{t("detail.loading")}</p>
      </div>
    );
  }

  if (!batch) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-8">
        <p className="text-red-600 text-sm">{t("detail.notFound")}</p>
        <Link to="/batches" className="text-green-600 text-sm hover:underline mt-2 inline-block">
          {t("detail.backToBatches")}
        </Link>
      </div>
    );
  }

  const configs = { boxSizes, binTypes, fruitConfigs };

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      <PageHeader
        title={batch.batch_code}
        subtitle={t("detail.intake", { date: batch.intake_date ? new Date(batch.intake_date).toLocaleString() : "—" })}
        backTo="/batches"
        backLabel={t("detail.backToBatches")}
        action={
          <div className="flex items-center gap-3">
            <StatusBadge status={batch.status} className="text-sm px-3 py-1" />
            <button
              onClick={() => setConfirmDelete(true)}
              className="border border-red-300 text-red-600 px-4 py-2 rounded text-sm font-medium hover:bg-red-50"
            >
              {t("common:actions.delete")}
            </button>
          </div>
        }
      />

      {/* Delete confirmation */}
      {confirmDelete && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-800 font-medium mb-2">
            {t("detail.deleteConfirm", { code: batch.batch_code })}
          </p>
          <p className="text-xs text-red-600 mb-3">
            {t("detail.deleteWarning")}
          </p>
          <div className="flex gap-2">
            <button
              onClick={async () => {
                setDeleting(true);
                try {
                  await deleteBatch(batchId!);
                  globalToast("success", `Batch ${batch.batch_code} deleted.`);
                  navigate("/batches");
                } catch {
                  globalToast("error", "Failed to delete batch.");
                  setDeleting(false);
                  setConfirmDelete(false);
                }
              }}
              disabled={deleting}
              className="bg-red-600 text-white px-4 py-2 rounded text-sm font-medium hover:bg-red-700 disabled:opacity-50"
            >
              {deleting ? t("common:actions.deleting") : t("detail.yesDelete")}
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              className="border text-gray-600 px-4 py-2 rounded text-sm font-medium hover:bg-gray-50"
            >
              {t("common:actions.cancel")}
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="mb-4 p-3 bg-red-50 text-red-700 rounded text-sm">{error}</div>
      )}

      <div className="space-y-6">
        <BatchInfo batch={batch} onRefresh={handleRefresh} />

        <LotsSection
          batch={batch}
          batchId={batchId!}
          onRefresh={handleRefresh}
          configs={configs}
        />

        <PalletizeSection
          batch={batch}
          batchId={batchId!}
          onRefresh={handleRefresh}
          boxSizes={boxSizes}
        />

        <MassBalance batch={batch} />

        <WasteSection
          batch={batch}
          batchId={batchId!}
          onRefresh={handleRefresh}
        />

        <ProductionActions
          batch={batch}
          batchId={batchId!}
          onRefresh={handleRefresh}
        />

        {/* QR Code */}
        <div className="bg-white rounded-lg border p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">{t("detail.qrCode")}</h3>
          <BatchQR batch={batch} />
        </div>

        <BatchHistory batch={batch} />

        {/* Metadata */}
        <div className="text-xs text-gray-400 flex gap-4">
          <span>Created: {new Date(batch.created_at).toLocaleString()}</span>
          <span>Updated: {new Date(batch.updated_at).toLocaleString()}</span>
          <span>Received by: {batch.received_by_name || batch.received_by || "—"}</span>
        </div>
      </div>
    </div>
  );
}
