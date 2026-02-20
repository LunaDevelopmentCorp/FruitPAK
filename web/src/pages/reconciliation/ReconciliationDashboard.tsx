/**
 * ReconciliationDashboard — main page for the reconciliation module.
 *
 * Layout:
 * ┌─────────────────────────────────────────────────────────────┐
 * │  Header: "Reconciliation" + "Run Now" button                │
 * ├───────────┬───────────┬───────────┬─────────────────────────┤
 * │  KPI Card │  KPI Card │  KPI Card │   Last Run Info         │
 * │  Open (n) │  Acked(n) │  Resolved │   run_id, ran_at        │
 * ├───────────┴───────────┴───────────┴─────────────────────────┤
 * │  Severity Breakdown (bar/pills)                             │
 * │  ■ Critical (n)  ■ High (n)  ■ Medium (n)  ■ Low (n)       │
 * ├──────────────────────────────┬──────────────────────────────┤
 * │  Filter bar                                                 │
 * │  [Type ▼] [Severity ▼] [Status ▼]  Clear filters           │
 * ├──────────────────────────────┴──────────────────────────────┤
 * │  Alert Table                                                │
 * │  ┌────┬──────┬────────┬──────────┬─────────┬─────────┐     │
 * │  │Sev │ Type │ Title  │ Variance │ Status  │ Actions │     │
 * │  └────┴──────┴────────┴──────────┴─────────┴─────────┘     │
 * └─────────────────────────────────────────────────────────────┘
 */

import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import type { DashboardSummary, ReconciliationAlert } from "../../api/reconciliation";
import { getErrorMessage } from "../../api/client";
import { getDashboard, triggerRun, updateAlert } from "../../api/reconciliation";
import { showToast } from "../../store/toastStore";
import PageHeader from "../../components/PageHeader";
import StatusBadge from "../../components/StatusBadge";

// ── Severity badge colours ──────────────────────────────────
const SEV_COLORS: Record<string, string> = {
  critical: "bg-red-100 text-red-800",
  high: "bg-orange-100 text-orange-800",
  medium: "bg-yellow-100 text-yellow-800",
  low: "bg-gray-100 text-gray-600",
};

const TYPE_LABELS: Record<string, string> = {
  grn_vs_payment: "GRN vs Payment",
  export_vs_invoice: "Export vs Invoice",
  labour_vs_cost: "Labour vs Cost",
  pallet_vs_container: "Pallet vs Container",
  lot_vs_batch: "Lot vs Batch",
  cold_storage_gap: "Cold Storage Gap",
};

const STATUS_OPTIONS = ["open", "acknowledged", "resolved", "dismissed"];

// Alert types that relate to payments — show "Record Payment" link
const PAYMENT_TYPES = new Set(["grn_vs_payment", "export_vs_invoice", "labour_vs_cost"]);

// ── Sub-components ──────────────────────────────────────────

function KpiCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-lg border p-4 text-center">
      <p className="text-sm text-gray-500">{label}</p>
      <p className={`text-3xl font-bold ${color}`}>{value}</p>
    </div>
  );
}

function SeverityBar({ by_severity }: { by_severity: Record<string, number> }) {
  return (
    <div className="flex gap-3 flex-wrap">
      {["critical", "high", "medium", "low"].map((sev) => (
        <span key={sev} className={`px-3 py-1 rounded-full text-xs font-medium ${SEV_COLORS[sev]}`}>
          {sev}: {by_severity[sev] || 0}
        </span>
      ))}
    </div>
  );
}

function AlertRow({
  alert,
  onAction,
}: {
  alert: ReconciliationAlert;
  onAction: (id: string, status: string) => void;
}) {
  const sevDot = {
    critical: "bg-red-500",
    high: "bg-orange-500",
    medium: "bg-yellow-500",
    low: "bg-gray-400",
  }[alert.severity];

  const formatVariance = () => {
    if (alert.variance == null) return "\u2014";
    const sign = alert.variance >= 0 ? "+" : "";
    const unit = alert.unit === "currency" ? "" : ` ${alert.unit || ""}`;
    return `${sign}${alert.variance.toLocaleString(undefined, { maximumFractionDigits: 1 })}${unit}`;
  };

  return (
    <tr className="border-t hover:bg-green-50/50 even:bg-gray-50/50 text-sm">
      <td className="px-3 py-2">
        <span className={`inline-block w-2.5 h-2.5 rounded-full ${sevDot}`} title={alert.severity} />
      </td>
      <td className="px-3 py-2 text-xs text-gray-500">{TYPE_LABELS[alert.alert_type] || alert.alert_type}</td>
      <td className="px-3 py-2 font-medium">{alert.title}</td>
      <td className="px-3 py-2 font-mono text-xs">
        {formatVariance()}
        {alert.variance_pct != null && (
          <span className="text-gray-400 ml-1">({alert.variance_pct}%)</span>
        )}
      </td>
      <td className="px-3 py-2">
        <StatusBadge status={alert.status} />
      </td>
      <td className="px-3 py-2">
        <div className="flex gap-1 items-center">
          {alert.status === "open" && (
            <button onClick={() => onAction(alert.id, "acknowledged")} className="text-xs text-blue-600 hover:underline">
              Ack
            </button>
          )}
          {(alert.status === "open" || alert.status === "acknowledged") && (
            <>
              <button onClick={() => onAction(alert.id, "resolved")} className="text-xs text-green-600 hover:underline">
                Resolve
              </button>
              <button onClick={() => onAction(alert.id, "dismissed")} className="text-xs text-gray-400 hover:underline">
                Dismiss
              </button>
            </>
          )}
          {PAYMENT_TYPES.has(alert.alert_type) && (alert.status === "open" || alert.status === "acknowledged") && (
            <Link to="/payments" className="text-xs text-amber-600 hover:underline ml-1">
              Record Payment
            </Link>
          )}
        </div>
      </td>
    </tr>
  );
}

