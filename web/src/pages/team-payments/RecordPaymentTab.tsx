import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  listTeamPayments,
  submitTeamPayment,
  updateTeamPayment,
  TeamPaymentOut,
  PaymentUpdatePayload,
} from "../../api/payments";
import { listBatches, BatchSummary } from "../../api/batches";
import { getErrorMessage } from "../../api/client";
import { getCurrencySymbol } from "../../constants/currencies";
import { showToast } from "../../store/toastStore";
import StatusBadge from "../../components/StatusBadge";
import PaymentBadge from "./PaymentBadge";
import type { RecordPaymentTabProps } from "./types";

export default function RecordPaymentTab({
  sortedTeams,
  baseCurrency,
  payments,
  onPaymentsChange,
}: RecordPaymentTabProps) {
  const { t } = useTranslation("payments");

  // ── Form state ──────────────────────────────────────────
  const [selectedTeamId, setSelectedTeamId] = useState("");
  const [amount, setAmount] = useState("");
  const [paymentType, setPaymentType] = useState("advance");
  const [paymentDate, setPaymentDate] = useState(
    new Date().toISOString().slice(0, 10),
  );
  const [notes, setNotes] = useState("");
  const [selectedBatchIds, setSelectedBatchIds] = useState<Set<string>>(
    new Set(),
  );
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<TeamPaymentOut | null>(null);

  // ── Batch loading for selected team ─────────────────────
  const [batches, setBatches] = useState<BatchSummary[]>([]);

  useEffect(() => {
    if (!selectedTeamId) {
      setBatches([]);
      setSelectedBatchIds(new Set());
      return;
    }
    listBatches({ harvest_team_id: selectedTeamId })
      .then((resp) => resp.items.filter((b) => b.status !== "rejected"))
      .then(setBatches)
      .catch(() => setBatches([]));
  }, [selectedTeamId]);

  const teamBatchSummary = useMemo(() => {
    const selected = batches.filter((b) => selectedBatchIds.has(b.id));
    const totalKg = selected.reduce(
      (s, b) => s + (b.net_weight_kg ?? b.gross_weight_kg ?? 0),
      0,
    );
    const totalBins = selected.reduce((s, b) => s + (b.bin_count ?? 0), 0);
    return { count: selected.length, totalKg, totalBins };
  }, [batches, selectedBatchIds]);

  // ── Payment editing state ───────────────────────────────
  const [editingPayment, setEditingPayment] = useState<TeamPaymentOut | null>(
    null,
  );
  const [payEditForm, setPayEditForm] = useState({
    amount: "",
    payment_type: "",
    payment_date: "",
    notes: "",
    status: "",
  });
  const [payEditSaving, setPayEditSaving] = useState(false);

  const startEditPayment = (p: TeamPaymentOut) => {
    setEditingPayment(p);
    setPayEditForm({
      amount: p.amount.toString(),
      payment_type: p.payment_type,
      payment_date: p.payment_date || "",
      notes: p.notes || "",
      status: p.status,
    });
  };

  const cancelEditPayment = () => {
    setEditingPayment(null);
  };

  const savePaymentEdit = async () => {
    if (!editingPayment) return;
    setPayEditSaving(true);
    try {
      const payload: PaymentUpdatePayload = {};
      const newAmount = Number(payEditForm.amount);
      if (newAmount !== editingPayment.amount) payload.amount = newAmount;
      if (payEditForm.payment_type !== editingPayment.payment_type)
        payload.payment_type = payEditForm.payment_type;
      if (payEditForm.payment_date !== (editingPayment.payment_date || ""))
        payload.payment_date = payEditForm.payment_date;
      if (payEditForm.notes !== (editingPayment.notes || ""))
        payload.notes = payEditForm.notes;
      if (payEditForm.status !== editingPayment.status)
        payload.status = payEditForm.status;

      await updateTeamPayment(editingPayment.id, payload);
      showToast("success", t("team.edit.updated"));
      cancelEditPayment();
      listTeamPayments()
        .then(onPaymentsChange)
        .catch(() => {});
    } catch (err) {
      showToast(
        "error",
        getErrorMessage(err, t("team.edit.updateFailed")),
      );
    } finally {
      setPayEditSaving(false);
    }
  };

  // ── Submit payment ──────────────────────────────────────
  const handleSubmit = async () => {
    if (!selectedTeamId || !amount || Number(amount) <= 0) return;
    setSubmitting(true);
    try {
      const result = await submitTeamPayment({
        harvest_team_id: selectedTeamId,
        amount: Number(amount),
        currency: baseCurrency,
        payment_type: paymentType,
        payment_date: paymentDate,
        notes: notes || undefined,
        batch_ids: Array.from(selectedBatchIds),
      });
      setSuccess(result);
      showToast(
        "success",
        t("team.success.toast", { ref: result.payment_ref }),
      );
      listTeamPayments()
        .then(onPaymentsChange)
        .catch(() => {});
    } catch (err) {
      showToast(
        "error",
        getErrorMessage(err, t("grower.form.submissionFailed")),
      );
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setSuccess(null);
    setSelectedTeamId("");
    setAmount("");
    setPaymentType("advance");
    setNotes("");
    setSelectedBatchIds(new Set());
  };

  return (
    <>
      {success ? (
        <div className="bg-white rounded-lg border p-6 space-y-4">
          <div className="text-center space-y-2">
            <p className="text-green-600 font-semibold text-lg">
              {t("team.success.title")}
            </p>
            <p className="font-mono text-sm text-gray-600">
              {success.payment_ref}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-y-2 text-sm max-w-md mx-auto">
            <span className="text-gray-500">{t("team.success.team")}</span>
            <span className="font-medium">{success.team_name}</span>
            <span className="text-gray-500">{t("team.success.leader")}</span>
            <span>{success.team_leader || "\u2014"}</span>
            <span className="text-gray-500">{t("grower.success.amount")}</span>
            <span className="font-bold text-green-700">
              {getCurrencySymbol(baseCurrency)} {success.amount.toLocaleString()}
            </span>
            <span className="text-gray-500">{t("grower.success.type")}</span>
            <span>
              <PaymentBadge type={success.payment_type} />
            </span>
            <span className="text-gray-500">
              {t("team.summary.headers.batches")}
            </span>
            <span>{success.batch_ids.length}</span>
            <span className="text-gray-500">
              {t("team.summary.headers.totalKg")}
            </span>
            <span>
              {success.total_kg
                ? `${success.total_kg.toLocaleString()} kg`
                : "\u2014"}
            </span>
          </div>
          <div className="text-center pt-2">
            <button
              onClick={resetForm}
              className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700"
            >
              {t("grower.success.recordAnother")}
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-lg border p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            {/* Team */}
            <div>
              <label className="block text-xs text-gray-500 mb-1">
                {t("team.form.team")}
              </label>
              <select
                value={selectedTeamId}
                onChange={(e) => setSelectedTeamId(e.target.value)}
                className="w-full border rounded px-3 py-2 text-sm"
              >
                <option value="">{t("team.form.selectTeam")}</option>
                {sortedTeams.map((tm) => (
                  <option key={tm.id} value={tm.id}>
                    {tm.name}
                    {tm.team_leader ? ` (${tm.team_leader})` : ""}
                  </option>
                ))}
              </select>
            </div>

            {/* Amount */}
            <div>
              <label className="block text-xs text-gray-500 mb-1">
                {t("team.form.amount")} ({baseCurrency})
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">
                  {getCurrencySymbol(baseCurrency)}
                </span>
                <input
                  type="number"
                  min={0.01}
                  step={0.01}
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="0.00"
                  className="w-full border rounded pl-8 pr-3 py-2 text-sm"
                />
              </div>
            </div>

            {/* Type */}
            <div>
              <label className="block text-xs text-gray-500 mb-1">
                {t("team.form.paymentType")}
              </label>
              <select
                value={paymentType}
                onChange={(e) => setPaymentType(e.target.value)}
                className="w-full border rounded px-3 py-2 text-sm"
              >
                <option value="advance">{t("team.form.typeAdvance")}</option>
                <option value="final">{t("team.form.typeFinal")}</option>
              </select>
            </div>

            {/* Date */}
            <div>
              <label className="block text-xs text-gray-500 mb-1">
                {t("team.form.paymentDate")}
              </label>
              <input
                type="date"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
                className="w-full border rounded px-3 py-2 text-sm"
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs text-gray-500 mb-1">
              {t("team.form.notes")}
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full border rounded px-3 py-2 text-sm"
              placeholder={t("team.form.notesPlaceholder")}
            />
          </div>

          {/* Batch selection */}
          {selectedTeamId && batches.length > 0 && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs text-gray-500">
                  {t("team.form.linkToBatches")}
                </label>
                <button
                  type="button"
                  onClick={() => {
                    if (selectedBatchIds.size === batches.length)
                      setSelectedBatchIds(new Set());
                    else
                      setSelectedBatchIds(new Set(batches.map((b) => b.id)));
                  }}
                  className="text-xs text-green-600 hover:text-green-700"
                >
                  {selectedBatchIds.size === batches.length
                    ? t("common:actions.deselectAll")
                    : t("common:actions.selectAll")}
                </button>
              </div>
              <div className="border rounded max-h-48 overflow-y-auto divide-y">
                {batches.map((b) => (
                  <label
                    key={b.id}
                    className={`flex items-center gap-3 px-3 py-2 text-sm cursor-pointer ${
                      selectedBatchIds.has(b.id)
                        ? "bg-green-50"
                        : "hover:bg-gray-50"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedBatchIds.has(b.id)}
                      onChange={() => {
                        setSelectedBatchIds((prev) => {
                          const next = new Set(prev);
                          if (next.has(b.id)) next.delete(b.id);
                          else next.add(b.id);
                          return next;
                        });
                      }}
                      className="rounded border-gray-300"
                    />
                    <span className="font-mono text-xs text-green-700">
                      {b.batch_code}
                    </span>
                    <span className="text-gray-600">{b.fruit_type}</span>
                    <span className="text-gray-500 ml-auto">
                      {(
                        b.net_weight_kg ??
                        b.gross_weight_kg ??
                        0
                      ).toLocaleString()}{" "}
                      kg
                    </span>
                    <span className="text-gray-400">
                      {b.bin_count ?? 0} bins
                    </span>
                  </label>
                ))}
              </div>
              {selectedBatchIds.size > 0 && (
                <p className="text-xs text-gray-500 mt-1">
                  {t("team.form.batchesSelected", {
                    count: teamBatchSummary.count,
                  })}{" "}
                  &middot; {teamBatchSummary.totalKg.toLocaleString()} kg
                  &middot;{" "}
                  {t("team.form.binsCount", {
                    count: teamBatchSummary.totalBins,
                  })}
                </p>
              )}
            </div>
          )}

          {selectedTeamId && batches.length === 0 && (
            <p className="text-xs text-gray-400">{t("team.form.noBatches")}</p>
          )}

          {/* Submit */}
          <div className="pt-2">
            <button
              onClick={handleSubmit}
              disabled={
                !selectedTeamId ||
                !amount ||
                Number(amount) <= 0 ||
                submitting
              }
              className="px-5 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {submitting ? t("team.form.submitting") : t("team.form.submit")}
            </button>
          </div>
        </div>
      )}

      {/* Edit payment panel */}
      {editingPayment && (
        <div className="bg-white rounded-lg border p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-gray-700">
              {t("team.edit.title")} — {editingPayment.payment_ref}
            </h4>
            <span className="text-xs text-gray-400">
              {editingPayment.team_name}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div>
              <label className="block text-xs text-gray-500 mb-1">
                {t("team.form.amount")} *
              </label>
              <div className="relative">
                <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">
                  {getCurrencySymbol(baseCurrency)}
                </span>
                <input
                  type="number"
                  step="0.01"
                  value={payEditForm.amount}
                  onChange={(e) =>
                    setPayEditForm({ ...payEditForm, amount: e.target.value })
                  }
                  className="w-full border rounded pl-7 pr-2 py-1.5 text-sm"
                />
              </div>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">
                {t("team.form.paymentType")}
              </label>
              <select
                value={payEditForm.payment_type}
                onChange={(e) =>
                  setPayEditForm({
                    ...payEditForm,
                    payment_type: e.target.value,
                  })
                }
                className="w-full border rounded px-2 py-1.5 text-sm"
              >
                <option value="advance">{t("team.form.typeAdvance")}</option>
                <option value="final">{t("team.form.typeFinal")}</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">
                {t("team.form.paymentDate")}
              </label>
              <input
                type="date"
                value={payEditForm.payment_date}
                onChange={(e) =>
                  setPayEditForm({
                    ...payEditForm,
                    payment_date: e.target.value,
                  })
                }
                className="w-full border rounded px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">
                {t("common:table.status")}
              </label>
              <select
                value={payEditForm.status}
                onChange={(e) =>
                  setPayEditForm({ ...payEditForm, status: e.target.value })
                }
                className="w-full border rounded px-2 py-1.5 text-sm"
              >
                <option value="paid">{t("team.edit.statusPaid")}</option>
                <option value="cancelled">
                  {t("team.edit.statusCancelled")}
                </option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">
              {t("team.form.notes")}
            </label>
            <input
              value={payEditForm.notes}
              onChange={(e) =>
                setPayEditForm({ ...payEditForm, notes: e.target.value })
              }
              className="w-full border rounded px-2 py-1.5 text-sm"
              placeholder={t("team.form.notesPlaceholder")}
            />
          </div>
          <div className="flex gap-2 pt-1">
            <button
              onClick={savePaymentEdit}
              disabled={
                !payEditForm.amount ||
                Number(payEditForm.amount) <= 0 ||
                payEditSaving
              }
              className="px-4 py-1.5 text-sm font-medium text-white bg-green-600 rounded hover:bg-green-700 disabled:opacity-50"
            >
              {payEditSaving
                ? t("common:actions.saving")
                : t("common:actions.save")}
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

      {/* Recent Payments */}
      <div className="bg-white rounded-lg border p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">
          {t("team.recent.title")}
        </h3>
        {payments.length === 0 ? (
          <p className="text-sm text-gray-400">{t("team.recent.empty")}</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-gray-500 text-xs">
              <tr>
                <th className="text-left px-2 py-1.5 font-medium">
                  {t("common:table.ref")}
                </th>
                <th className="text-left px-2 py-1.5 font-medium">
                  {t("team.success.team")}
                </th>
                <th className="text-left px-2 py-1.5 font-medium">
                  {t("team.success.leader")}
                </th>
                <th className="text-right px-2 py-1.5 font-medium">
                  {t("common:table.amount")}
                </th>
                <th className="text-left px-2 py-1.5 font-medium">
                  {t("common:table.type")}
                </th>
                <th className="text-left px-2 py-1.5 font-medium">
                  {t("common:table.status")}
                </th>
                <th className="text-left px-2 py-1.5 font-medium">
                  {t("common:table.date")}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {payments.slice(0, 20).map((p) => (
                <tr
                  key={p.id}
                  onClick={() => startEditPayment(p)}
                  className={`cursor-pointer hover:bg-green-50/50 even:bg-gray-50/50 ${
                    editingPayment?.id === p.id ? "bg-green-50" : ""
                  }`}
                >
                  <td className="px-2 py-1.5 font-mono text-xs text-green-700">
                    {p.payment_ref}
                  </td>
                  <td className="px-2 py-1.5">{p.team_name}</td>
                  <td className="px-2 py-1.5 text-gray-500">
                    {p.team_leader || "\u2014"}
                  </td>
                  <td className="px-2 py-1.5 text-right font-medium">
                    {getCurrencySymbol(baseCurrency)}{" "}
                    {p.amount.toLocaleString()}
                  </td>
                  <td className="px-2 py-1.5">
                    <PaymentBadge type={p.payment_type} />
                  </td>
                  <td className="px-2 py-1.5">
                    <StatusBadge status={p.status} />
                  </td>
                  <td className="px-2 py-1.5 text-gray-500">
                    {p.payment_date
                      ? new Date(p.payment_date).toLocaleDateString()
                      : "\u2014"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
