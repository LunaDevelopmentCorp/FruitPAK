import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../store/authStore";
import { listBatches, BatchSummary, listLots, LotSummary } from "../api/batches";
import { listGrowerPayments, GrowerPaymentOut } from "../api/payments";
import { getDashboard, DashboardSummary } from "../api/reconciliation";
import PageHeader from "../components/PageHeader";
import StatusBadge from "../components/StatusBadge";
import { useTableSort, sortRows, sortableThClass } from "../hooks/useTableSort";


export default function Dashboard() {
  const { t } = useTranslation("dashboard");
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const [batches, setBatches] = useState<BatchSummary[]>([]);
  const [payments, setPayments] = useState<GrowerPaymentOut[]>([]);
  const [lots, setLots] = useState<LotSummary[]>([]);
  const [reconciliation, setReconciliation] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const { sortCol: batchSortCol, sortDir: batchSortDir, toggleSort: batchToggleSort, sortIndicator: batchSortIndicator } = useTableSort();
  const { sortCol: paySortCol, sortDir: paySortDir, toggleSort: payToggleSort, sortIndicator: paySortIndicator } = useTableSort();

  useEffect(() => {
    Promise.all([
      listBatches().then((r) => r.items).catch(() => []),
      listGrowerPayments().catch(() => []),
      getDashboard().catch(() => null),
      listLots().catch(() => []),
    ]).then(([b, p, r, l]) => {
      setBatches(b);
      setPayments(p);
      setReconciliation(r);
      setLots(l);
      setLoading(false);
    });
  }, []);

  const today = new Date().toISOString().slice(0, 10);
  const receivedToday = batches.filter(
    (b) =>
      b.status === "received" &&
      (b.intake_date?.slice(0, 10) === today || b.created_at?.slice(0, 10) === today),
  ).length;
  const pendingPayments = payments.filter((p) => p.status !== "paid").length;
  const openAlerts = reconciliation?.total_open ?? 0;
  const criticalAlerts = reconciliation?.by_severity?.critical ?? 0;
  const unallocatedBoxes = lots.reduce(
    (sum, l) => sum + Math.max(0, l.carton_count - (l.palletized_boxes ?? 0)),
    0,
  );

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <PageHeader
        title={t("welcome", { name: user?.full_name })}
        subtitle={t("subtitle", { role: user?.role, status: user?.enterprise_id ? t("enterpriseActive") : t("enterpriseNotSetUp") })}
      />

      {/* Alert banner */}
      {openAlerts > 0 && (
        <Link
          to="/reconciliation"
          className={`mt-4 flex items-center gap-2 px-4 py-3 rounded-lg text-sm font-medium ${
            criticalAlerts > 0
              ? "bg-red-50 border border-red-200 text-red-800"
              : "bg-amber-50 border border-amber-200 text-amber-800"
          }`}
        >
          <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
          {t("alerts.openAlerts", { count: openAlerts })}
          {criticalAlerts > 0 && ` ${t("alerts.critical", { count: criticalAlerts })}`}
          <span className="ml-auto text-xs opacity-70">{t("alerts.view")} &rarr;</span>
        </Link>
      )}

      {/* Quick stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mt-6">
        <StatCard label={t("stats.totalBatches")} value={batches.length} />
        <StatCard label={t("stats.receivedToday")} value={receivedToday} accent="blue" />
        <StatCard
          label={t("stats.unpalletized")}
          value={unallocatedBoxes}
          accent={unallocatedBoxes > 0 ? "yellow" : "green"}
        />
        <StatCard
          label={t("stats.paymentsPending")}
          value={pendingPayments}
          accent={pendingPayments > 0 ? "yellow" : "green"}
        />
        <StatCard
          label={t("stats.openAlerts")}
          value={openAlerts}
          accent={criticalAlerts > 0 ? "red" : openAlerts > 0 ? "yellow" : "green"}
        />
      </div>

      {/* Quick links */}
      <div className="mt-6 flex flex-wrap gap-3">
        <Link
          to="/grn-intake"
          className="bg-green-600 text-white px-4 py-2 rounded text-sm font-medium hover:bg-green-700"
        >
          {t("quickLinks.newGrn")}
        </Link>
        <Link
          to="/batches"
          className="bg-white border text-gray-700 px-4 py-2 rounded text-sm font-medium hover:bg-gray-50"
        >
          {t("quickLinks.allBatches")}
        </Link>
        <Link
          to="/payments"
          className="bg-white border text-gray-700 px-4 py-2 rounded text-sm font-medium hover:bg-gray-50"
        >
          {t("quickLinks.recordPayment")}
        </Link>
        <Link
          to="/reconciliation"
          className="bg-white border text-gray-700 px-4 py-2 rounded text-sm font-medium hover:bg-gray-50"
        >
          {t("quickLinks.reconciliation")}
        </Link>
        <Link
          to="/setup"
          className="bg-white border text-gray-700 px-4 py-2 rounded text-sm font-medium hover:bg-gray-50"
        >
          {t("quickLinks.editSetup")}
        </Link>
      </div>

      {loading ? (
        <p className="mt-8 text-gray-400 text-sm">{t("common:actions.loading")}</p>
      ) : (
        <>
          {/* Recent batches */}
          <div className="mt-8">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold text-gray-800">{t("recentBatches")}</h2>
              {batches.length > 0 && (
                <Link to="/batches" className="text-sm text-green-600 hover:underline">
                  {t("common:actions.viewAll")}
                </Link>
              )}
            </div>
            {batches.length > 0 ? (
              <div className="bg-white rounded-lg border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-600">
                    <tr>
                      <th onClick={() => batchToggleSort("batch_code")} className={`text-left px-4 py-2 font-medium ${sortableThClass}`}>{t("tableHeaders.code")}{batchSortIndicator("batch_code")}</th>
                      <th onClick={() => batchToggleSort("grower_name")} className={`text-left px-4 py-2 font-medium ${sortableThClass}`}>{t("tableHeaders.grower")}{batchSortIndicator("grower_name")}</th>
                      <th onClick={() => batchToggleSort("fruit_type")} className={`text-left px-4 py-2 font-medium ${sortableThClass}`}>{t("tableHeaders.fruit")}{batchSortIndicator("fruit_type")}</th>
                      <th onClick={() => batchToggleSort("net_weight_kg")} className={`text-right px-4 py-2 font-medium ${sortableThClass}`}>{t("tableHeaders.netKg")}{batchSortIndicator("net_weight_kg")}</th>
                      <th onClick={() => batchToggleSort("status")} className={`text-left px-4 py-2 font-medium ${sortableThClass}`}>{t("tableHeaders.status")}{batchSortIndicator("status")}</th>
                      <th onClick={() => batchToggleSort("date")} className={`text-left px-4 py-2 font-medium ${sortableThClass}`}>{t("tableHeaders.date")}{batchSortIndicator("date")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {sortRows(batches.slice(0, 8), batchSortCol, batchSortDir, {
                      batch_code: (r) => r.batch_code,
                      grower_name: (r) => r.grower_name,
                      fruit_type: (r) => r.fruit_type,
                      net_weight_kg: (r) => r.net_weight_kg,
                      status: (r) => r.status,
                      date: (r) => r.intake_date ?? r.created_at,
                    }).map((b) => (
                      <tr
                        key={b.id}
                        onClick={() => navigate(`/batches/${b.id}`)}
                        className="hover:bg-green-50/50 cursor-pointer even:bg-gray-50/50"
                      >
                        <td className="px-4 py-2 font-mono text-xs text-green-700">
                          {b.batch_code}
                        </td>
                        <td className="px-4 py-2">{b.grower_name || "\u2014"}</td>
                        <td className="px-4 py-2">{b.fruit_type}</td>
                        <td className="px-4 py-2 text-right">
                          {b.net_weight_kg?.toLocaleString() ?? "\u2014"}
                        </td>
                        <td className="px-4 py-2">
                          <StatusBadge status={b.status} />
                        </td>
                        <td className="px-4 py-2 text-gray-500">
                          {b.intake_date
                            ? new Date(b.intake_date).toLocaleDateString()
                            : b.created_at
                              ? new Date(b.created_at).toLocaleDateString()
                              : "\u2014"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-gray-400 text-sm">
                {t("noBatches")}
              </p>
            )}
          </div>

          {/* Recent payments */}
          {payments.length > 0 && (
            <div className="mt-8">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-semibold text-gray-800">{t("recentPayments")}</h2>
                <Link to="/payments" className="text-sm text-green-600 hover:underline">
                  {t("common:actions.viewAll")}
                </Link>
              </div>
              <div className="bg-white rounded-lg border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-600">
                    <tr>
                      <th onClick={() => payToggleSort("payment_ref")} className={`text-left px-4 py-2 font-medium ${sortableThClass}`}>{t("paymentHeaders.ref")}{paySortIndicator("payment_ref")}</th>
                      <th onClick={() => payToggleSort("grower_name")} className={`text-left px-4 py-2 font-medium ${sortableThClass}`}>{t("paymentHeaders.grower")}{paySortIndicator("grower_name")}</th>
                      <th onClick={() => payToggleSort("gross_amount")} className={`text-right px-4 py-2 font-medium ${sortableThClass}`}>{t("paymentHeaders.amount")}{paySortIndicator("gross_amount")}</th>
                      <th onClick={() => payToggleSort("payment_type")} className={`text-left px-4 py-2 font-medium ${sortableThClass}`}>{t("paymentHeaders.type")}{paySortIndicator("payment_type")}</th>
                      <th onClick={() => payToggleSort("status")} className={`text-left px-4 py-2 font-medium ${sortableThClass}`}>{t("paymentHeaders.status")}{paySortIndicator("status")}</th>
                      <th onClick={() => payToggleSort("date")} className={`text-left px-4 py-2 font-medium ${sortableThClass}`}>{t("paymentHeaders.date")}{paySortIndicator("date")}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {sortRows(payments.slice(0, 5), paySortCol, paySortDir, {
                      payment_ref: (r) => r.payment_ref,
                      grower_name: (r) => r.grower_name,
                      gross_amount: (r) => r.gross_amount,
                      payment_type: (r) => r.payment_type,
                      status: (r) => r.status,
                      date: (r) => r.paid_date ?? r.created_at,
                    }).map((p) => (
                      <tr key={p.id} className="hover:bg-green-50/50 even:bg-gray-50/50">
                        <td className="px-4 py-2 font-mono text-xs text-green-700">
                          {p.payment_ref}
                        </td>
                        <td className="px-4 py-2">{p.grower_name || "\u2014"}</td>
                        <td className="px-4 py-2 text-right font-medium">
                          {p.currency} {p.gross_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-4 py-2 capitalize">{p.payment_type}</td>
                        <td className="px-4 py-2">
                          <StatusBadge status={p.status} />
                        </td>
                        <td className="px-4 py-2 text-gray-500">
                          {p.paid_date
                            ? new Date(p.paid_date).toLocaleDateString()
                            : p.created_at
                              ? new Date(p.created_at).toLocaleDateString()
                              : "\u2014"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: number;
  accent?: string;
}) {
  const color =
    accent === "blue"
      ? "text-blue-600"
      : accent === "yellow"
        ? "text-yellow-600"
        : accent === "green"
          ? "text-green-600"
          : accent === "red"
            ? "text-red-600"
            : "text-gray-800";
  return (
    <div className="bg-white rounded-lg border p-4">
      <p className="text-sm text-gray-500">{label}</p>
      <p className={`text-2xl font-bold mt-1 ${color}`}>{value}</p>
    </div>
  );
}
