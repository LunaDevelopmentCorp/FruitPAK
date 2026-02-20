import { useEffect, useMemo, useState } from "react";
import {
  listHarvestTeams,
  listTeamPayments,
  submitTeamPayment,
  getTeamSummary,
  HarvestTeamItem,
  TeamPaymentOut,
  TeamSummary,
} from "../api/payments";
import { listBatches, BatchSummary } from "../api/batches";
import { getErrorMessage } from "../api/client";
import { showToast } from "../store/toastStore";
import PageHeader from "../components/PageHeader";
import StatusBadge from "../components/StatusBadge";

export default function TeamPayments() {
  // ── Data ──────────────────────────────────────────────────
  const [teams, setTeams] = useState<HarvestTeamItem[]>([]);
  const [payments, setPayments] = useState<TeamPaymentOut[]>([]);
  const [summaries, setSummaries] = useState<TeamSummary[]>([]);
  const [batches, setBatches] = useState<BatchSummary[]>([]);

  // ── Form ──────────────────────────────────────────────────
  const [selectedTeamId, setSelectedTeamId] = useState("");
  const [amount, setAmount] = useState("");
  const [currency, setCurrency] = useState("ZAR");
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
  const [tab, setTab] = useState<"record" | "summary">("record");

  // ── Load data ─────────────────────────────────────────────
  useEffect(() => {
    listHarvestTeams().then(setTeams).catch(() => {});
    listTeamPayments().then(setPayments).catch(() => {});
    getTeamSummary().then(setSummaries).catch(() => {});
  }, []);

  // Load batches for selected team
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
      0
    );
    const totalBins = selected.reduce((s, b) => s + (b.bin_count ?? 0), 0);
    return { count: selected.length, totalKg, totalBins };
  }, [batches, selectedBatchIds]);

  const selectedTeam = teams.find((t) => t.id === selectedTeamId);

  // ── Submit ────────────────────────────────────────────────
  const handleSubmit = async () => {
    if (!selectedTeamId || !amount || Number(amount) <= 0) return;
    setSubmitting(true);
    try {
      const result = await submitTeamPayment({
        harvest_team_id: selectedTeamId,
        amount: Number(amount),
        currency,
        payment_type: paymentType,
        payment_date: paymentDate,
        notes: notes || undefined,
        batch_ids: Array.from(selectedBatchIds),
      });
      setSuccess(result);
      showToast("success", `Payment ${result.payment_ref} recorded`);
      // Refresh
      listTeamPayments().then(setPayments).catch(() => {});
      getTeamSummary().then(setSummaries).catch(() => {});
    } catch (err) {
      showToast("error", getErrorMessage(err, "Failed to record payment"));
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
    <div className="max-w-5xl mx-auto px-6 py-8 space-y-6">
      <PageHeader title="Harvest Team Payments" />

      {/* Tab bar */}
      <div className="flex gap-1 border-b">
        <button
          onClick={() => setTab("record")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === "record"
              ? "border-green-600 text-green-700"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          Record Payment
        </button>
        <button
          onClick={() => setTab("summary")}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            tab === "summary"
              ? "border-green-600 text-green-700"
              : "border-transparent text-gray-500 hover:text-gray-700"
          }`}
        >
          Team Summary
        </button>
      </div>

      {tab === "record" && (
        <>
          {/* ── Payment Form ─────────────────────────────────── */}
          {success ? (
            <div className="bg-white rounded-lg border p-6 space-y-4">
              <div className="text-center space-y-2">
                <p className="text-green-600 font-semibold text-lg">
                  Payment Recorded
                </p>
                <p className="font-mono text-sm text-gray-600">
                  {success.payment_ref}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-y-2 text-sm max-w-md mx-auto">
                <span className="text-gray-500">Team</span>
                <span className="font-medium">{success.team_name}</span>
                <span className="text-gray-500">Leader</span>
                <span>{success.team_leader || "\u2014"}</span>
                <span className="text-gray-500">Amount</span>
                <span className="font-bold text-green-700">
                  {success.currency} {success.amount.toLocaleString()}
                </span>
                <span className="text-gray-500">Type</span>
                <span>
                  <Badge type={success.payment_type} />
                </span>
                <span className="text-gray-500">Batches</span>
                <span>{success.batch_ids.length}</span>
                <span className="text-gray-500">Total kg</span>
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
                  Record Another
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-white rounded-lg border p-5 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                {/* Team */}
                <div>
                  <label className="block text-xs text-gray-500 mb-1">
                    Harvest Team *
                  </label>
                  <select
                    value={selectedTeamId}
                    onChange={(e) => setSelectedTeamId(e.target.value)}
                    className="w-full border rounded px-3 py-2 text-sm"
                  >
                    <option value="">Select team...</option>
                    {teams.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                        {t.team_leader ? ` (${t.team_leader})` : ""}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Amount */}
                <div>
                  <label className="block text-xs text-gray-500 mb-1">
                    Amount *
                  </label>
                  <div className="flex gap-2">
                    <select
                      value={currency}
                      onChange={(e) => setCurrency(e.target.value)}
                      className="border rounded px-2 py-2 text-sm w-20"
                    >
                      <option>ZAR</option>
                      <option>USD</option>
                      <option>EUR</option>
                      <option>GBP</option>
                    </select>
                    <input
                      type="number"
                      min={0.01}
                      step={0.01}
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      placeholder="0.00"
                      className="flex-1 border rounded px-3 py-2 text-sm"
                    />
                  </div>
                </div>

                {/* Type */}
                <div>
                  <label className="block text-xs text-gray-500 mb-1">
                    Payment Type
                  </label>
                  <select
                    value={paymentType}
                    onChange={(e) => setPaymentType(e.target.value)}
                    className="w-full border rounded px-3 py-2 text-sm"
                  >
                    <option value="advance">Advance</option>
                    <option value="final">Final Settlement</option>
                  </select>
                </div>

                {/* Date */}
                <div>
                  <label className="block text-xs text-gray-500 mb-1">
                    Payment Date *
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
                  Notes
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                  className="w-full border rounded px-3 py-2 text-sm"
                  placeholder="Payment reference, reason for advance, etc."
                />
              </div>

              {/* Batch selection */}
              {selectedTeamId && batches.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs text-gray-500">
                      Link to Batches (optional)
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
                        ? "Deselect All"
                        : "Select All"}
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
                      {teamBatchSummary.count} batch(es) &middot;{" "}
                      {teamBatchSummary.totalKg.toLocaleString()} kg &middot;{" "}
                      {teamBatchSummary.totalBins} bins
                    </p>
                  )}
                </div>
              )}

              {selectedTeamId && batches.length === 0 && (
                <p className="text-xs text-gray-400">
                  No batches found for this team.
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
                  {submitting ? "Recording..." : "Record Payment"}
                </button>
              </div>
            </div>
          )}

          {/* ── Recent Payments ───────────────────────────────── */}
          <div className="bg-white rounded-lg border p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">
              Recent Team Payments
            </h3>
            {payments.length === 0 ? (
              <p className="text-sm text-gray-400">No payments recorded yet.</p>
            ) : (
              <table className="w-full text-sm">
                <thead className="text-gray-500 text-xs">
                  <tr>
                    <th className="text-left px-2 py-1.5 font-medium">Ref</th>
                    <th className="text-left px-2 py-1.5 font-medium">Team</th>
                    <th className="text-left px-2 py-1.5 font-medium">
                      Leader
                    </th>
                    <th className="text-right px-2 py-1.5 font-medium">
                      Amount
                    </th>
                    <th className="text-left px-2 py-1.5 font-medium">Type</th>
                    <th className="text-left px-2 py-1.5 font-medium">
                      Status
                    </th>
                    <th className="text-left px-2 py-1.5 font-medium">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {payments.slice(0, 20).map((p) => (
                    <tr key={p.id} className="hover:bg-green-50/50 even:bg-gray-50/50">
                      <td className="px-2 py-1.5 font-mono text-xs text-green-700">
                        {p.payment_ref}
                      </td>
                      <td className="px-2 py-1.5">{p.team_name}</td>
                      <td className="px-2 py-1.5 text-gray-500">
                        {p.team_leader || "\u2014"}
                      </td>
                      <td className="px-2 py-1.5 text-right font-medium">
                        {p.currency} {p.amount.toLocaleString()}
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

      {tab === "summary" && (
        <div className="bg-white rounded-lg border p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">
            Team Reconciliation Summary
          </h3>
          {summaries.length === 0 ? (
            <p className="text-sm text-gray-400">
              No harvest teams or payments yet.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-gray-500 text-xs">
                <tr>
                  <th className="text-left px-2 py-1.5 font-medium">Team</th>
                  <th className="text-left px-2 py-1.5 font-medium">Leader</th>
                  <th className="text-right px-2 py-1.5 font-medium">
                    Batches
                  </th>
                  <th className="text-right px-2 py-1.5 font-medium">
                    Total kg
                  </th>
                  <th className="text-right px-2 py-1.5 font-medium">Bins</th>
                  <th className="text-right px-2 py-1.5 font-medium">
                    Advances
                  </th>
                  <th className="text-right px-2 py-1.5 font-medium">
                    Finals
                  </th>
                  <th className="text-right px-2 py-1.5 font-medium">
                    Total Paid
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {summaries.map((s) => (
                  <tr key={s.harvest_team_id} className="hover:bg-green-50/50 even:bg-gray-50/50">
                    <td className="px-2 py-1.5 font-medium">{s.team_name}</td>
                    <td className="px-2 py-1.5 text-gray-500">
                      {s.team_leader || "\u2014"}
                    </td>
                    <td className="px-2 py-1.5 text-right">{s.total_batches}</td>
                    <td className="px-2 py-1.5 text-right">
                      {s.total_kg.toLocaleString()}
                    </td>
                    <td className="px-2 py-1.5 text-right">{s.total_bins}</td>
                    <td className="px-2 py-1.5 text-right text-yellow-700">
                      {s.total_advances > 0
                        ? `R ${s.total_advances.toLocaleString()}`
                        : "\u2014"}
                    </td>
                    <td className="px-2 py-1.5 text-right text-green-700">
                      {s.total_finals > 0
                        ? `R ${s.total_finals.toLocaleString()}`
                        : "\u2014"}
                    </td>
                    <td className="px-2 py-1.5 text-right font-semibold">
                      R {s.total_paid.toLocaleString()}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 font-semibold">
                <tr>
                  <td className="px-2 py-2" colSpan={2}>
                    Totals
                  </td>
                  <td className="px-2 py-2 text-right">
                    {summaries.reduce((s, t) => s + t.total_batches, 0)}
                  </td>
                  <td className="px-2 py-2 text-right">
                    {summaries
                      .reduce((s, t) => s + t.total_kg, 0)
                      .toLocaleString()}
                  </td>
                  <td className="px-2 py-2 text-right">
                    {summaries.reduce((s, t) => s + t.total_bins, 0)}
                  </td>
                  <td className="px-2 py-2 text-right text-yellow-700">
                    R{" "}
                    {summaries
                      .reduce((s, t) => s + t.total_advances, 0)
                      .toLocaleString()}
                  </td>
                  <td className="px-2 py-2 text-right text-green-700">
                    R{" "}
                    {summaries
                      .reduce((s, t) => s + t.total_finals, 0)
                      .toLocaleString()}
                  </td>
                  <td className="px-2 py-2 text-right">
                    R{" "}
                    {summaries
                      .reduce((s, t) => s + t.total_paid, 0)
                      .toLocaleString()}
                  </td>
                </tr>
              </tfoot>
            </table>
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
