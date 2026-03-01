import React, { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { listGrowers, listBatches, Grower, BatchSummary } from "../api/batches";
import { getErrorMessage } from "../api/client";
import { getCurrencySymbol } from "../constants/currencies";
import { useFinancialConfig } from "../hooks/useFinancialConfig";
import { useTableSort, sortRows, sortableThClass } from "../hooks/useTableSort";
import { showToast } from "../store/toastStore";
import PageHeader from "../components/PageHeader";
import StatusBadge from "../components/StatusBadge";
import {
  submitGrowerPayment,
  listGrowerPayments,
  updateGrowerPayment,
  getGrowerReconciliation,
  GrowerPaymentPayload,
  GrowerPaymentOut,
  GrowerReconciliationDetail,
  PaymentUpdatePayload,
} from "../api/payments";

const inputBase =
  "w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500";
const inputError =
  "w-full border border-red-400 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400";

interface FieldError {
  field: string;
  message: string;
}

export default function Payments() {
  const { t } = useTranslation("payments");
  const { baseCurrency } = useFinancialConfig();

  // ── Tab ───────────────────────────────────────────────────
  const [tab, setTab] = useState<"record" | "history" | "reconciliation">("record");

  // ── Data ──────────────────────────────────────────────────
  const [growers, setGrowers] = useState<Grower[]>([]);
  const [batches, setBatches] = useState<BatchSummary[]>([]);
  const [recentPayments, setRecentPayments] = useState<GrowerPaymentOut[]>([]);
  const [result, setResult] = useState<GrowerPaymentOut | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldError[]>([]);
  const [loadingRef, setLoadingRef] = useState(true);
  const [selectedBatchIds, setSelectedBatchIds] = useState<string[]>([]);

  // ── Reconciliation state ──────────────────────────────────
  const [reconGrowerId, setReconGrowerId] = useState("");
  const [reconDetail, setReconDetail] = useState<GrowerReconciliationDetail | null>(null);
  const [reconLoading, setReconLoading] = useState(false);

  // ── Payment history filters ───────────────────────────────
  const [historyGrowerId, setHistoryGrowerId] = useState("");

  // ── Sorting ──────────────────────────────────────────────
  const { sortCol, sortDir, toggleSort, sortIndicator } = useTableSort();

  // ── Payment editing state ─────────────────────────────────
  const [editingPayment, setEditingPayment] = useState<GrowerPaymentOut | null>(null);
  const [editForm, setEditForm] = useState({
    amount: "", payment_type: "", payment_date: "", notes: "", status: "",
  });
  const [editSaving, setEditSaving] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    reset,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<GrowerPaymentPayload>({
    defaultValues: {
      currency: baseCurrency,
      payment_type: "final",
      payment_date: new Date().toISOString().split("T")[0],
      batch_ids: [],
    },
  });

  // Sync default currency when config loads async
  useEffect(() => {
    setValue("currency", baseCurrency);
  }, [baseCurrency, setValue]);

  const selectedGrowerId = watch("grower_id");

  // Filter batches for selected grower
  const growerBatches = batches.filter(
    (b) => b.grower_id === selectedGrowerId && b.status !== "rejected"
  );

  // Compute selected batch kg total
  const selectedKg = growerBatches
    .filter((b) => selectedBatchIds.includes(b.id))
    .reduce((sum, b) => sum + ((b.net_weight_kg ?? b.gross_weight_kg) || 0), 0);

  // Load reference data
  useEffect(() => {
    Promise.all([listGrowers(), listBatches().then((r) => r.items), listGrowerPayments()])
      .then(([g, b, p]) => {
        setGrowers(g);
        setBatches(b);
        setRecentPayments(p);
      })
      .catch(() => {
        setError(t("grower.loadError"));
      })
      .finally(() => setLoadingRef(false));
  }, []);

  // Reset batch selection when grower changes
  useEffect(() => {
    setSelectedBatchIds([]);
  }, [selectedGrowerId]);

  // Load reconciliation detail when grower selected
  useEffect(() => {
    if (!reconGrowerId) {
      setReconDetail(null);
      return;
    }
    setReconLoading(true);
    getGrowerReconciliation(reconGrowerId)
      .then(setReconDetail)
      .catch(() => setReconDetail(null))
      .finally(() => setReconLoading(false));
  }, [reconGrowerId]);

  // Filtered & sorted payment history
  const filteredPayments = useMemo(() => {
    let rows = historyGrowerId
      ? recentPayments.filter((p) => p.grower_id === historyGrowerId)
      : [...recentPayments];
    return sortRows(rows, sortCol, sortDir, {
      ref: (p) => p.payment_ref,
      grower: (p) => p.grower_name || "",
      amount: (p) => p.gross_amount,
      type: (p) => p.payment_type,
      status: (p) => p.status,
      date: (p) => p.paid_date || "",
    });
  }, [recentPayments, historyGrowerId, sortCol, sortDir]);

  // ── Payment edit helpers ──────────────────────────────────
  const startEditPayment = (p: GrowerPaymentOut) => {
    setEditingPayment(p);
    setEditForm({
      amount: p.gross_amount.toString(),
      payment_type: p.payment_type,
      payment_date: p.paid_date || "",
      notes: p.notes || "",
      status: p.status,
    });
  };

  const cancelEditPayment = () => {
    setEditingPayment(null);
  };

  const savePaymentEdit = async () => {
    if (!editingPayment) return;
    setEditSaving(true);
    try {
      const payload: PaymentUpdatePayload = {};
      const newAmount = Number(editForm.amount);
      if (newAmount !== editingPayment.gross_amount) payload.amount = newAmount;
      if (editForm.payment_type !== editingPayment.payment_type) payload.payment_type = editForm.payment_type;
      if (editForm.payment_date !== (editingPayment.paid_date || "")) payload.payment_date = editForm.payment_date;
      if (editForm.notes !== (editingPayment.notes || "")) payload.notes = editForm.notes;
      if (editForm.status !== editingPayment.status) payload.status = editForm.status;

      await updateGrowerPayment(editingPayment.id, payload);
      showToast("success", t("grower.edit.updated"));
      cancelEditPayment();
      listGrowerPayments().then(setRecentPayments).catch(() => {});
    } catch (err) {
      showToast("error", getErrorMessage(err, t("grower.edit.updateFailed")));
    } finally {
      setEditSaving(false);
    }
  };

  const getFieldError = (field: string): string | undefined =>
    fieldErrors.find((e) => e.field === field)?.message;

  const toggleBatch = (batchId: string) => {
    setSelectedBatchIds((prev) =>
      prev.includes(batchId)
        ? prev.filter((id) => id !== batchId)
        : [...prev, batchId]
    );
  };

  const selectAllBatches = () => {
    setSelectedBatchIds(growerBatches.map((b) => b.id));
  };

  const onSubmit = async (data: GrowerPaymentPayload) => {
    setError(null);
    setFieldErrors([]);
    setResult(null);

    const amount = Number(data.amount);
    if (!amount || amount <= 0) {
      setError(t("grower.form.amountError"));
      return;
    }

    const payload: GrowerPaymentPayload = {
      ...data,
      amount,
      batch_ids: selectedBatchIds,
    };

    try {
      const res = await submitGrowerPayment(payload);
      setResult(res);
      showToast("success", t("grower.success.toast", { ref: res.payment_ref }));
      // Refresh recent payments
      listGrowerPayments().then(setRecentPayments).catch(() => {});
    } catch (err: unknown) {
      // 422 with field-level errors needs special handling
      const axiosErr = err as {
        response?: {
          data?: { detail?: string | Array<{ loc?: string[]; msg?: string }> };
          status?: number;
        };
      };
      const detail = axiosErr.response?.data?.detail;

      if (axiosErr.response?.status === 422 && Array.isArray(detail)) {
        const mapped: FieldError[] = detail
          .filter((e) => e.loc && e.msg)
          .map((e) => ({
            field: e.loc![e.loc!.length - 1],
            message: e.msg!,
          }));
        setFieldErrors(mapped);
        setError(t("grower.form.fixFields"));
      } else {
        setError(getErrorMessage(err, t("grower.form.submissionFailed")));
      }
    }
  };

  const handleNewPayment = () => {
    setResult(null);
    setError(null);
    setFieldErrors([]);
    setSelectedBatchIds([]);
    reset({
      currency: baseCurrency,
      payment_type: "final",
      payment_date: new Date().toISOString().split("T")[0],
      batch_ids: [],
    });
  };

  const tabCls = (active: boolean) =>
    `px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
      active
        ? "border-green-600 text-green-700"
        : "border-transparent text-gray-500 hover:text-gray-700"
    }`;

  if (loadingRef) {
    return (
      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="flex items-center gap-2 text-gray-400 text-sm">
          <Spinner />
          {t("grower.loadingRef")}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">
      <PageHeader
        title={t("grower.title")}
        subtitle={t("grower.subtitle")}
      />

      {/* Tab bar */}
      <div className="flex gap-1 border-b no-print">
        <button onClick={() => setTab("record")} className={tabCls(tab === "record")}>
          {t("grower.tabs.recordPayment")}
        </button>
        <button onClick={() => setTab("history")} className={tabCls(tab === "history")}>
          {t("grower.tabs.paymentHistory")}
        </button>
        <button onClick={() => setTab("reconciliation")} className={tabCls(tab === "reconciliation")}>
          {t("grower.tabs.reconciliation")}
        </button>
      </div>

      {/* ═══════════════════════════════════════════════════════════
         TAB 1: Record Payment
         ═══════════════════════════════════════════════════════════ */}
      {tab === "record" && (
        <>
          {error && (
            <div className="p-3 bg-red-50 text-red-700 rounded text-sm">
              {error}
            </div>
          )}

          {result ? (
            <div className="bg-green-50 border border-green-200 rounded-lg p-6">
              <div className="flex items-center gap-2 mb-4">
                <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <h2 className="text-xl font-bold text-green-800">{t("grower.success.title")}</h2>
              </div>

              <div className="space-y-2 text-sm">
                <Row label={t("grower.success.reference")} value={result.payment_ref} mono />
                <Row label={t("grower.success.grower")} value={result.grower_code ? `${result.grower_name} (${result.grower_code})` : (result.grower_name || result.grower_id)} />
                <Row label={t("grower.success.amount")} value={`${getCurrencySymbol(baseCurrency)} ${result.gross_amount.toLocaleString()}`} bold />
                <Row label={t("grower.success.type")} value={result.payment_type} />
                <Row label={t("grower.success.batchesCovered")} value={`${result.batch_ids.length}`} />
                {result.total_kg != null && (
                  <Row label={t("grower.success.totalKg")} value={`${result.total_kg.toLocaleString()} kg`} />
                )}
                <Row label={t("grower.success.status")} value={result.status} />
                <Row label={t("grower.success.date")} value={result.paid_date || "—"} />
              </div>

              <div className="mt-6 flex gap-3">
                <button
                  onClick={handleNewPayment}
                  className="bg-green-600 text-white px-4 py-2 rounded text-sm font-medium hover:bg-green-700"
                >
                  {t("grower.success.recordAnother")}
                </button>
                <button
                  onClick={() => {
                    setTab("reconciliation");
                    setReconGrowerId(result.grower_id);
                  }}
                  className="border border-gray-300 text-gray-700 px-4 py-2 rounded text-sm font-medium hover:bg-gray-50"
                >
                  {t("grower.success.viewReconciliation")}
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit(onSubmit)} className="bg-white border rounded-lg p-6 space-y-5 shadow-sm">
              {/* Grower */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t("grower.form.grower")}
                </label>
                <select
                  {...register("grower_id", { required: "Grower is required" })}
                  className={errors.grower_id || getFieldError("grower_id") ? inputError : inputBase}
                >
                  <option value="">{t("grower.form.selectGrower")}</option>
                  {growers.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name}{g.grower_code ? ` (${g.grower_code})` : ""}
                    </option>
                  ))}
                </select>
                <FieldMsg error={errors.grower_id?.message || getFieldError("grower_id")} />
              </div>

              {/* Amount + Type */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t("grower.form.amount")} ({baseCurrency})
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">
                      {getCurrencySymbol(baseCurrency)}
                    </span>
                    <input
                      type="number"
                      step="0.01"
                      {...register("amount", { required: "Amount is required", valueAsNumber: true })}
                      className={`${errors.amount || getFieldError("amount") ? inputError : inputBase} pl-8`}
                      placeholder={t("grower.form.amountPlaceholder")}
                    />
                  </div>
                  <FieldMsg error={errors.amount?.message || getFieldError("amount")} />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    {t("grower.form.paymentType")}
                  </label>
                  <select
                    {...register("payment_type")}
                    className={inputBase}
                  >
                    <option value="final">{t("grower.form.typeFinal")}</option>
                    <option value="advance">{t("grower.form.typeAdvance")}</option>
                  </select>
                </div>
              </div>

              {/* Payment Date */}
              <div className="w-1/2">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t("grower.form.paymentDate")}
                </label>
                <input
                  type="date"
                  {...register("payment_date", { required: "Payment date is required" })}
                  className={errors.payment_date || getFieldError("payment_date") ? inputError : inputBase}
                />
                <FieldMsg error={errors.payment_date?.message || getFieldError("payment_date")} />
              </div>

              {/* Batch selection */}
              {selectedGrowerId && (
                <div className="bg-gray-50 border rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <p className="text-sm font-medium text-gray-700">{t("grower.form.linkToBatches")}</p>
                      <p className="text-xs text-gray-500">
                        {t("grower.form.linkHelp")}
                      </p>
                    </div>
                    {growerBatches.length > 0 && (
                      <button
                        type="button"
                        onClick={selectAllBatches}
                        className="text-xs text-green-600 hover:text-green-700 font-medium"
                      >
                        {t("common:actions.selectAll")}
                      </button>
                    )}
                  </div>

                  {growerBatches.length === 0 ? (
                    <p className="text-sm text-gray-400">{t("grower.form.noBatches")}</p>
                  ) : (
                    <>
                      <div className="space-y-1 max-h-48 overflow-y-auto">
                        {growerBatches.map((b) => (
                          <label
                            key={b.id}
                            className={`flex items-center gap-3 px-3 py-2 rounded cursor-pointer text-sm hover:bg-gray-100 ${
                              selectedBatchIds.includes(b.id) ? "bg-green-50" : ""
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={selectedBatchIds.includes(b.id)}
                              onChange={() => toggleBatch(b.id)}
                              className="rounded text-green-600"
                            />
                            <span className="font-mono text-xs text-gray-600">{b.batch_code}</span>
                            <span className="text-gray-700">{b.fruit_type}</span>
                            <span className="ml-auto text-gray-500">
                              {((b.net_weight_kg ?? b.gross_weight_kg) || 0).toLocaleString()} kg
                            </span>
                            <span
                              className={`px-1.5 py-0.5 rounded text-xs ${
                                b.status === "received"
                                  ? "bg-blue-50 text-blue-700"
                                  : b.status === "complete"
                                  ? "bg-green-50 text-green-700"
                                  : "bg-gray-100 text-gray-600"
                              }`}
                            >
                              {b.status}
                            </span>
                          </label>
                        ))}
                      </div>

                      {selectedBatchIds.length > 0 && (
                        <div className="mt-3 flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-200 rounded text-sm text-green-800">
                          <span className="font-medium">
                            {t("grower.form.batchesSelected", { count: selectedBatchIds.length })}
                          </span>
                          <span>&middot;</span>
                          <span>{t("grower.form.kgTotal", { kg: selectedKg.toLocaleString() })}</span>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  {t("grower.form.notes")}
                </label>
                <textarea
                  {...register("notes")}
                  rows={2}
                  className={inputBase}
                  placeholder={t("grower.form.notesPlaceholder")}
                />
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="flex items-center gap-2 bg-green-600 text-white px-6 py-2.5 rounded text-sm font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting && <Spinner />}
                {isSubmitting ? t("grower.form.submitting") : t("grower.form.submit")}
              </button>
            </form>
          )}
        </>
      )}

      {/* ═══════════════════════════════════════════════════════════
         TAB 2: Payment History
         ═══════════════════════════════════════════════════════════ */}
      {tab === "history" && (
        <div className="space-y-4">
          {/* Filter */}
          <div className="flex items-center gap-3">
            <select
              value={historyGrowerId}
              onChange={(e) => setHistoryGrowerId(e.target.value)}
              className="border rounded px-3 py-2 text-sm max-w-sm"
            >
              <option value="">{t("grower.history.allGrowers")}</option>
              {growers.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}{g.grower_code ? ` (${g.grower_code})` : ""}
                </option>
              ))}
            </select>
            <span className="text-xs text-gray-500">
              {t("grower.history.showing", { count: filteredPayments.length, total: recentPayments.length })}
            </span>
          </div>

          {/* Edit panel */}
          {editingPayment && (
            <div className="bg-white rounded-lg border p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-gray-700">
                  {t("grower.edit.title")} — {editingPayment.payment_ref}
                </h4>
                <span className="text-xs text-gray-400">
                  {editingPayment.grower_code ? `${editingPayment.grower_name} (${editingPayment.grower_code})` : editingPayment.grower_name}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">{t("grower.form.amount")} *</label>
                  <div className="relative">
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">
                      {getCurrencySymbol(baseCurrency)}
                    </span>
                    <input
                      type="number"
                      step="0.01"
                      value={editForm.amount}
                      onChange={(e) => setEditForm({ ...editForm, amount: e.target.value })}
                      className="w-full border rounded pl-7 pr-2 py-1.5 text-sm"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">{t("grower.form.paymentType")}</label>
                  <select
                    value={editForm.payment_type}
                    onChange={(e) => setEditForm({ ...editForm, payment_type: e.target.value })}
                    className="w-full border rounded px-2 py-1.5 text-sm"
                  >
                    <option value="final">{t("grower.form.typeFinal")}</option>
                    <option value="advance">{t("grower.form.typeAdvance")}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">{t("grower.form.paymentDate")}</label>
                  <input
                    type="date"
                    value={editForm.payment_date}
                    onChange={(e) => setEditForm({ ...editForm, payment_date: e.target.value })}
                    className="w-full border rounded px-2 py-1.5 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">{t("common:table.status")}</label>
                  <select
                    value={editForm.status}
                    onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}
                    className="w-full border rounded px-2 py-1.5 text-sm"
                  >
                    <option value="paid">{t("grower.edit.statusPaid")}</option>
                    <option value="cancelled">{t("grower.edit.statusCancelled")}</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">{t("grower.form.notes")}</label>
                <input
                  value={editForm.notes}
                  onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                  className="w-full border rounded px-2 py-1.5 text-sm"
                  placeholder={t("grower.form.notesPlaceholder")}
                />
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  onClick={savePaymentEdit}
                  disabled={!editForm.amount || Number(editForm.amount) <= 0 || editSaving}
                  className="px-4 py-1.5 text-sm font-medium text-white bg-green-600 rounded hover:bg-green-700 disabled:opacity-50"
                >
                  {editSaving ? t("common:actions.saving") : t("common:actions.save")}
                </button>
                <button
                  onClick={cancelEditPayment}
                  className="px-4 py-1.5 text-sm border text-gray-600 rounded hover:bg-gray-50"
                >
                  {t("common:actions.cancel")}
                </button>
              </div>
            </div>
          )}

          {/* Payment table */}
          <div className="bg-white rounded-lg border overflow-hidden">
            {filteredPayments.length === 0 ? (
              <p className="text-sm text-gray-400 p-4">{t("grower.history.empty")}</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-600">
                  <tr>
                    <th onClick={() => toggleSort("ref")} className={`text-left px-4 py-2 font-medium ${sortableThClass}`}>{t("common:table.ref")}{sortIndicator("ref")}</th>
                    <th onClick={() => toggleSort("grower")} className={`text-left px-4 py-2 font-medium ${sortableThClass}`}>{t("common:table.grower")}{sortIndicator("grower")}</th>
                    <th onClick={() => toggleSort("amount")} className={`text-right px-4 py-2 font-medium ${sortableThClass}`}>{t("common:table.amount")}{sortIndicator("amount")}</th>
                    <th onClick={() => toggleSort("type")} className={`text-left px-4 py-2 font-medium ${sortableThClass}`}>{t("common:table.type")}{sortIndicator("type")}</th>
                    <th onClick={() => toggleSort("status")} className={`text-left px-4 py-2 font-medium ${sortableThClass}`}>{t("common:table.status")}{sortIndicator("status")}</th>
                    <th onClick={() => toggleSort("date")} className={`text-left px-4 py-2 font-medium ${sortableThClass}`}>{t("common:table.date")}{sortIndicator("date")}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filteredPayments.map((p) => (
                    <tr
                      key={p.id}
                      onClick={() => startEditPayment(p)}
                      className={`cursor-pointer hover:bg-green-50/50 even:bg-gray-50/50 ${
                        editingPayment?.id === p.id ? "bg-green-50" : ""
                      }`}
                    >
                      <td className="px-4 py-2 font-mono text-xs text-green-700">
                        {p.payment_ref}
                      </td>
                      <td className="px-4 py-2">{p.grower_code ? `${p.grower_name} (${p.grower_code})` : (p.grower_name || "—")}</td>
                      <td className="px-4 py-2 text-right font-medium">
                        {getCurrencySymbol(baseCurrency)} {p.gross_amount.toLocaleString()}
                      </td>
                      <td className="px-4 py-2">
                        <Badge type={p.payment_type} />
                      </td>
                      <td className="px-4 py-2">
                        <StatusBadge status={p.status} />
                      </td>
                      <td className="px-4 py-2 text-gray-500">
                        {p.paid_date || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════
         TAB 3: Reconciliation
         ═══════════════════════════════════════════════════════════ */}
      {tab === "reconciliation" && (
        <div className="space-y-4">
          {/* Grower selector */}
          <div className="bg-white rounded-lg border p-4 no-print">
            <label className="block text-xs text-gray-500 mb-1">
              {t("grower.reconciliation.selectGrower")}
            </label>
            <select
              value={reconGrowerId}
              onChange={(e) => setReconGrowerId(e.target.value)}
              className="w-full border rounded px-3 py-2 text-sm max-w-md"
            >
              <option value="">{t("grower.reconciliation.selectPlaceholder")}</option>
              {growers.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}{g.grower_code ? ` (${g.grower_code})` : ""}
                </option>
              ))}
            </select>
          </div>

          {reconLoading && (
            <p className="text-sm text-gray-400 text-center py-4">{t("common:actions.loading")}</p>
          )}

          {reconDetail && !reconLoading && (
            <div className="space-y-4 print-area">
              {/* Print header (visible only in print) */}
              <div className="hidden print:block mb-4">
                <h2 className="text-lg font-bold">{t("grower.reconciliation.statementTitle")}</h2>
                <p className="text-sm text-gray-600">
                  {reconDetail.grower_name}
                  {reconDetail.grower_code ? ` (${reconDetail.grower_code})` : ""}
                </p>
                <p className="text-xs text-gray-500">{new Date().toLocaleDateString()}</p>
              </div>

              {/* Batch breakdown */}
              <div className="bg-white rounded-lg border p-4">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">
                  {t("grower.reconciliation.deliveries")}
                </h3>
                {reconDetail.batches.length === 0 ? (
                  <p className="text-sm text-gray-400">{t("grower.reconciliation.noDeliveries")}</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="text-gray-500 text-xs">
                      <tr>
                        <th onClick={() => toggleSort("batchCode")} className={`text-left px-2 py-1.5 font-medium ${sortableThClass}`}>{t("grower.reconciliation.headers.batchCode")}{sortIndicator("batchCode")}</th>
                        <th onClick={() => toggleSort("intakeDate")} className={`text-left px-2 py-1.5 font-medium ${sortableThClass}`}>{t("grower.reconciliation.headers.intakeDate")}{sortIndicator("intakeDate")}</th>
                        <th onClick={() => toggleSort("intakeKg")} className={`text-right px-2 py-1.5 font-medium ${sortableThClass}`}>{t("grower.reconciliation.headers.intakeKg")}{sortIndicator("intakeKg")}</th>
                        <th onClick={() => toggleSort("batchStatus")} className={`text-left px-2 py-1.5 font-medium ${sortableThClass}`}>{t("grower.reconciliation.headers.status")}{sortIndicator("batchStatus")}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {sortRows(reconDetail.batches, sortCol, sortDir, {
                        batchCode: (b) => b.batch_code,
                        intakeDate: (b) => b.intake_date || "",
                        intakeKg: (b) => b.intake_kg,
                        batchStatus: (b) => b.status,
                      }).map((b) => (
                        <tr key={b.batch_id} className="even:bg-gray-50/50">
                          <td className="px-2 py-1.5 font-mono text-xs text-green-700">{b.batch_code}</td>
                          <td className="px-2 py-1.5 text-gray-500">
                            {b.intake_date ? new Date(b.intake_date).toLocaleDateString() : "\u2014"}
                          </td>
                          <td className="px-2 py-1.5 text-right">{b.intake_kg.toLocaleString()}</td>
                          <td className="px-2 py-1.5">
                            <StatusBadge status={b.status} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="border-t-2 font-semibold">
                      <tr>
                        <td className="px-2 py-2" colSpan={2}>
                          {t("grower.reconciliation.summary.totalBatches", { count: reconDetail.total_batches })}
                        </td>
                        <td className="px-2 py-2 text-right">
                          {reconDetail.total_intake_kg.toLocaleString()} kg
                        </td>
                        <td className="px-2 py-2" />
                      </tr>
                    </tfoot>
                  </table>
                )}
              </div>

              {/* Payment history */}
              <div className="bg-white rounded-lg border p-4">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">
                  {t("grower.reconciliation.payments")}
                </h3>
                {reconDetail.payments.length === 0 ? (
                  <p className="text-sm text-gray-400">{t("grower.reconciliation.noPayments")}</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="text-gray-500 text-xs">
                      <tr>
                        <th onClick={() => toggleSort("paymentDate")} className={`text-left px-2 py-1.5 font-medium ${sortableThClass}`}>{t("grower.reconciliation.headers.paymentDate")}{sortIndicator("paymentDate")}</th>
                        <th onClick={() => toggleSort("paymentRef")} className={`text-left px-2 py-1.5 font-medium ${sortableThClass}`}>{t("grower.reconciliation.headers.paymentRef")}{sortIndicator("paymentRef")}</th>
                        <th onClick={() => toggleSort("paymentType")} className={`text-left px-2 py-1.5 font-medium ${sortableThClass}`}>{t("grower.reconciliation.headers.paymentType")}{sortIndicator("paymentType")}</th>
                        <th onClick={() => toggleSort("paymentAmount")} className={`text-right px-2 py-1.5 font-medium ${sortableThClass}`}>{t("grower.reconciliation.headers.paymentAmount")}{sortIndicator("paymentAmount")}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {sortRows(reconDetail.payments, sortCol, sortDir, {
                        paymentDate: (p) => p.payment_date || "",
                        paymentRef: (p) => p.payment_ref,
                        paymentType: (p) => p.payment_type,
                        paymentAmount: (p) => p.gross_amount,
                      }).map((p) => (
                        <tr key={p.id} className="even:bg-gray-50/50">
                          <td className="px-2 py-1.5 text-gray-500">
                            {p.payment_date ? new Date(p.payment_date).toLocaleDateString() : "\u2014"}
                          </td>
                          <td className="px-2 py-1.5 font-mono text-xs text-green-700">{p.payment_ref}</td>
                          <td className="px-2 py-1.5">
                            <Badge type={p.payment_type} />
                          </td>
                          <td className="px-2 py-1.5 text-right font-medium">
                            {getCurrencySymbol(reconDetail.currency)} {p.gross_amount.toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="border-t-2 font-semibold">
                      <tr>
                        <td className="px-2 py-2" colSpan={3}>{t("grower.reconciliation.summary.totalPaid")}</td>
                        <td className="px-2 py-2 text-right">
                          {getCurrencySymbol(reconDetail.currency)} {reconDetail.total_paid.toLocaleString()}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                )}
              </div>

              {/* Summary card */}
              <div className="bg-white rounded-lg border p-4">
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <p className="text-xs text-gray-500">{t("grower.reconciliation.summary.totalBatches", { count: reconDetail.total_batches })}</p>
                    <p className="text-lg font-bold text-gray-800">
                      {reconDetail.total_intake_kg.toLocaleString()} kg
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">{t("grower.reconciliation.summary.totalPaid")}</p>
                    <p className="text-lg font-bold text-gray-800">
                      {getCurrencySymbol(reconDetail.currency)} {reconDetail.total_paid.toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">{t("grower.reconciliation.summary.totalIntakeKg")}</p>
                    <p className="text-lg font-bold text-gray-800">
                      {reconDetail.total_intake_kg.toLocaleString()} kg
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
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                  </svg>
                  {t("grower.reconciliation.print")}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Small helper components ─────────────────────────────── */

function FieldMsg({ error }: { error?: string }) {
  if (!error) return null;
  return <p className="mt-1 text-xs text-red-600">{error}</p>;
}

function Spinner() {
  return (
    <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
    </svg>
  );
}

function Badge({ type }: { type: string }) {
  const cls =
    type === "advance"
      ? "bg-yellow-50 text-yellow-700"
      : "bg-green-50 text-green-700";
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${cls}`}
    >
      {type}
    </span>
  );
}

function Row({ label, value, mono, bold }: { label: string; value: string; mono?: boolean; bold?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className="text-gray-600">{label}</span>
      <span className={`${mono ? "font-mono" : ""} ${bold ? "font-bold text-green-800" : "text-gray-800"}`}>
        {value}
      </span>
    </div>
  );
}
