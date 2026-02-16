import React, { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuthStore } from "../store/authStore";
import { listBatches, BatchOut, listLots, LotSummary } from "../api/batches";
import { listGrowerPayments, GrowerPaymentOut } from "../api/payments";
import { getDashboard, DashboardSummary } from "../api/reconciliation";

const STATUS_COLORS: Record<string, string> = {
  received: "bg-blue-50 text-blue-700",
  grading: "bg-purple-50 text-purple-700",
  packing: "bg-yellow-50 text-yellow-700",
  complete: "bg-green-50 text-green-700",
  rejected: "bg-red-50 text-red-700",
};

export default function Dashboard() {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const [batches, setBatches] = useState<BatchOut[]>([]);
  const [payments, setPayments] = useState<GrowerPaymentOut[]>([]);
  const [lots, setLots] = useState<LotSummary[]>([]);
  const [reconciliation, setReconciliation] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      listBatches().catch(() => []),
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
      <h1 className="text-2xl font-bold text-gray-800">
        Welcome, {user?.full_name}
      </h1>
      <p className="text-sm text-gray-500 mt-1">
        {user?.role} &middot; Enterprise: {user?.enterprise_id ? "Active" : "Not set up"}
      </p>

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
          {openAlerts} open reconciliation alert{openAlerts !== 1 ? "s" : ""}
          {criticalAlerts > 0 && ` (${criticalAlerts} critical)`}
          <span className="ml-auto text-xs opacity-70">View &rarr;</span>
        </Link>
      )}

      {/* Quick stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4 mt-6">
        <StatCard label="Total Batches" value={batches.length} />
        <StatCard label="Received Today" value={receivedToday} accent="blue" />
        <StatCard
          label="Unpalletized"
          value={unallocatedBoxes}
          accent={unallocatedBoxes > 0 ? "yellow" : "green"}
        />
        <StatCard
          label="Payments Pending"
          value={pendingPayments}
          accent={pendingPayments > 0 ? "yellow" : "green"}
        />
        <StatCard
          label="Open Alerts"
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
          New GRN Intake
        </Link>
        <Link
          to="/batches"
          className="bg-white border text-gray-700 px-4 py-2 rounded text-sm font-medium hover:bg-gray-50"
        >
          All Batches
        </Link>
        <Link
          to="/payments"
          className="bg-white border text-gray-700 px-4 py-2 rounded text-sm font-medium hover:bg-gray-50"
        >
          Record Payment
        </Link>
        <Link
          to="/reconciliation"
          className="bg-white border text-gray-700 px-4 py-2 rounded text-sm font-medium hover:bg-gray-50"
        >
          Reconciliation
        </Link>
        <Link
          to="/setup"
          className="bg-white border text-gray-700 px-4 py-2 rounded text-sm font-medium hover:bg-gray-50"
        >
          Edit Setup
        </Link>
      </div>

      {loading ? (
        <p className="mt-8 text-gray-400 text-sm">Loading...</p>
      ) : (
        <>
          {/* Recent batches */}
          <div className="mt-8">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold text-gray-800">Recent Batches</h2>
              {batches.length > 0 && (
                <Link to="/batches" className="text-sm text-green-600 hover:underline">
                  View all
                </Link>
              )}
            </div>
            {batches.length > 0 ? (
              <div className="bg-white rounded-lg border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-600">
                    <tr>
                      <th className="text-left px-4 py-2 font-medium">Code</th>
                      <th className="text-left px-4 py-2 font-medium">Grower</th>
                      <th className="text-left px-4 py-2 font-medium">Fruit</th>
                      <th className="text-right px-4 py-2 font-medium">Net (kg)</th>
                      <th className="text-left px-4 py-2 font-medium">Status</th>
                      <th className="text-left px-4 py-2 font-medium">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {batches.slice(0, 8).map((b) => (
                      <tr
                        key={b.id}
                        onClick={() => navigate(`/batches/${b.id}`)}
                        className="hover:bg-gray-50 cursor-pointer"
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
                          <span
                            className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                              STATUS_COLORS[b.status] || "bg-gray-100 text-gray-600"
                            }`}
                          >
                            {b.status}
                          </span>
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
                No batches yet. Start by creating a GRN intake.
              </p>
            )}
          </div>

          {/* Recent payments */}
          {payments.length > 0 && (
            <div className="mt-8">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-lg font-semibold text-gray-800">Recent Payments</h2>
                <Link to="/payments" className="text-sm text-green-600 hover:underline">
                  View all
                </Link>
              </div>
              <div className="bg-white rounded-lg border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-600">
                    <tr>
                      <th className="text-left px-4 py-2 font-medium">Ref</th>
                      <th className="text-left px-4 py-2 font-medium">Grower</th>
                      <th className="text-right px-4 py-2 font-medium">Amount</th>
                      <th className="text-left px-4 py-2 font-medium">Type</th>
                      <th className="text-left px-4 py-2 font-medium">Status</th>
                      <th className="text-left px-4 py-2 font-medium">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {payments.slice(0, 5).map((p) => (
                      <tr key={p.id} className="hover:bg-gray-50">
                        <td className="px-4 py-2 font-mono text-xs text-green-700">
                          {p.payment_ref}
                        </td>
                        <td className="px-4 py-2">{p.grower_name || "\u2014"}</td>
                        <td className="px-4 py-2 text-right font-medium">
                          {p.currency} {p.gross_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                        </td>
                        <td className="px-4 py-2 capitalize">{p.payment_type}</td>
                        <td className="px-4 py-2">
                          <span
                            className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                              p.status === "paid"
                                ? "bg-green-50 text-green-700"
                                : "bg-yellow-50 text-yellow-700"
                            }`}
                          >
                            {p.status}
                          </span>
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
