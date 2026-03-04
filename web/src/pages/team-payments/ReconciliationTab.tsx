import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  getTeamSummary,
  getTeamReconciliation,
  TeamSummary,
  TeamReconciliationDetail,
  TeamReconciliationBatch,
} from "../../api/payments";
import { updateBatch } from "../../api/batches";
import { getErrorMessage } from "../../api/client";
import { getCurrencySymbol } from "../../constants/currencies";
import { useTableSort } from "../../hooks/useTableSort";
import { showToast } from "../../store/toastStore";
import PaymentBadge from "./PaymentBadge";
import type { ReconciliationTabProps } from "./types";

export default function ReconciliationTab({
  sortedTeams,
  baseCurrency,
}: ReconciliationTabProps) {
  const { t } = useTranslation("payments");

  // ── Team selector state ─────────────────────────────────
  const [reconTeamId, setReconTeamId] = useState("all");
  const [reconDetail, setReconDetail] =
    useState<TeamReconciliationDetail | null>(null);
  const [reconLoading, setReconLoading] = useState(false);
  const [teamSummaries, setTeamSummaries] = useState<TeamSummary[]>([]);
  const [summaryLoading, setSummaryLoading] = useState(false);

  // ── Filters + sorting ──────────────────────────────────
  const [reconSearch, setReconSearch] = useState("");
  const [reconDateFrom, setReconDateFrom] = useState("");
  const [reconDateTo, setReconDateTo] = useState("");
  const { sortCol, sortDir, toggleSort, sortIndicator, resetSort } =
    useTableSort();

  // ── Inline rate editing ────────────────────────────────
  const [editingRateBatchId, setEditingRateBatchId] = useState<string | null>(
    null,
  );
  const [editRateValue, setEditRateValue] = useState("");
  const [savingRate, setSavingRate] = useState(false);

  // ── Load reconciliation data ───────────────────────────
  useEffect(() => {
    setEditingRateBatchId(null);
    if (reconTeamId === "all") {
      setReconDetail(null);
      setSummaryLoading(true);
      getTeamSummary()
        .then(setTeamSummaries)
        .catch(() => setTeamSummaries([]))
        .finally(() => setSummaryLoading(false));
      return;
    }
    if (!reconTeamId) {
      setReconDetail(null);
      return;
    }
    setReconLoading(true);
    getTeamReconciliation(reconTeamId)
      .then(setReconDetail)
      .catch(() => setReconDetail(null))
      .finally(() => setReconLoading(false));
  }, [reconTeamId]);

  // ── Filtered summaries (all-teams view) ────────────────
  const filteredSummaries = useMemo(() => {
    let rows = [...teamSummaries];
    if (reconSearch) {
      const q = reconSearch.toLowerCase();
      rows = rows.filter(
        (s) =>
          s.team_name.toLowerCase().includes(q) ||
          (s.team_leader || "").toLowerCase().includes(q) ||
          s.batch_codes.some((c) => c.toLowerCase().includes(q)),
      );
    }
    if (sortCol) {
      rows.sort((a, b) => {
        let va: number | string = 0,
          vb: number | string = 0;
        switch (sortCol) {
          case "name":
            va = a.team_name;
            vb = b.team_name;
            break;
          case "leader":
            va = a.team_leader || "";
            vb = b.team_leader || "";
            break;
          case "batches":
            va = a.total_batches;
            vb = b.total_batches;
            break;
          case "class1Kg":
            va = a.class1_kg;
            vb = b.class1_kg;
            break;
          case "rate":
            va = a.rate_per_kg || 0;
            vb = b.rate_per_kg || 0;
            break;
          case "owed":
            va = a.amount_owed;
            vb = b.amount_owed;
            break;
          case "paid":
            va = a.total_paid;
            vb = b.total_paid;
            break;
          case "balance":
            va = a.balance;
            vb = b.balance;
            break;
        }
        const cmp =
          typeof va === "string"
            ? va.localeCompare(vb as string)
            : (va as number) - (vb as number);
        return sortDir === "asc" ? cmp : -cmp;
      });
    }
    return rows;
  }, [teamSummaries, reconSearch, sortCol, sortDir]);

  // ── Filtered batches (single-team view) ────────────────
  const filteredReconBatches = useMemo(() => {
    if (!reconDetail) return [];
    let rows = [...reconDetail.batches];
    if (reconSearch) {
      const q = reconSearch.toLowerCase();
      rows = rows.filter((b) => b.batch_code.toLowerCase().includes(q));
    }
    if (reconDateFrom) {
      rows = rows.filter(
        (b) => b.intake_date && b.intake_date >= reconDateFrom,
      );
    }
    if (reconDateTo) {
      rows = rows.filter((b) => b.intake_date && b.intake_date <= reconDateTo);
    }
    if (sortCol) {
      rows.sort((a, b) => {
        let va: number | string = 0,
          vb: number | string = 0;
        switch (sortCol) {
          case "batchCode":
            va = a.batch_code;
            vb = b.batch_code;
            break;
          case "intakeDate":
            va = a.intake_date || "";
            vb = b.intake_date || "";
            break;
          case "intakeKg":
            va = a.intake_kg;
            vb = b.intake_kg;
            break;
          case "class1Kg":
            va = a.class1_kg;
            vb = b.class1_kg;
            break;
          case "rate":
            va = a.effective_rate || 0;
            vb = b.effective_rate || 0;
            break;
          case "owed":
            va = a.owed;
            vb = b.owed;
            break;
        }
        const cmp =
          typeof va === "string"
            ? va.localeCompare(vb as string)
            : (va as number) - (vb as number);
        return sortDir === "asc" ? cmp : -cmp;
      });
    }
    return rows;
  }, [reconDetail, reconSearch, reconDateFrom, reconDateTo, sortCol, sortDir]);

  // ── Filtered payments (single-team view) ───────────────
  const filteredReconPayments = useMemo(() => {
    if (!reconDetail) return [];
    let rows = [...reconDetail.payments];
    if (reconDateFrom) {
      rows = rows.filter(
        (p) => p.payment_date && p.payment_date >= reconDateFrom,
      );
    }
    if (reconDateTo) {
      rows = rows.filter(
        (p) => p.payment_date && p.payment_date <= reconDateTo,
      );
    }
    if (sortCol) {
      rows.sort((a, b) => {
        let va: number | string = 0,
          vb: number | string = 0;
        switch (sortCol) {
          case "paymentDate":
            va = a.payment_date || "";
            vb = b.payment_date || "";
            break;
          case "paymentRef":
            va = a.payment_ref;
            vb = b.payment_ref;
            break;
          case "paymentType":
            va = a.payment_type;
            vb = b.payment_type;
            break;
          case "paymentAmount":
            va = a.amount;
            vb = b.amount;
            break;
        }
        const cmp =
          typeof va === "string"
            ? va.localeCompare(vb as string)
            : (va as number) - (vb as number);
        return sortDir === "asc" ? cmp : -cmp;
      });
    }
    return rows;
  }, [reconDetail, reconDateFrom, reconDateTo, sortCol, sortDir]);

  // ── Inline rate editing helpers ────────────────────────
  const startEditRate = (batch: TeamReconciliationBatch) => {
    setEditingRateBatchId(batch.batch_id);
    setEditRateValue(
      batch.harvest_rate_per_kg?.toString() ||
        batch.effective_rate?.toString() ||
        "",
    );
  };

  const cancelEditRate = () => {
    setEditingRateBatchId(null);
    setEditRateValue("");
  };

  const saveRate = async () => {
    if (!editingRateBatchId || !editRateValue || Number(editRateValue) <= 0)
      return;
    setSavingRate(true);
    try {
      await updateBatch(editingRateBatchId, {
        harvest_rate_per_kg: Number(editRateValue),
      });
      showToast("success", t("team.reconciliation.rateUpdated"));
      cancelEditRate();
      // Refresh the reconciliation data
      if (reconTeamId && reconTeamId !== "all") {
        const detail = await getTeamReconciliation(reconTeamId);
        setReconDetail(detail);
      }
    } catch (err) {
      showToast(
        "error",
        getErrorMessage(err, t("team.reconciliation.rateUpdateFailed")),
      );
    } finally {
      setSavingRate(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Team selector + filters */}
      <div className="bg-white rounded-lg border p-4 no-print space-y-3">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[200px] max-w-xs">
            <label className="block text-xs text-gray-500 mb-1">
              {t("team.reconciliation.selectTeam")}
            </label>
            <select
              value={reconTeamId}
              onChange={(e) => {
                setReconTeamId(e.target.value);
                setReconSearch("");
                setReconDateFrom("");
                setReconDateTo("");
                resetSort();
              }}
              className="w-full border rounded px-3 py-2 text-sm"
            >
              <option value="all">
                {t("team.reconciliation.allTeams")}
              </option>
              {sortedTeams.map((tm) => (
                <option key={tm.id} value={tm.id}>
                  {tm.name}
                  {tm.team_leader ? ` (${tm.team_leader})` : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="flex-1 min-w-[160px] max-w-xs">
            <label className="block text-xs text-gray-500 mb-1">
              {reconTeamId === "all"
                ? t("team.reconciliation.filterName")
                : t("team.reconciliation.filterBatch")}
            </label>
            <input
              type="text"
              value={reconSearch}
              onChange={(e) => setReconSearch(e.target.value)}
              placeholder={
                reconTeamId === "all"
                  ? t("team.reconciliation.filterNamePlaceholder")
                  : t("team.reconciliation.filterBatchPlaceholder")
              }
              className="w-full border rounded px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">
              {t("team.reconciliation.dateFrom")}
            </label>
            <input
              type="date"
              value={reconDateFrom}
              onChange={(e) => setReconDateFrom(e.target.value)}
              className="border rounded px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">
              {t("team.reconciliation.dateTo")}
            </label>
            <input
              type="date"
              value={reconDateTo}
              onChange={(e) => setReconDateTo(e.target.value)}
              className="border rounded px-3 py-2 text-sm"
            />
          </div>
          {(reconSearch || reconDateFrom || reconDateTo) && (
            <button
              onClick={() => {
                setReconSearch("");
                setReconDateFrom("");
                setReconDateTo("");
              }}
              className="text-xs text-gray-500 hover:text-gray-700 underline pb-2.5"
            >
              {t("team.reconciliation.clearFilters")}
            </button>
          )}
        </div>
      </div>

      {(reconLoading || summaryLoading) && (
        <p className="text-sm text-gray-400 text-center py-4">
          {t("common:actions.loading")}
        </p>
      )}

      {/* ── All Teams summary view ─────────────────────────── */}
      {reconTeamId === "all" &&
        !summaryLoading &&
        teamSummaries.length > 0 && (
          <div className="space-y-4 print-area">
            <div className="hidden print:block mb-4">
              <h2 className="text-lg font-bold">
                {t("team.summary.title")}
              </h2>
              <p className="text-xs text-gray-500">
                {new Date().toLocaleDateString()}
              </p>
            </div>
            <div className="bg-white rounded-lg border p-4 overflow-x-auto">
              {filteredSummaries.length === 0 ? (
                <p className="text-sm text-gray-400">
                  {t("team.reconciliation.noResults")}
                </p>
              ) : (
                <table className="w-full text-sm">
                  <thead className="text-gray-500 text-xs">
                    <tr>
                      <th
                        onClick={() => toggleSort("name")}
                        className="text-left px-2 py-1.5 font-medium cursor-pointer hover:text-gray-700 select-none"
                      >
                        {t("common:table.name")}
                        {sortIndicator("name")}
                      </th>
                      <th
                        onClick={() => toggleSort("leader")}
                        className="text-left px-2 py-1.5 font-medium cursor-pointer hover:text-gray-700 select-none"
                      >
                        {t("team.management.teamLeader")}
                        {sortIndicator("leader")}
                      </th>
                      <th
                        onClick={() => toggleSort("batches")}
                        className="text-right px-2 py-1.5 font-medium cursor-pointer hover:text-gray-700 select-none"
                      >
                        {t("team.summary.headers.batches")}
                        {sortIndicator("batches")}
                      </th>
                      <th
                        onClick={() => toggleSort("class1Kg")}
                        className="text-right px-2 py-1.5 font-medium cursor-pointer hover:text-gray-700 select-none"
                      >
                        {t("team.summary.headers.class1Kg")}
                        {sortIndicator("class1Kg")}
                      </th>
                      <th
                        onClick={() => toggleSort("rate")}
                        className="text-right px-2 py-1.5 font-medium cursor-pointer hover:text-gray-700 select-none"
                      >
                        {t("team.summary.headers.ratePerKg")}
                        {sortIndicator("rate")}
                      </th>
                      <th
                        onClick={() => toggleSort("owed")}
                        className="text-right px-2 py-1.5 font-medium cursor-pointer hover:text-gray-700 select-none"
                      >
                        {t("team.summary.headers.owed")}
                        {sortIndicator("owed")}
                      </th>
                      <th
                        onClick={() => toggleSort("paid")}
                        className="text-right px-2 py-1.5 font-medium cursor-pointer hover:text-gray-700 select-none"
                      >
                        {t("team.summary.headers.totalPaid")}
                        {sortIndicator("paid")}
                      </th>
                      <th
                        onClick={() => toggleSort("balance")}
                        className="text-right px-2 py-1.5 font-medium cursor-pointer hover:text-gray-700 select-none"
                      >
                        {t("team.summary.headers.balance")}
                        {sortIndicator("balance")}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {filteredSummaries.map((s) => (
                      <tr
                        key={s.harvest_team_id}
                        onClick={() => setReconTeamId(s.harvest_team_id)}
                        className="cursor-pointer hover:bg-green-50/50 even:bg-gray-50/50"
                      >
                        <td className="px-2 py-1.5 font-medium">
                          {s.team_name}
                        </td>
                        <td className="px-2 py-1.5 text-gray-500">
                          {s.team_leader || "\u2014"}
                        </td>
                        <td className="px-2 py-1.5 text-right">
                          {s.total_batches}
                        </td>
                        <td className="px-2 py-1.5 text-right">
                          {s.class1_kg.toLocaleString()}
                        </td>
                        <td className="px-2 py-1.5 text-right text-gray-500">
                          {s.rate_per_kg != null
                            ? `${getCurrencySymbol(baseCurrency)} ${s.rate_per_kg}`
                            : t("team.summary.noRate")}
                        </td>
                        <td className="px-2 py-1.5 text-right font-medium">
                          {getCurrencySymbol(baseCurrency)}{" "}
                          {s.amount_owed.toLocaleString()}
                        </td>
                        <td className="px-2 py-1.5 text-right">
                          {getCurrencySymbol(baseCurrency)}{" "}
                          {s.total_paid.toLocaleString()}
                        </td>
                        <td
                          className={`px-2 py-1.5 text-right font-bold ${
                            s.balance > 0
                              ? "text-red-600"
                              : s.balance < 0
                                ? "text-green-700"
                                : "text-gray-500"
                          }`}
                        >
                          {getCurrencySymbol(baseCurrency)}{" "}
                          {s.balance.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t-2 font-semibold">
                    <tr>
                      <td className="px-2 py-2" colSpan={2}>
                        {t("team.summary.totals")}
                      </td>
                      <td className="px-2 py-2 text-right">
                        {filteredSummaries.reduce(
                          (s, r) => s + r.total_batches,
                          0,
                        )}
                      </td>
                      <td className="px-2 py-2 text-right">
                        {filteredSummaries
                          .reduce((s, r) => s + r.class1_kg, 0)
                          .toLocaleString()}
                      </td>
                      <td className="px-2 py-2" />
                      <td className="px-2 py-2 text-right">
                        {getCurrencySymbol(baseCurrency)}{" "}
                        {filteredSummaries
                          .reduce((s, r) => s + r.amount_owed, 0)
                          .toLocaleString()}
                      </td>
                      <td className="px-2 py-2 text-right">
                        {getCurrencySymbol(baseCurrency)}{" "}
                        {filteredSummaries
                          .reduce((s, r) => s + r.total_paid, 0)
                          .toLocaleString()}
                      </td>
                      <td
                        className={`px-2 py-2 text-right font-bold ${(() => {
                          const b = filteredSummaries.reduce(
                            (s, r) => s + r.balance,
                            0,
                          );
                          return b > 0
                            ? "text-red-600"
                            : b < 0
                              ? "text-green-700"
                              : "text-gray-500";
                        })()}`}
                      >
                        {getCurrencySymbol(baseCurrency)}{" "}
                        {filteredSummaries
                          .reduce((s, r) => s + r.balance, 0)
                          .toLocaleString()}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              )}
            </div>

            {/* Print button */}
            <div className="flex justify-end no-print">
              <button
                onClick={() => window.print()}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 border rounded hover:bg-gray-50"
              >
                <svg
                  className="w-4 h-4"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"
                  />
                </svg>
                {t("team.reconciliation.print")}
              </button>
            </div>
          </div>
        )}

      {reconTeamId === "all" &&
        !summaryLoading &&
        teamSummaries.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-4">
            {t("team.summary.empty")}
          </p>
        )}

      {/* ── Single team detail view ────────────────────────── */}
      {reconDetail && !reconLoading && reconTeamId !== "all" && (
        <div className="space-y-4 print-area">
          {/* Print header (visible only in print) */}
          <div className="hidden print:block mb-4">
            <h2 className="text-lg font-bold">
              {t("team.reconciliation.statementTitle")}
            </h2>
            <p className="text-sm text-gray-600">
              {reconDetail.team_name}
              {reconDetail.team_leader
                ? ` — ${reconDetail.team_leader}`
                : ""}
            </p>
            <p className="text-xs text-gray-500">
              {new Date().toLocaleDateString()}
            </p>
          </div>

          {/* Batch breakdown */}
          <div className="bg-white rounded-lg border p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">
              {t("team.reconciliation.deliveries")}
            </h3>
            {filteredReconBatches.length === 0 ? (
              <p className="text-sm text-gray-400">
                {reconDetail.batches.length === 0
                  ? t("team.reconciliation.noDeliveries")
                  : t("team.reconciliation.noResults")}
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-gray-500 text-xs">
                  <tr>
                    <th
                      onClick={() => toggleSort("batchCode")}
                      className="text-left px-2 py-1.5 font-medium cursor-pointer hover:text-gray-700 select-none"
                    >
                      {t("team.reconciliation.headers.batchCode")}
                      {sortIndicator("batchCode")}
                    </th>
                    <th
                      onClick={() => toggleSort("intakeDate")}
                      className="text-left px-2 py-1.5 font-medium cursor-pointer hover:text-gray-700 select-none"
                    >
                      {t("team.reconciliation.headers.intakeDate")}
                      {sortIndicator("intakeDate")}
                    </th>
                    <th
                      onClick={() => toggleSort("intakeKg")}
                      className="text-right px-2 py-1.5 font-medium cursor-pointer hover:text-gray-700 select-none"
                    >
                      {t("team.reconciliation.headers.intakeKg")}
                      {sortIndicator("intakeKg")}
                    </th>
                    <th
                      onClick={() => toggleSort("class1Kg")}
                      className="text-right px-2 py-1.5 font-medium cursor-pointer hover:text-gray-700 select-none"
                    >
                      {t("team.reconciliation.headers.class1Kg")}
                      {sortIndicator("class1Kg")}
                    </th>
                    <th
                      onClick={() => toggleSort("rate")}
                      className="text-right px-2 py-1.5 font-medium cursor-pointer hover:text-gray-700 select-none"
                    >
                      {t("team.reconciliation.headers.ratePerKg")}
                      {sortIndicator("rate")}
                    </th>
                    <th
                      onClick={() => toggleSort("owed")}
                      className="text-right px-2 py-1.5 font-medium cursor-pointer hover:text-gray-700 select-none"
                    >
                      {t("team.reconciliation.headers.owed")}
                      {sortIndicator("owed")}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredReconBatches.map((b) => (
                    <tr key={b.batch_id} className="even:bg-gray-50/50">
                      <td className="px-2 py-1.5 font-mono text-xs text-green-700">
                        {b.batch_code}
                      </td>
                      <td className="px-2 py-1.5 text-gray-500">
                        {b.intake_date
                          ? new Date(b.intake_date).toLocaleDateString()
                          : "\u2014"}
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        {b.intake_kg.toLocaleString()}
                      </td>
                      <td className="px-2 py-1.5 text-right font-medium">
                        {b.class1_kg.toLocaleString()}
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        {editingRateBatchId === b.batch_id ? (
                          <span className="inline-flex items-center gap-1">
                            <input
                              type="number"
                              step="0.01"
                              value={editRateValue}
                              onChange={(e) =>
                                setEditRateValue(e.target.value)
                              }
                              className="w-20 border rounded px-1.5 py-0.5 text-sm text-right"
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === "Enter") saveRate();
                                if (e.key === "Escape") cancelEditRate();
                              }}
                            />
                            <button
                              onClick={saveRate}
                              disabled={
                                savingRate ||
                                !editRateValue ||
                                Number(editRateValue) <= 0
                              }
                              className="text-green-600 hover:text-green-700 disabled:opacity-50 text-xs font-medium"
                            >
                              {savingRate ? "..." : "\u2713"}
                            </button>
                            <button
                              onClick={cancelEditRate}
                              className="text-gray-400 hover:text-gray-600 text-xs"
                            >
                              {"\u2717"}
                            </button>
                          </span>
                        ) : b.effective_rate != null ? (
                          <span
                            onClick={() => startEditRate(b)}
                            className="cursor-pointer hover:text-green-700 text-gray-500"
                            title={t(
                              "team.reconciliation.clickToEditRate",
                            )}
                          >
                            {getCurrencySymbol(reconDetail.rate_currency)}{" "}
                            {b.effective_rate}
                          </span>
                        ) : (
                          <button
                            onClick={() => startEditRate(b)}
                            className="text-amber-600 hover:text-amber-700 text-xs font-medium underline"
                          >
                            {t("team.reconciliation.setRate")}
                          </button>
                        )}
                      </td>
                      <td className="px-2 py-1.5 text-right font-medium">
                        {b.owed > 0
                          ? `${getCurrencySymbol(reconDetail.rate_currency)} ${b.owed.toLocaleString()}`
                          : "\u2014"}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t-2 font-semibold">
                  <tr>
                    <td className="px-2 py-2" colSpan={3}>
                      {t("team.reconciliation.summary.totalOwed")}
                    </td>
                    <td className="px-2 py-2 text-right">
                      {filteredReconBatches
                        .reduce((s, b) => s + b.class1_kg, 0)
                        .toLocaleString()}
                    </td>
                    <td className="px-2 py-2" />
                    <td className="px-2 py-2 text-right">
                      {getCurrencySymbol(reconDetail.rate_currency)}{" "}
                      {filteredReconBatches
                        .reduce((s, b) => s + b.owed, 0)
                        .toLocaleString()}
                    </td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>

          {/* Payment history */}
          <div className="bg-white rounded-lg border p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">
              {t("team.reconciliation.payments")}
            </h3>
            {filteredReconPayments.length === 0 ? (
              <p className="text-sm text-gray-400">
                {reconDetail.payments.length === 0
                  ? t("team.reconciliation.noPayments")
                  : t("team.reconciliation.noResults")}
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-gray-500 text-xs">
                  <tr>
                    <th
                      onClick={() => toggleSort("paymentDate")}
                      className="text-left px-2 py-1.5 font-medium cursor-pointer hover:text-gray-700 select-none"
                    >
                      {t("team.reconciliation.headers.paymentDate")}
                      {sortIndicator("paymentDate")}
                    </th>
                    <th
                      onClick={() => toggleSort("paymentRef")}
                      className="text-left px-2 py-1.5 font-medium cursor-pointer hover:text-gray-700 select-none"
                    >
                      {t("team.reconciliation.headers.paymentRef")}
                      {sortIndicator("paymentRef")}
                    </th>
                    <th
                      onClick={() => toggleSort("paymentType")}
                      className="text-left px-2 py-1.5 font-medium cursor-pointer hover:text-gray-700 select-none"
                    >
                      {t("team.reconciliation.headers.paymentType")}
                      {sortIndicator("paymentType")}
                    </th>
                    <th
                      onClick={() => toggleSort("paymentAmount")}
                      className="text-right px-2 py-1.5 font-medium cursor-pointer hover:text-gray-700 select-none"
                    >
                      {t("team.reconciliation.headers.paymentAmount")}
                      {sortIndicator("paymentAmount")}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredReconPayments.map((p) => (
                    <tr key={p.id} className="even:bg-gray-50/50">
                      <td className="px-2 py-1.5 text-gray-500">
                        {p.payment_date
                          ? new Date(
                              p.payment_date,
                            ).toLocaleDateString()
                          : "\u2014"}
                      </td>
                      <td className="px-2 py-1.5 font-mono text-xs text-green-700">
                        {p.payment_ref}
                      </td>
                      <td className="px-2 py-1.5">
                        <PaymentBadge type={p.payment_type} />
                      </td>
                      <td className="px-2 py-1.5 text-right font-medium">
                        {getCurrencySymbol(reconDetail.rate_currency)}{" "}
                        {p.amount.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t-2 font-semibold">
                  <tr>
                    <td className="px-2 py-2" colSpan={3}>
                      {t("team.reconciliation.summary.totalPaid")}
                    </td>
                    <td className="px-2 py-2 text-right">
                      {getCurrencySymbol(reconDetail.rate_currency)}{" "}
                      {filteredReconPayments
                        .reduce((s, p) => s + p.amount, 0)
                        .toLocaleString()}
                    </td>
                  </tr>
                </tfoot>
              </table>
            )}
          </div>

          {/* Balance summary */}
          <div className="bg-white rounded-lg border p-4">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <p className="text-xs text-gray-500">
                  {t("team.reconciliation.summary.totalOwed")}
                </p>
                <p className="text-lg font-bold text-gray-800">
                  {getCurrencySymbol(reconDetail.rate_currency)}{" "}
                  {reconDetail.total_owed.toLocaleString()}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500">
                  {t("team.reconciliation.summary.totalPaid")}
                </p>
                <p className="text-lg font-bold text-gray-800">
                  {getCurrencySymbol(reconDetail.rate_currency)}{" "}
                  {reconDetail.total_paid.toLocaleString()}
                </p>
              </div>
              <div>
                <p className="text-xs text-gray-500">
                  {t("team.reconciliation.summary.balance")}
                </p>
                <p
                  className={`text-lg font-bold ${
                    reconDetail.balance > 0
                      ? "text-red-600"
                      : reconDetail.balance < 0
                        ? "text-green-700"
                        : "text-gray-500"
                  }`}
                >
                  {getCurrencySymbol(reconDetail.rate_currency)}{" "}
                  {reconDetail.balance.toLocaleString()}
                </p>
              </div>
            </div>
          </div>

          {/* Print button */}
          <div className="flex justify-end no-print">
            <button
              onClick={() => window.print()}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 border rounded hover:bg-gray-50"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"
                />
              </svg>
              {t("team.reconciliation.print")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