// ── Main dashboard component ────────────────────────────────

export default function ReconciliationDashboard() {
  const [data, setData] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);

  // Filters
  const [filterType, setFilterType] = useState<string>("");
  const [filterSev, setFilterSev] = useState<string>("");
  const [filterStatus, setFilterStatus] = useState<string>("");

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setData(await getDashboard());
    } catch (e: unknown) {
      showToast("error", getErrorMessage(e, "Failed to load dashboard"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleRun = async () => {
    setRunning(true);
    try {
      const result = await triggerRun();
      showToast("success", `Reconciliation complete: ${result.total_alerts} alert(s) found`);
      await load();
    } catch (e: unknown) {
      showToast("error", getErrorMessage(e, "Run failed"));
    } finally {
      setRunning(false);
    }
  };

  const handleAction = async (alertId: string, status: string) => {
    try {
      await updateAlert(alertId, { status });
      showToast("success", `Alert ${status}`);
      await load();
    } catch (e: unknown) {
      showToast("error", getErrorMessage(e, "Action failed"));
    }
  };

  if (loading && !data) return <div className="p-8 text-gray-500">Loading...</div>;

  const filteredAlerts = (data?.alerts || []).filter((a) => {
    if (filterType && a.alert_type !== filterType) return false;
    if (filterSev && a.severity !== filterSev) return false;
    if (filterStatus && a.status !== filterStatus) return false;
    return true;
  });

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <PageHeader
        title="Reconciliation"
        action={
          <button
            onClick={handleRun}
            disabled={running}
            className="px-4 py-2 bg-green-600 text-white rounded text-sm font-medium disabled:opacity-50 hover:bg-green-700"
          >
            {running ? "Running..." : "Run Now"}
          </button>
        }
      />

      {/* KPI cards */}
      {data && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <KpiCard label="Open Alerts" value={data.total_open} color="text-red-600" />
          <KpiCard label="Acknowledged" value={data.total_acknowledged} color="text-blue-600" />
          <KpiCard label="Resolved (30d)" value={data.total_resolved_30d} color="text-green-600" />
          <div className="rounded-lg border p-4">
            <p className="text-sm text-gray-500">Last Run</p>
            {data.latest_run_at ? (
              <p className="text-sm font-mono mt-1">{new Date(data.latest_run_at).toLocaleString()}</p>
            ) : (
              <p className="text-sm text-gray-400 mt-1">No runs yet</p>
            )}
          </div>
        </div>
      )}

      {/* Severity breakdown */}
      {data && <SeverityBar by_severity={data.by_severity} />}

      {/* Filters */}
      {data && (
        <div className="flex flex-wrap items-center gap-3">
          <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="border rounded px-3 py-1.5 text-sm">
            <option value="">All types</option>
            {Object.entries(TYPE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v} ({data.by_type[k] || 0})</option>
            ))}
          </select>
          <select value={filterSev} onChange={(e) => setFilterSev(e.target.value)} className="border rounded px-3 py-1.5 text-sm">
            <option value="">All severities</option>
            {["critical", "high", "medium", "low"].map((s) => (
              <option key={s} value={s}>{s} ({data.by_severity[s] || 0})</option>
            ))}
          </select>
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="border rounded px-3 py-1.5 text-sm">
            <option value="">All statuses</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          {(filterType || filterSev || filterStatus) && (
            <button
              onClick={() => { setFilterType(""); setFilterSev(""); setFilterStatus(""); }}
              className="text-xs text-gray-500 hover:text-gray-700 underline"
            >
              Clear filters
            </button>
          )}
          <span className="text-xs text-gray-400 ml-auto">
            {filteredAlerts.length} alert{filteredAlerts.length !== 1 ? "s" : ""}
          </span>
        </div>
      )}

      {/* Alert table */}
      <div className="border rounded-lg overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50 text-xs text-gray-500 uppercase">
              <th className="px-3 py-2 w-8"></th>
              <th className="px-3 py-2 text-left">Type</th>
              <th className="px-3 py-2 text-left">Title</th>
              <th className="px-3 py-2 text-left">Variance</th>
              <th className="px-3 py-2 text-left">Status</th>
              <th className="px-3 py-2 text-left w-40">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredAlerts.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-8 text-center text-gray-400 text-sm">
                  No alerts found. Run a reconciliation check to scan for mismatches.
                </td>
              </tr>
            ) : (
              filteredAlerts.map((alert) => (
                <AlertRow key={alert.id} alert={alert} onAction={handleAction} />
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
