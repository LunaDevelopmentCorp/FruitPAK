import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  listHarvestTeams,
  listTeamPayments,
  submitTeamPayment,
  updateTeamPayment,
  getTeamSummary,
  getTeamReconciliation,
  createHarvestTeam,
  updateHarvestTeam,
  deleteHarvestTeam,
  HarvestTeamItem,
  TeamPaymentOut,
  TeamSummary,
  TeamReconciliationDetail,
  TeamReconciliationBatch,
  PaymentUpdatePayload,
} from "../api/payments";
import { listBatches, updateBatch, BatchSummary } from "../api/batches";
import { getErrorMessage } from "../api/client";
import { getCurrencySymbol } from "../constants/currencies";
import { useFinancialConfig } from "../hooks/useFinancialConfig";
import { useTableSort, sortRows, sortableThClass } from "../hooks/useTableSort";
import { showToast } from "../store/toastStore";
import PageHeader from "../components/PageHeader";
import StatusBadge from "../components/StatusBadge";

export default function TeamPayments() {
  const { t } = useTranslation("payments");
  const { baseCurrency } = useFinancialConfig();

  // ── Data ──────────────────────────────────────────────────
  const [teams, setTeams] = useState<HarvestTeamItem[]>([]);
  const [payments, setPayments] = useState<TeamPaymentOut[]>([]);
  const [batches, setBatches] = useState<BatchSummary[]>([]);

  // ── Form ──────────────────────────────────────────────────
  const [selectedTeamId, setSelectedTeamId] = useState("");
  const [amount, setAmount] = useState("");
  const [paymentType, setPaymentType] = useState("advance");
  const [paymentDate, setPaymentDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [notes, setNotes] = useState("");
  const [selectedBatchIds, setSelectedBatchIds] = useState<Set<string>>(
    new Set()
  );
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<TeamPaymentOut | null>(null);

  // ── Tab ───────────────────────────────────────────────────
  const [tab, setTab] = useState<"record" | "teams" | "reconciliation">("record");

  // ── Team Management state ─────────────────────────────────
  const [teamSearch, setTeamSearch] = useState("");
  const [editingTeam, setEditingTeam] = useState<HarvestTeamItem | null>(null);
  const [addingTeam, setAddingTeam] = useState(false);
  const [teamForm, setTeamForm] = useState({
    name: "", team_leader: "", team_size: "", estimated_volume_kg: "",
    rate_per_kg: "", notes: "",
  });
  const [teamSaving, setTeamSaving] = useState(false);

  // ── Reconciliation state ──────────────────────────────────
  const [reconTeamId, setReconTeamId] = useState("all");
  const [reconDetail, setReconDetail] = useState<TeamReconciliationDetail | null>(null);
  const [reconLoading, setReconLoading] = useState(false);
  const [teamSummaries, setTeamSummaries] = useState<TeamSummary[]>([]);
  const [summaryLoading, setSummaryLoading] = useState(false);

  // ── Reconciliation filters + sorting ─────────────────────
  const [reconSearch, setReconSearch] = useState("");
  const [reconDateFrom, setReconDateFrom] = useState("");
  const [reconDateTo, setReconDateTo] = useState("");
  const { sortCol, sortDir, toggleSort, sortIndicator, resetSort } = useTableSort();

  // ── Inline rate editing state ───────────────────────────────
  const [editingRateBatchId, setEditingRateBatchId] = useState<string | null>(null);
  const [editRateValue, setEditRateValue] = useState("");
  const [savingRate, setSavingRate] = useState(false);

  // ── Payment editing state ─────────────────────────────────
  const [editingPayment, setEditingPayment] = useState<TeamPaymentOut | null>(null);
  const [payEditForm, setPayEditForm] = useState({
    amount: "", payment_type: "", payment_date: "", notes: "", status: "",
  });
  const [payEditSaving, setPayEditSaving] = useState(false);

  // ── Load data ─────────────────────────────────────────────
  const refreshTeams = () => {
    listHarvestTeams().then(setTeams).catch(() => {});
  };

  useEffect(() => {
    refreshTeams();
    listTeamPayments().then(setPayments).catch(() => {});
  }, []);

  // Load batches for selected team (record tab)
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

  // Load reconciliation detail when team selected
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

  const teamBatchSummary = useMemo(() => {
    const selected = batches.filter((b) => selectedBatchIds.has(b.id));
    const totalKg = selected.reduce(
      (s, b) => s + (b.net_weight_kg ?? b.gross_weight_kg ?? 0),
      0
    );
    const totalBins = selected.reduce((s, b) => s + (b.bin_count ?? 0), 0);
    return { count: selected.length, totalKg, totalBins };
  }, [batches, selectedBatchIds]);

  // ── Natural sort helper (handles "1", "2", "10", "P1", "Team 3") ──
  const sortedTeams = useMemo(() => {
    return [...teams].sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" })
    );
  }, [teams]);

  // ── Reconciliation filter helpers ─────────────────────────
  const filteredSummaries = useMemo(() => {
    let rows = [...teamSummaries];
    if (reconSearch) {
      const q = reconSearch.toLowerCase();
      rows = rows.filter(
        (s) =>
          s.team_name.toLowerCase().includes(q) ||
          (s.team_leader || "").toLowerCase().includes(q) ||
          s.batch_codes.some((c) => c.toLowerCase().includes(q))
      );
    }
    if (sortCol) {
      rows.sort((a, b) => {
        let va: number | string = 0, vb: number | string = 0;
        switch (sortCol) {
          case "name": va = a.team_name; vb = b.team_name; break;
          case "leader": va = a.team_leader || ""; vb = b.team_leader || ""; break;
          case "batches": va = a.total_batches; vb = b.total_batches; break;
          case "class1Kg": va = a.class1_kg; vb = b.class1_kg; break;
          case "rate": va = a.rate_per_kg || 0; vb = b.rate_per_kg || 0; break;
          case "owed": va = a.amount_owed; vb = b.amount_owed; break;
          case "paid": va = a.total_paid; vb = b.total_paid; break;
          case "balance": va = a.balance; vb = b.balance; break;
        }
        const cmp = typeof va === "string" ? va.localeCompare(vb as string) : (va as number) - (vb as number);
        return sortDir === "asc" ? cmp : -cmp;
      });
    }
    return rows;
  }, [teamSummaries, reconSearch, sortCol, sortDir]);

  const filteredReconBatches = useMemo(() => {
    if (!reconDetail) return [];
    let rows = [...reconDetail.batches];
    if (reconSearch) {
      const q = reconSearch.toLowerCase();
      rows = rows.filter((b) => b.batch_code.toLowerCase().includes(q));
    }
    if (reconDateFrom) {
      rows = rows.filter((b) => b.intake_date && b.intake_date >= reconDateFrom);
    }
    if (reconDateTo) {
      rows = rows.filter((b) => b.intake_date && b.intake_date <= reconDateTo);
    }
    if (sortCol) {
      rows.sort((a, b) => {
        let va: number | string = 0, vb: number | string = 0;
        switch (sortCol) {
          case "batchCode": va = a.batch_code; vb = b.batch_code; break;
          case "intakeDate": va = a.intake_date || ""; vb = b.intake_date || ""; break;
          case "intakeKg": va = a.intake_kg; vb = b.intake_kg; break;
          case "class1Kg": va = a.class1_kg; vb = b.class1_kg; break;
          case "rate": va = a.effective_rate || 0; vb = b.effective_rate || 0; break;
          case "owed": va = a.owed; vb = b.owed; break;
        }
        const cmp = typeof va === "string" ? va.localeCompare(vb as string) : (va as number) - (vb as number);
        return sortDir === "asc" ? cmp : -cmp;
      });
    }
    return rows;
  }, [reconDetail, reconSearch, reconDateFrom, reconDateTo, sortCol, sortDir]);

  const filteredReconPayments = useMemo(() => {
    if (!reconDetail) return [];
    let rows = [...reconDetail.payments];
    if (reconDateFrom) {
      rows = rows.filter((p) => p.payment_date && p.payment_date >= reconDateFrom);
    }
    if (reconDateTo) {
      rows = rows.filter((p) => p.payment_date && p.payment_date <= reconDateTo);
    }
    if (sortCol) {
      rows.sort((a, b) => {
        let va: number | string = 0, vb: number | string = 0;
        switch (sortCol) {
          case "paymentDate": va = a.payment_date || ""; vb = b.payment_date || ""; break;
          case "paymentRef": va = a.payment_ref; vb = b.payment_ref; break;
          case "paymentType": va = a.payment_type; vb = b.payment_type; break;
          case "paymentAmount": va = a.amount; vb = b.amount; break;
        }
        const cmp = typeof va === "string" ? va.localeCompare(vb as string) : (va as number) - (vb as number);
        return sortDir === "asc" ? cmp : -cmp;
      });
    }
    return rows;
  }, [reconDetail, reconDateFrom, reconDateTo, sortCol, sortDir]);

  // ── Team management helpers ───────────────────────────────
  const filteredTeams = useMemo(() => {
    const sorted = [...teams].sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" })
    );
    if (!teamSearch) return sorted;
    const q = teamSearch.toLowerCase();
    return sorted.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        (t.team_leader || "").toLowerCase().includes(q)
    );
  }, [teams, teamSearch]);

  const startEditTeam = (team: HarvestTeamItem) => {
    setEditingTeam(team);
    setAddingTeam(false);
    setTeamForm({
      name: team.name,
      team_leader: team.team_leader || "",
      team_size: team.team_size?.toString() || "",
      estimated_volume_kg: team.estimated_volume_kg?.toString() || "",
      rate_per_kg: team.rate_per_kg?.toString() || "",
      notes: team.notes || "",
    });
  };

  const startAddTeam = () => {
    setEditingTeam(null);
    setAddingTeam(true);
    setTeamForm({
      name: "", team_leader: "", team_size: "", estimated_volume_kg: "",
      rate_per_kg: "", notes: "",
    });
  };

  const cancelTeamEdit = () => {
    setEditingTeam(null);
    setAddingTeam(false);
  };

  const saveTeam = async () => {
    setTeamSaving(true);
    try {
      const payload: Record<string, unknown> = { name: teamForm.name };
      if (teamForm.team_leader) payload.team_leader = teamForm.team_leader;
      if (teamForm.team_size) payload.team_size = Number(teamForm.team_size);
      if (teamForm.estimated_volume_kg) payload.estimated_volume_kg = Number(teamForm.estimated_volume_kg);
      if (teamForm.rate_per_kg) payload.rate_per_kg = Number(teamForm.rate_per_kg);
      if (teamForm.notes) payload.notes = teamForm.notes;

      if (editingTeam) {
        await updateHarvestTeam(editingTeam.id, payload as Partial<HarvestTeamItem>);
        showToast("success", t("team.management.teamUpdated"));
      } else {
        await createHarvestTeam(payload as Partial<HarvestTeamItem>);
        showToast("success", t("team.management.teamCreated"));
      }
      cancelTeamEdit();
      refreshTeams();
    } catch (err) {
      showToast("error", getErrorMessage(err, editingTeam ? t("team.management.updateFailed") : t("team.management.createFailed")));
    } finally {
      setTeamSaving(false);
    }
  };

  const handleDeleteTeam = async (team: HarvestTeamItem) => {
    if (!confirm(t("team.management.confirmDelete", { name: team.name }))) return;
    try {
      await deleteHarvestTeam(team.id);
      showToast("success", t("team.management.teamDeleted"));
      cancelTeamEdit();
      refreshTeams();
    } catch (err) {
      showToast("error", getErrorMessage(err, t("team.management.deleteFailed")));
    }
  };

  // ── Payment edit helpers ──────────────────────────────────
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
      if (payEditForm.payment_type !== editingPayment.payment_type) payload.payment_type = payEditForm.payment_type;
      if (payEditForm.payment_date !== (editingPayment.payment_date || "")) payload.payment_date = payEditForm.payment_date;
      if (payEditForm.notes !== (editingPayment.notes || "")) payload.notes = payEditForm.notes;
      if (payEditForm.status !== editingPayment.status) payload.status = payEditForm.status;

      await updateTeamPayment(editingPayment.id, payload);
      showToast("success", t("team.edit.updated"));
      cancelEditPayment();
      listTeamPayments().then(setPayments).catch(() => {});
    } catch (err) {
      showToast("error", getErrorMessage(err, t("team.edit.updateFailed")));
    } finally {
      setPayEditSaving(false);
    }
  };

  // ── Inline rate editing helpers ───────────────────────────
  const startEditRate = (batch: TeamReconciliationBatch) => {
    setEditingRateBatchId(batch.batch_id);
    setEditRateValue(batch.harvest_rate_per_kg?.toString() || batch.effective_rate?.toString() || "");
  };

  const cancelEditRate = () => {
    setEditingRateBatchId(null);
    setEditRateValue("");
  };

  const saveRate = async () => {
    if (!editingRateBatchId || !editRateValue || Number(editRateValue) <= 0) return;
    setSavingRate(true);
    try {
      await updateBatch(editingRateBatchId, { harvest_rate_per_kg: Number(editRateValue) });
      showToast("success", t("team.reconciliation.rateUpdated"));
      cancelEditRate();
      // Refresh the reconciliation data
      if (reconTeamId && reconTeamId !== "all") {
        const detail = await getTeamReconciliation(reconTeamId);
        setReconDetail(detail);
      }
    } catch (err) {
      showToast("error", getErrorMessage(err, t("team.reconciliation.rateUpdateFailed")));
    } finally {
      setSavingRate(false);
    }
  };

  // ── Submit payment ────────────────────────────────────────
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
      showToast("success", t("team.success.toast", { ref: result.payment_ref }));
      listTeamPayments().then(setPayments).catch(() => {});
    } catch (err) {
      showToast("error", getErrorMessage(err, t("grower.form.submissionFailed")));
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

  const tabCls = (active: boolean) =>
    `px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
      active
        ? "border-green-600 text-green-700"
        : "border-transparent text-gray-500 hover:text-gray-700"
    }`;

  return (
    <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">
      <PageHeader title={t("team.title")} />

      {/* Tab bar */}
      <div className="flex gap-1 border-b no-print">
        <button onClick={() => setTab("record")} className={tabCls(tab === "record")}>
          {t("team.tabs.recordPayment")}
        </button>
        <button onClick={() => setTab("teams")} className={tabCls(tab === "teams")}>
          {t("team.tabs.teamManagement")}
        </button>
        <button onClick={() => setTab("reconciliation")} className={tabCls(tab === "reconciliation")}>
          {t("team.tabs.reconciliation")}
        </button>
      </div>

      {/* ═══════════════════════════════════════════════════════════
         TAB 1: Record Payment (unchanged)
         ═══════════════════════════════════════════════════════════ */}
      {tab === "record" && (
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
                  <Badge type={success.payment_type} />
                </span>
                <span className="text-gray-500">{t("team.summary.headers.batches")}</span>
                <span>{success.batch_ids.length}</span>
                <span className="text-gray-500">{t("team.summary.headers.totalKg")}</span>
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
                          setSelectedBatchIds(
                            new Set(batches.map((b) => b.id))
                          );
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
                          {(b.net_weight_kg ?? b.gross_weight_kg ?? 0).toLocaleString()} kg
                        </span>
                        <span className="text-gray-400">
                          {b.bin_count ?? 0} bins
                        </span>
                      </label>
                    ))}
                  </div>
                  {selectedBatchIds.size > 0 && (
                    <p className="text-xs text-gray-500 mt-1">
                      {t("team.form.batchesSelected", { count: teamBatchSummary.count })} &middot;{" "}
                      {teamBatchSummary.totalKg.toLocaleString()} kg &middot;{" "}
                      {t("team.form.binsCount", { count: teamBatchSummary.totalBins })}
                    </p>
                  )}
                </div>
              )}

              {selectedTeamId && batches.length === 0 && (
                <p className="text-xs text-gray-400">
                  {t("team.form.noBatches")}
                </p>
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
                  <label className="block text-xs text-gray-500 mb-1">{t("team.form.amount")} *</label>
                  <div className="relative">
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 text-xs">
                      {getCurrencySymbol(baseCurrency)}
                    </span>
                    <input
                      type="number"
                      step="0.01"
                      value={payEditForm.amount}
                      onChange={(e) => setPayEditForm({ ...payEditForm, amount: e.target.value })}
                      className="w-full border rounded pl-7 pr-2 py-1.5 text-sm"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">{t("team.form.paymentType")}</label>
                  <select
                    value={payEditForm.payment_type}
                    onChange={(e) => setPayEditForm({ ...payEditForm, payment_type: e.target.value })}
                    className="w-full border rounded px-2 py-1.5 text-sm"
                  >
                    <option value="advance">{t("team.form.typeAdvance")}</option>
                    <option value="final">{t("team.form.typeFinal")}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">{t("team.form.paymentDate")}</label>
                  <input
                    type="date"
                    value={payEditForm.payment_date}
                    onChange={(e) => setPayEditForm({ ...payEditForm, payment_date: e.target.value })}
                    className="w-full border rounded px-2 py-1.5 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">{t("common:table.status")}</label>
                  <select
                    value={payEditForm.status}
                    onChange={(e) => setPayEditForm({ ...payEditForm, status: e.target.value })}
                    className="w-full border rounded px-2 py-1.5 text-sm"
                  >
                    <option value="paid">{t("team.edit.statusPaid")}</option>
                    <option value="cancelled">{t("team.edit.statusCancelled")}</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">{t("team.form.notes")}</label>
                <input
                  value={payEditForm.notes}
                  onChange={(e) => setPayEditForm({ ...payEditForm, notes: e.target.value })}
                  className="w-full border rounded px-2 py-1.5 text-sm"
                  placeholder={t("team.form.notesPlaceholder")}
                />
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  onClick={savePaymentEdit}
                  disabled={!payEditForm.amount || Number(payEditForm.amount) <= 0 || payEditSaving}
                  className="px-4 py-1.5 text-sm font-medium text-white bg-green-600 rounded hover:bg-green-700 disabled:opacity-50"
                >
                  {payEditSaving ? t("common:actions.saving") : t("common:actions.save")}
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
                    <th className="text-left px-2 py-1.5 font-medium">{t("common:table.ref")}</th>
                    <th className="text-left px-2 py-1.5 font-medium">{t("team.success.team")}</th>
                    <th className="text-left px-2 py-1.5 font-medium">
                      {t("team.success.leader")}
                    </th>
                    <th className="text-right px-2 py-1.5 font-medium">
                      {t("common:table.amount")}
                    </th>
                    <th className="text-left px-2 py-1.5 font-medium">{t("common:table.type")}</th>
                    <th className="text-left px-2 py-1.5 font-medium">
                      {t("common:table.status")}
                    </th>
                    <th className="text-left px-2 py-1.5 font-medium">{t("common:table.date")}</th>
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
                        {getCurrencySymbol(baseCurrency)} {p.amount.toLocaleString()}
                      </td>
                      <td className="px-2 py-1.5">
                        <Badge type={p.payment_type} />
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
      )}

      {/* ═══════════════════════════════════════════════════════════
         TAB 2: Team Management
         ═══════════════════════════════════════════════════════════ */}
      {tab === "teams" && (
        <div className="space-y-4">
          {/* Toolbar */}
          <div className="flex items-center gap-3">
            <input
              type="text"
              value={teamSearch}
              onChange={(e) => setTeamSearch(e.target.value)}
              placeholder={t("team.management.searchPlaceholder")}
              className="border rounded px-3 py-2 text-sm flex-1 max-w-sm"
            />
            <button
              onClick={startAddTeam}
              className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700"
            >
              + {t("team.management.addTeam")}
            </button>
          </div>

          {/* Add / Edit panel */}
          {(addingTeam || editingTeam) && (
            <div className="bg-white rounded-lg border p-4 space-y-3">
              <h4 className="text-sm font-semibold text-gray-700">
                {editingTeam ? editingTeam.name : t("team.management.addTeam")}
              </h4>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">{t("common:table.name")} *</label>
                  <input
                    value={teamForm.name}
                    onChange={(e) => setTeamForm({ ...teamForm, name: e.target.value })}
                    className="w-full border rounded px-2 py-1.5 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">{t("team.management.teamLeader")}</label>
                  <input
                    value={teamForm.team_leader}
                    onChange={(e) => setTeamForm({ ...teamForm, team_leader: e.target.value })}
                    className="w-full border rounded px-2 py-1.5 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">{t("team.management.teamSize")}</label>
                  <input
                    type="number"
                    value={teamForm.team_size}
                    onChange={(e) => setTeamForm({ ...teamForm, team_size: e.target.value })}
                    className="w-full border rounded px-2 py-1.5 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">{t("team.management.estVolume")}</label>
                  <input
                    type="number"
                    value={teamForm.estimated_volume_kg}
                    onChange={(e) => setTeamForm({ ...teamForm, estimated_volume_kg: e.target.value })}
                    className="w-full border rounded px-2 py-1.5 text-sm"
                    placeholder="kg"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">{t("team.management.ratePerKg")}</label>
                  <input
                    type="number"
                    step="0.01"
                    value={teamForm.rate_per_kg}
                    onChange={(e) => setTeamForm({ ...teamForm, rate_per_kg: e.target.value })}
                    className="w-full border rounded px-2 py-1.5 text-sm"
                    placeholder="e.g. 2.50"
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">{t("team.form.notes")}</label>
                  <input
                    value={teamForm.notes}
                    onChange={(e) => setTeamForm({ ...teamForm, notes: e.target.value })}
                    className="w-full border rounded px-2 py-1.5 text-sm"
                  />
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  onClick={saveTeam}
                  disabled={!teamForm.name || teamSaving}
                  className="px-4 py-1.5 text-sm font-medium text-white bg-green-600 rounded hover:bg-green-700 disabled:opacity-50"
                >
                  {teamSaving ? t("common:actions.saving") : t("common:actions.save")}
                </button>
                <button
                  onClick={cancelTeamEdit}
                  className="px-4 py-1.5 text-sm border text-gray-600 rounded hover:bg-gray-50"
                >
                  {t("common:actions.cancel")}
                </button>
                {editingTeam && (
                  <button
                    onClick={() => handleDeleteTeam(editingTeam)}
                    className="px-4 py-1.5 text-sm text-red-600 border border-red-200 rounded hover:bg-red-50 ml-auto"
                  >
                    {t("common:actions.delete")}
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Team list */}
          <div className="bg-white rounded-lg border p-4">
            {filteredTeams.length === 0 ? (
              <p className="text-sm text-gray-400">{t("team.management.empty")}</p>
            ) : (
              <>
                <p className="text-xs text-gray-500 mb-2">
                  {t("team.management.showing", { count: filteredTeams.length, total: teams.length })}
                </p>
                <table className="w-full text-sm">
                  <thead className="text-gray-500 text-xs">
                    <tr>
                      <th className="text-left px-2 py-1.5 font-medium">{t("common:table.name")}</th>
                      <th className="text-left px-2 py-1.5 font-medium">{t("team.management.teamLeader")}</th>
                      <th className="text-right px-2 py-1.5 font-medium">{t("team.management.teamSize")}</th>
                      <th className="text-right px-2 py-1.5 font-medium">{t("team.management.ratePerKg")}</th>
                      <th className="text-right px-2 py-1.5 font-medium">{t("team.management.estVolume")}</th>
                      <th className="text-left px-2 py-1.5 font-medium">{t("team.form.notes")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {filteredTeams.map((tm) => (
                      <tr
                        key={tm.id}
                        onClick={() => startEditTeam(tm)}
                        className={`cursor-pointer hover:bg-green-50/50 even:bg-gray-50/50 ${
                          editingTeam?.id === tm.id ? "bg-green-50" : ""
                        }`}
                      >
                        <td className="px-2 py-1.5 font-medium">{tm.name}</td>
                        <td className="px-2 py-1.5 text-gray-500">{tm.team_leader || "\u2014"}</td>
                        <td className="px-2 py-1.5 text-right">{tm.team_size ?? "\u2014"}</td>
                        <td className="px-2 py-1.5 text-right">
                          {tm.rate_per_kg != null ? `${getCurrencySymbol(baseCurrency)} ${tm.rate_per_kg}` : "\u2014"}
                        </td>
                        <td className="px-2 py-1.5 text-right">
                          {tm.estimated_volume_kg != null ? `${tm.estimated_volume_kg.toLocaleString()} kg` : "\u2014"}
                        </td>
                        <td className="px-2 py-1.5 text-gray-500 truncate max-w-[200px]">
                          {tm.notes || "\u2014"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════
         TAB 3: Reconciliation
         ═══════════════════════════════════════════════════════════ */}
      {tab === "reconciliation" && (
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
                  onChange={(e) => { setReconTeamId(e.target.value); setReconSearch(""); setReconDateFrom(""); setReconDateTo(""); resetSort(); }}
                  className="w-full border rounded px-3 py-2 text-sm"
                >
                  <option value="all">{t("team.reconciliation.allTeams")}</option>
                  {sortedTeams.map((tm) => (
                    <option key={tm.id} value={tm.id}>
                      {tm.name}{tm.team_leader ? ` (${tm.team_leader})` : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex-1 min-w-[160px] max-w-xs">
                <label className="block text-xs text-gray-500 mb-1">
                  {reconTeamId === "all" ? t("team.reconciliation.filterName") : t("team.reconciliation.filterBatch")}
                </label>
                <input
                  type="text"
                  value={reconSearch}
                  onChange={(e) => setReconSearch(e.target.value)}
                  placeholder={reconTeamId === "all" ? t("team.reconciliation.filterNamePlaceholder") : t("team.reconciliation.filterBatchPlaceholder")}
                  className="w-full border rounded px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">{t("team.reconciliation.dateFrom")}</label>
                <input
                  type="date"
                  value={reconDateFrom}
                  onChange={(e) => setReconDateFrom(e.target.value)}
                  className="border rounded px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">{t("team.reconciliation.dateTo")}</label>
                <input
                  type="date"
                  value={reconDateTo}
                  onChange={(e) => setReconDateTo(e.target.value)}
                  className="border rounded px-3 py-2 text-sm"
                />
              </div>
              {(reconSearch || reconDateFrom || reconDateTo) && (
                <button
                  onClick={() => { setReconSearch(""); setReconDateFrom(""); setReconDateTo(""); }}
                  className="text-xs text-gray-500 hover:text-gray-700 underline pb-2.5"
                >
                  {t("team.reconciliation.clearFilters")}
                </button>
              )}
            </div>
          </div>

          {(reconLoading || summaryLoading) && (
            <p className="text-sm text-gray-400 text-center py-4">{t("common:actions.loading")}</p>
          )}

          {/* ── All Teams summary view ─────────────────────────── */}
          {reconTeamId === "all" && !summaryLoading && teamSummaries.length > 0 && (
            <div className="space-y-4 print-area">
              <div className="hidden print:block mb-4">
                <h2 className="text-lg font-bold">{t("team.summary.title")}</h2>
                <p className="text-xs text-gray-500">{new Date().toLocaleDateString()}</p>
              </div>
              <div className="bg-white rounded-lg border p-4 overflow-x-auto">
                {filteredSummaries.length === 0 ? (
                  <p className="text-sm text-gray-400">{t("team.reconciliation.noResults")}</p>
                ) : (
                <table className="w-full text-sm">
                  <thead className="text-gray-500 text-xs">
                    <tr>
                      <th onClick={() => toggleSort("name")} className="text-left px-2 py-1.5 font-medium cursor-pointer hover:text-gray-700 select-none">{t("common:table.name")}{sortIndicator("name")}</th>
                      <th onClick={() => toggleSort("leader")} className="text-left px-2 py-1.5 font-medium cursor-pointer hover:text-gray-700 select-none">{t("team.management.teamLeader")}{sortIndicator("leader")}</th>
                      <th onClick={() => toggleSort("batches")} className="text-right px-2 py-1.5 font-medium cursor-pointer hover:text-gray-700 select-none">{t("team.summary.headers.batches")}{sortIndicator("batches")}</th>
                      <th onClick={() => toggleSort("class1Kg")} className="text-right px-2 py-1.5 font-medium cursor-pointer hover:text-gray-700 select-none">{t("team.summary.headers.class1Kg")}{sortIndicator("class1Kg")}</th>
                      <th onClick={() => toggleSort("rate")} className="text-right px-2 py-1.5 font-medium cursor-pointer hover:text-gray-700 select-none">{t("team.summary.headers.ratePerKg")}{sortIndicator("rate")}</th>
                      <th onClick={() => toggleSort("owed")} className="text-right px-2 py-1.5 font-medium cursor-pointer hover:text-gray-700 select-none">{t("team.summary.headers.owed")}{sortIndicator("owed")}</th>
                      <th onClick={() => toggleSort("paid")} className="text-right px-2 py-1.5 font-medium cursor-pointer hover:text-gray-700 select-none">{t("team.summary.headers.totalPaid")}{sortIndicator("paid")}</th>
                      <th onClick={() => toggleSort("balance")} className="text-right px-2 py-1.5 font-medium cursor-pointer hover:text-gray-700 select-none">{t("team.summary.headers.balance")}{sortIndicator("balance")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {filteredSummaries.map((s) => (
                      <tr
                        key={s.harvest_team_id}
                        onClick={() => setReconTeamId(s.harvest_team_id)}
                        className="cursor-pointer hover:bg-green-50/50 even:bg-gray-50/50"
                      >
                        <td className="px-2 py-1.5 font-medium">{s.team_name}</td>
                        <td className="px-2 py-1.5 text-gray-500">{s.team_leader || "\u2014"}</td>
                        <td className="px-2 py-1.5 text-right">{s.total_batches}</td>
                        <td className="px-2 py-1.5 text-right">{s.class1_kg.toLocaleString()}</td>
                        <td className="px-2 py-1.5 text-right text-gray-500">
                          {s.rate_per_kg != null
                            ? `${getCurrencySymbol(baseCurrency)} ${s.rate_per_kg}`
                            : t("team.summary.noRate")}
                        </td>
                        <td className="px-2 py-1.5 text-right font-medium">
                          {getCurrencySymbol(baseCurrency)} {s.amount_owed.toLocaleString()}
                        </td>
                        <td className="px-2 py-1.5 text-right">
                          {getCurrencySymbol(baseCurrency)} {s.total_paid.toLocaleString()}
                        </td>
                        <td className={`px-2 py-1.5 text-right font-bold ${
                          s.balance > 0 ? "text-red-600" : s.balance < 0 ? "text-green-700" : "text-gray-500"
                        }`}>
                          {getCurrencySymbol(baseCurrency)} {s.balance.toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot className="border-t-2 font-semibold">
                    <tr>
                      <td className="px-2 py-2" colSpan={2}>{t("team.summary.totals")}</td>
                      <td className="px-2 py-2 text-right">{filteredSummaries.reduce((s, r) => s + r.total_batches, 0)}</td>
                      <td className="px-2 py-2 text-right">{filteredSummaries.reduce((s, r) => s + r.class1_kg, 0).toLocaleString()}</td>
                      <td className="px-2 py-2" />
                      <td className="px-2 py-2 text-right">
                        {getCurrencySymbol(baseCurrency)} {filteredSummaries.reduce((s, r) => s + r.amount_owed, 0).toLocaleString()}
                      </td>
                      <td className="px-2 py-2 text-right">
                        {getCurrencySymbol(baseCurrency)} {filteredSummaries.reduce((s, r) => s + r.total_paid, 0).toLocaleString()}
                      </td>
                      <td className={`px-2 py-2 text-right font-bold ${
                        (() => { const b = filteredSummaries.reduce((s, r) => s + r.balance, 0); return b > 0 ? "text-red-600" : b < 0 ? "text-green-700" : "text-gray-500"; })()
                      }`}>
                        {getCurrencySymbol(baseCurrency)} {filteredSummaries.reduce((s, r) => s + r.balance, 0).toLocaleString()}
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
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                  </svg>
                  {t("team.reconciliation.print")}
                </button>
              </div>
            </div>
          )}

          {reconTeamId === "all" && !summaryLoading && teamSummaries.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-4">{t("team.summary.empty")}</p>
          )}

          {/* ── Single team detail view ────────────────────────── */}
          {reconDetail && !reconLoading && reconTeamId !== "all" && (
            <div className="space-y-4 print-area">
              {/* Print header (visible only in print) */}
              <div className="hidden print:block mb-4">
                <h2 className="text-lg font-bold">{t("team.reconciliation.statementTitle")}</h2>
                <p className="text-sm text-gray-600">
                  {reconDetail.team_name}
                  {reconDetail.team_leader ? ` — ${reconDetail.team_leader}` : ""}
                </p>
                <p className="text-xs text-gray-500">{new Date().toLocaleDateString()}</p>
              </div>

              {/* Batch breakdown */}
              <div className="bg-white rounded-lg border p-4">
                <h3 className="text-sm font-semibold text-gray-700 mb-3">
                  {t("team.reconciliation.deliveries")}
                </h3>
                {filteredReconBatches.length === 0 ? (
                  <p className="text-sm text-gray-400">{reconDetail.batches.length === 0 ? t("team.reconciliation.noDeliveries") : t("team.reconciliation.noResults")}</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="text-gray-500 text-xs">
                      <tr>
                        <th onClick={() => toggleSort("batchCode")} className="text-left px-2 py-1.5 font-medium cursor-pointer hover:text-gray-700 select-none">{t("team.reconciliation.headers.batchCode")}{sortIndicator("batchCode")}</th>
                        <th onClick={() => toggleSort("intakeDate")} className="text-left px-2 py-1.5 font-medium cursor-pointer hover:text-gray-700 select-none">{t("team.reconciliation.headers.intakeDate")}{sortIndicator("intakeDate")}</th>
                        <th onClick={() => toggleSort("intakeKg")} className="text-right px-2 py-1.5 font-medium cursor-pointer hover:text-gray-700 select-none">{t("team.reconciliation.headers.intakeKg")}{sortIndicator("intakeKg")}</th>
                        <th onClick={() => toggleSort("class1Kg")} className="text-right px-2 py-1.5 font-medium cursor-pointer hover:text-gray-700 select-none">{t("team.reconciliation.headers.class1Kg")}{sortIndicator("class1Kg")}</th>
                        <th onClick={() => toggleSort("rate")} className="text-right px-2 py-1.5 font-medium cursor-pointer hover:text-gray-700 select-none">{t("team.reconciliation.headers.ratePerKg")}{sortIndicator("rate")}</th>
                        <th onClick={() => toggleSort("owed")} className="text-right px-2 py-1.5 font-medium cursor-pointer hover:text-gray-700 select-none">{t("team.reconciliation.headers.owed")}{sortIndicator("owed")}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {filteredReconBatches.map((b) => (
                        <tr key={b.batch_id} className="even:bg-gray-50/50">
                          <td className="px-2 py-1.5 font-mono text-xs text-green-700">{b.batch_code}</td>
                          <td className="px-2 py-1.5 text-gray-500">
                            {b.intake_date ? new Date(b.intake_date).toLocaleDateString() : "\u2014"}
                          </td>
                          <td className="px-2 py-1.5 text-right">{b.intake_kg.toLocaleString()}</td>
                          <td className="px-2 py-1.5 text-right font-medium">{b.class1_kg.toLocaleString()}</td>
                          <td className="px-2 py-1.5 text-right">
                            {editingRateBatchId === b.batch_id ? (
                              <span className="inline-flex items-center gap-1">
                                <input
                                  type="number"
                                  step="0.01"
                                  value={editRateValue}
                                  onChange={(e) => setEditRateValue(e.target.value)}
                                  className="w-20 border rounded px-1.5 py-0.5 text-sm text-right"
                                  autoFocus
                                  onKeyDown={(e) => {
                                    if (e.key === "Enter") saveRate();
                                    if (e.key === "Escape") cancelEditRate();
                                  }}
                                />
                                <button
                                  onClick={saveRate}
                                  disabled={savingRate || !editRateValue || Number(editRateValue) <= 0}
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
                                title={t("team.reconciliation.clickToEditRate")}
                              >
                                {getCurrencySymbol(reconDetail.rate_currency)} {b.effective_rate}
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
                        <td className="px-2 py-2" colSpan={3}>{t("team.reconciliation.summary.totalOwed")}</td>
                        <td className="px-2 py-2 text-right">
                          {filteredReconBatches.reduce((s, b) => s + b.class1_kg, 0).toLocaleString()}
                        </td>
                        <td className="px-2 py-2" />
                        <td className="px-2 py-2 text-right">
                          {getCurrencySymbol(reconDetail.rate_currency)} {filteredReconBatches.reduce((s, b) => s + b.owed, 0).toLocaleString()}
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
                  <p className="text-sm text-gray-400">{reconDetail.payments.length === 0 ? t("team.reconciliation.noPayments") : t("team.reconciliation.noResults")}</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="text-gray-500 text-xs">
                      <tr>
                        <th onClick={() => toggleSort("paymentDate")} className="text-left px-2 py-1.5 font-medium cursor-pointer hover:text-gray-700 select-none">{t("team.reconciliation.headers.paymentDate")}{sortIndicator("paymentDate")}</th>
                        <th onClick={() => toggleSort("paymentRef")} className="text-left px-2 py-1.5 font-medium cursor-pointer hover:text-gray-700 select-none">{t("team.reconciliation.headers.paymentRef")}{sortIndicator("paymentRef")}</th>
                        <th onClick={() => toggleSort("paymentType")} className="text-left px-2 py-1.5 font-medium cursor-pointer hover:text-gray-700 select-none">{t("team.reconciliation.headers.paymentType")}{sortIndicator("paymentType")}</th>
                        <th onClick={() => toggleSort("paymentAmount")} className="text-right px-2 py-1.5 font-medium cursor-pointer hover:text-gray-700 select-none">{t("team.reconciliation.headers.paymentAmount")}{sortIndicator("paymentAmount")}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {filteredReconPayments.map((p) => (
                        <tr key={p.id} className="even:bg-gray-50/50">
                          <td className="px-2 py-1.5 text-gray-500">
                            {p.payment_date ? new Date(p.payment_date).toLocaleDateString() : "\u2014"}
                          </td>
                          <td className="px-2 py-1.5 font-mono text-xs text-green-700">{p.payment_ref}</td>
                          <td className="px-2 py-1.5">
                            <Badge type={p.payment_type} />
                          </td>
                          <td className="px-2 py-1.5 text-right font-medium">
                            {getCurrencySymbol(reconDetail.rate_currency)} {p.amount.toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="border-t-2 font-semibold">
                      <tr>
                        <td className="px-2 py-2" colSpan={3}>{t("team.reconciliation.summary.totalPaid")}</td>
                        <td className="px-2 py-2 text-right">
                          {getCurrencySymbol(reconDetail.rate_currency)} {filteredReconPayments.reduce((s, p) => s + p.amount, 0).toLocaleString()}
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
                    <p className="text-xs text-gray-500">{t("team.reconciliation.summary.totalOwed")}</p>
                    <p className="text-lg font-bold text-gray-800">
                      {getCurrencySymbol(reconDetail.rate_currency)} {reconDetail.total_owed.toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">{t("team.reconciliation.summary.totalPaid")}</p>
                    <p className="text-lg font-bold text-gray-800">
                      {getCurrencySymbol(reconDetail.rate_currency)} {reconDetail.total_paid.toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">{t("team.reconciliation.summary.balance")}</p>
                    <p className={`text-lg font-bold ${
                      reconDetail.balance > 0 ? "text-red-600" : reconDetail.balance < 0 ? "text-green-700" : "text-gray-500"
                    }`}>
                      {getCurrencySymbol(reconDetail.rate_currency)} {reconDetail.balance.toLocaleString()}
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
                  {t("team.reconciliation.print")}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
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
