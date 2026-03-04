import React, { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  listBatches,
  listGrowers,
  listPackhouses,
  GRNResponse,
  BatchSummary,
  Grower,
  Packhouse,
} from "../api/batches";
import { getBinTypes, BinTypeConfig } from "../api/pallets";
import { getFruitTypeConfigs, FruitTypeConfig } from "../api/config";
import { listHarvestTeams, HarvestTeamItem } from "../api/payments";
import { usePackhouseStore } from "../store/packhouseStore";

// Sub-components (each manages its own local state)
import SuccessScreen from "./grn-intake/SuccessScreen";
import IntakeForm from "./grn-intake/IntakeForm";
import RecentBatchesTable from "./grn-intake/RecentBatchesTable";
import { Spinner, Toast } from "./grn-intake/helpers";
import type { GrnReferenceData } from "./grn-intake/types";

export default function GrnIntake() {
  const { t } = useTranslation("grn");
  const currentPackhouseId = usePackhouseStore((s) => s.currentPackhouseId);

  // ── Reference data (loaded once) ──────────────────────────
  const [growers, setGrowers] = useState<Grower[]>([]);
  const [packhouses, setPackhouses] = useState<Packhouse[]>([]);
  const [fruitConfigs, setFruitConfigs] = useState<FruitTypeConfig[]>([]);
  const [binTypes, setBinTypes] = useState<BinTypeConfig[]>([]);
  const [harvestTeams, setHarvestTeams] = useState<HarvestTeamItem[]>([]);
  const [loadingRef, setLoadingRef] = useState(true);

  // ── Top-level state ───────────────────────────────────────
  const [result, setResult] = useState<GRNResponse | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [grnDate, setGrnDate] = useState(new Date().toISOString().split("T")[0]);
  const [recentBatches, setRecentBatches] = useState<BatchSummary[]>([]);
  const [loadingRecent, setLoadingRecent] = useState(false);

  // ── Load reference data ───────────────────────────────────
  useEffect(() => {
    Promise.all([
      listGrowers(),
      listPackhouses(),
      getFruitTypeConfigs().catch(() => []),
      getBinTypes().catch(() => []),
      listHarvestTeams().catch(() => []),
    ])
      .then(([g, p, fc, bt, ht]) => {
        const sorted = [...g].sort((a, b) => {
          const ca = a.grower_code || "";
          const cb = b.grower_code || "";
          return ca.localeCompare(cb, undefined, { numeric: true });
        });
        setGrowers(sorted);
        setPackhouses(p);
        setFruitConfigs(fc);
        setBinTypes(bt);
        setHarvestTeams(
          [...ht].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }))
        );
      })
      .catch(() => {
        /* error handled by sub-components */
      })
      .finally(() => setLoadingRef(false));
  }, [currentPackhouseId]);

  // ── Fetch recent batches for selected date ────────────────
  const fetchRecentBatches = useCallback(async (dateStr: string) => {
    setLoadingRecent(true);
    try {
      const resp = await listBatches({ date_from: dateStr, date_to: dateStr, limit: "50" });
      setRecentBatches(resp.items);
    } catch {
      // Silent fail -- table is supplementary
    } finally {
      setLoadingRecent(false);
    }
  }, []);

  useEffect(() => {
    if (!loadingRef) fetchRecentBatches(grnDate);
  }, [loadingRef, fetchRecentBatches, grnDate]);

  // ── Auto-dismiss toast ────────────────────────────────────
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(timer);
  }, [toast]);

  // ── Callbacks for sub-components ──────────────────────────
  const handleSuccess = useCallback((res: GRNResponse) => {
    setResult(res);
    setToast(t("success.batchCreated", { code: res.batch.batch_code }));
  }, [t]);

  const handleNewIntake = useCallback(() => {
    setResult(null);
  }, []);

  const handleRefreshRecent = useCallback(() => {
    fetchRecentBatches(grnDate);
  }, [fetchRecentBatches, grnDate]);

  // ── Loading state ─────────────────────────────────────────
  if (loadingRef) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="flex items-center gap-2 text-gray-400 text-sm">
          <Spinner />
          {t("loadingRef")}
        </div>
      </div>
    );
  }

  // ── Shared reference data bundle ──────────────────────────
  const referenceData: GrnReferenceData = {
    growers,
    packhouses,
    fruitConfigs,
    binTypes,
    harvestTeams,
  };

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}

      {result ? (
        <SuccessScreen result={result} onNewIntake={handleNewIntake} />
      ) : (
        <IntakeForm
          referenceData={referenceData}
          onSuccess={handleSuccess}
          onRefreshRecent={handleRefreshRecent}
        />
      )}

      <RecentBatchesTable
        batches={recentBatches}
        loading={loadingRecent}
        grnDate={grnDate}
        onDateChange={setGrnDate}
        binTypes={binTypes}
        onRefresh={handleRefreshRecent}
      />
    </div>
  );
}
