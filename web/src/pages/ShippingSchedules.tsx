import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  listShippingSchedules,
  createShippingSchedule,
  updateShippingSchedule,
  deleteShippingSchedule,
  ShippingScheduleSummary,
} from "../api/shippingSchedules";
import { listShippingLines, ShippingLineOut } from "../api/shippingLines";
import { getErrorMessage } from "../api/client";
import { showToast } from "../store/toastStore";
import PageHeader from "../components/PageHeader";
import StatusBadge from "../components/StatusBadge";
import CsvImport from "../components/CsvImport";
import { useTableSort, sortRows, sortableThClass } from "../hooks/useTableSort";

const inputBase =
  "block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:ring-green-500";

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const diff = new Date(dateStr).getTime() - new Date().getTime();
  return Math.ceil(diff / 86_400_000);
}

function CutoffCell({ dateStr }: { dateStr: string | null }) {
  const { t } = useTranslation("shipping");
  if (!dateStr) return <span className="text-gray-400">—</span>;

  const days = daysUntil(dateStr)!;
  const formatted = new Date(dateStr).toLocaleDateString();

  if (days < 0) {
    return (
      <div>
        <span className="text-red-600 font-medium">{formatted}</span>
        <div className="text-xs text-red-500">{t("list.cutoffPassed")}</div>
      </div>
    );
  }
  if (days <= 3) {
    return (
      <div>
        <span className="text-amber-600 font-medium">{formatted}</span>
        <div className="text-xs text-amber-500">
          {t("list.cutoffWarning", { days })}
        </div>
      </div>
    );
  }
  return <span>{formatted}</span>;
}

export default function ShippingSchedules() {
  const { t } = useTranslation("shipping");
  const { sortCol, sortDir, toggleSort, sortIndicator } = useTableSort();

  const [schedules, setSchedules] = useState<ShippingScheduleSummary[]>([]);
  const [shippingLines, setShippingLines] = useState<ShippingLineOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState("");
  const [lineFilter, setLineFilter] = useState("");
  const [search, setSearch] = useState("");

  // Create form
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    shipping_line_id: "" as string,
    shipping_line: "",
    vessel_name: "",
    voyage_number: "",
    port_of_loading: "",
    port_of_discharge: "",
    etd: "",
    eta: "",
    booking_cutoff: "",
    cargo_cutoff: "",
    notes: "",
  });
  const [customLine, setCustomLine] = useState(false);

  // Edit
  const [editId, setEditId] = useState<string | null>(null);
  const [editStatus, setEditStatus] = useState("");

  const loadSchedules = () => {
    setLoading(true);
    const params: Record<string, string> = {};
    if (statusFilter) params.status = statusFilter;
    if (lineFilter) params.shipping_line = lineFilter;
    listShippingSchedules(params)
      .then(setSchedules)
      .catch(() => setError(t("list.loadFailed")))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadSchedules();
  }, [statusFilter, lineFilter]);

  useEffect(() => {
    listShippingLines()
      .then((lines) => setShippingLines(lines.filter((l) => l.is_active)))
      .catch(() => {});
  }, []);

  // Client-side search
  const filtered = schedules.filter((s) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      s.vessel_name.toLowerCase().includes(q) ||
      s.voyage_number.toLowerCase().includes(q) ||
      s.shipping_line.toLowerCase().includes(q) ||
      s.port_of_loading.toLowerCase().includes(q) ||
      s.port_of_discharge.toLowerCase().includes(q)
    );
  });

  const handleCreate = async () => {
    if (!form.shipping_line || !form.vessel_name || !form.voyage_number || !form.etd || !form.eta) {
      showToast("error", t("create.requiredFields"));
      return;
    }
    setCreating(true);
    try {
      await createShippingSchedule({
        shipping_line_id: form.shipping_line_id || undefined,
        shipping_line: form.shipping_line,
        vessel_name: form.vessel_name,
        voyage_number: form.voyage_number,
        port_of_loading: form.port_of_loading,
        port_of_discharge: form.port_of_discharge,
        etd: form.etd,
        eta: form.eta,
        booking_cutoff: form.booking_cutoff || undefined,
        cargo_cutoff: form.cargo_cutoff || undefined,
        notes: form.notes || undefined,
      });
      showToast("success", t("create.created"));
      setShowCreate(false);
      setForm({
        shipping_line_id: "",
        shipping_line: "",
        vessel_name: "",
        voyage_number: "",
        port_of_loading: "",
        port_of_discharge: "",
        etd: "",
        eta: "",
        booking_cutoff: "",
        cargo_cutoff: "",
        notes: "",
      });
      setCustomLine(false);
      loadSchedules();
    } catch (err) {
      showToast("error", getErrorMessage(err));
    } finally {
      setCreating(false);
    }
  };

  const handleStatusUpdate = async (id: string, newStatus: string) => {
    try {
      await updateShippingSchedule(id, { status: newStatus });
      showToast("success", t("list.statusUpdated"));
      setEditId(null);
      loadSchedules();
    } catch (err) {
      showToast("error", getErrorMessage(err));
    }
  };

  const handleDelete = async (id: string, label: string) => {
    if (!confirm(t("list.deleteConfirm", { name: label }))) return;
    try {
      await deleteShippingSchedule(id);
      showToast("success", t("list.deleted"));
      loadSchedules();
    } catch (err) {
      showToast("error", getErrorMessage(err));
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-6 py-8">
      <PageHeader
        title={t("list.title")}
        subtitle={t("list.count", { count: filtered.length })}
        action={
          <button
            onClick={() => setShowCreate(!showCreate)}
            className="px-4 py-2 bg-green-600 text-white rounded-md text-sm hover:bg-green-700"
          >
            {t("list.createSchedule")}
          </button>
        }
      />

      {/* ── Create form ─────────────────────────────────────── */}
      {showCreate && (
        <div className="bg-white border border-gray-200 rounded-lg p-6 mb-6 shadow-sm">
          <h3 className="text-lg font-semibold mb-4">{t("create.title")}</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t("create.shippingLine")} *
              </label>
              {customLine ? (
                <div className="flex gap-2">
                  <input
                    className={inputBase}
                    placeholder={t("create.linePlaceholder")}
                    value={form.shipping_line}
                    onChange={(e) =>
                      setForm({ ...form, shipping_line: e.target.value, shipping_line_id: "" })
                    }
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setCustomLine(false);
                      setForm({ ...form, shipping_line: "", shipping_line_id: "" });
                    }}
                    className="shrink-0 text-xs text-green-600 hover:text-green-800 whitespace-nowrap"
                  >
                    {t("create.backToList", { defaultValue: "Back to list" })}
                  </button>
                </div>
              ) : (
                <select
                  className={inputBase}
                  value={form.shipping_line_id}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === "__other__") {
                      setCustomLine(true);
                      setForm({ ...form, shipping_line: "", shipping_line_id: "" });
                    } else {
                      const line = shippingLines.find((l) => l.id === val);
                      setForm({
                        ...form,
                        shipping_line_id: line?.id ?? "",
                        shipping_line: line?.name ?? "",
                      });
                    }
                  }}
                >
                  <option value="">{t("create.selectLine", { defaultValue: "Select shipping line..." })}</option>
                  {shippingLines.map((line) => (
                    <option key={line.id} value={line.id}>
                      {line.name}
                    </option>
                  ))}
                  <option value="__other__">{t("create.otherLine", { defaultValue: "Other (custom)" })}</option>
                </select>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t("create.vesselName")} *
              </label>
              <input
                className={inputBase}
                placeholder={t("create.vesselPlaceholder")}
                value={form.vessel_name}
                onChange={(e) => setForm({ ...form, vessel_name: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t("create.voyageNumber")} *
              </label>
              <input
                className={inputBase}
                placeholder={t("create.voyagePlaceholder")}
                value={form.voyage_number}
                onChange={(e) => setForm({ ...form, voyage_number: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t("create.portOfLoading")} *
              </label>
              <input
                className={inputBase}
                placeholder={t("create.portLoadPlaceholder")}
                value={form.port_of_loading}
                onChange={(e) => setForm({ ...form, port_of_loading: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t("create.portOfDischarge")} *
              </label>
              <input
                className={inputBase}
                placeholder={t("create.portDischargePlaceholder")}
                value={form.port_of_discharge}
                onChange={(e) => setForm({ ...form, port_of_discharge: e.target.value })}
              />
            </div>
            <div /> {/* spacer */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t("create.etd")} *
              </label>
              <input
                type="date"
                className={inputBase}
                value={form.etd}
                onChange={(e) => setForm({ ...form, etd: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t("create.eta")} *
              </label>
              <input
                type="date"
                className={inputBase}
                value={form.eta}
                onChange={(e) => setForm({ ...form, eta: e.target.value })}
              />
            </div>
            <div /> {/* spacer */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t("create.bookingCutoff")}
              </label>
              <input
                type="date"
                className={inputBase}
                value={form.booking_cutoff}
                onChange={(e) => setForm({ ...form, booking_cutoff: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t("create.cargoCutoff")}
              </label>
              <input
                type="date"
                className={inputBase}
                value={form.cargo_cutoff}
                onChange={(e) => setForm({ ...form, cargo_cutoff: e.target.value })}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t("create.notes")}
              </label>
              <input
                className={inputBase}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
              />
            </div>
          </div>
          <div className="flex gap-3 mt-4">
            <button
              onClick={handleCreate}
              disabled={creating}
              className="px-4 py-2 bg-green-600 text-white rounded-md text-sm hover:bg-green-700 disabled:opacity-50"
            >
              {creating ? t("create.creating") : t("create.createButton")}
            </button>
            <button
              onClick={() => setShowCreate(false)}
              className="px-4 py-2 border border-gray-300 rounded-md text-sm text-gray-700 hover:bg-gray-50"
            >
              {t("create.cancel")}
            </button>
          </div>
        </div>
      )}

      {/* ── CSV import ──────────────────────────────────────── */}
      <div className="mb-6">
        <CsvImport entity="shipping-schedules" label="Sailings" onSuccess={loadSchedules} />
      </div>

      {/* ── Filters ─────────────────────────────────────────── */}
      <div className="flex flex-wrap gap-3 mb-4">
        <select
          className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="">{t("list.allStatuses")}</option>
          <option value="scheduled">{t("list.statusScheduled")}</option>
          <option value="departed">{t("list.statusDeparted")}</option>
          <option value="arrived">{t("list.statusArrived")}</option>
          <option value="cancelled">{t("list.statusCancelled")}</option>
        </select>
        <select
          className="rounded-md border border-gray-300 px-3 py-2 text-sm"
          value={lineFilter}
          onChange={(e) => setLineFilter(e.target.value)}
        >
          <option value="">{t("list.allLines")}</option>
          {shippingLines.map((line) => (
            <option key={line.id} value={line.name}>
              {line.name}
            </option>
          ))}
        </select>
        <input
          type="text"
          className="rounded-md border border-gray-300 px-3 py-2 text-sm flex-1 min-w-[200px]"
          placeholder={t("list.searchPlaceholder")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* ── Table ───────────────────────────────────────────── */}
      {error ? (
        <p className="text-red-600 text-sm">{error}</p>
      ) : loading ? (
        <p className="text-gray-500 text-sm">{t("list.loading")}</p>
      ) : filtered.length === 0 ? (
        <p className="text-gray-500 text-sm">{t("list.empty")}</p>
      ) : (
        <div className="overflow-x-auto bg-white border border-gray-200 rounded-lg shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 text-left">
              <tr>
                <th onClick={() => toggleSort("vessel_name")} className={`px-4 py-3 font-medium ${sortableThClass}`}>{t("list.headers.vessel")}{sortIndicator("vessel_name")}</th>
                <th onClick={() => toggleSort("voyage_number")} className={`px-4 py-3 font-medium ${sortableThClass}`}>{t("list.headers.voyage")}{sortIndicator("voyage_number")}</th>
                <th onClick={() => toggleSort("shipping_line")} className={`px-4 py-3 font-medium ${sortableThClass}`}>{t("list.headers.line")}{sortIndicator("shipping_line")}</th>
                <th onClick={() => toggleSort("port_of_loading")} className={`px-4 py-3 font-medium ${sortableThClass}`}>{t("list.headers.loadingPort")}{sortIndicator("port_of_loading")}</th>
                <th onClick={() => toggleSort("port_of_discharge")} className={`px-4 py-3 font-medium ${sortableThClass}`}>{t("list.headers.dischargePort")}{sortIndicator("port_of_discharge")}</th>
                <th onClick={() => toggleSort("etd")} className={`px-4 py-3 font-medium ${sortableThClass}`}>{t("list.headers.etd")}{sortIndicator("etd")}</th>
                <th onClick={() => toggleSort("eta")} className={`px-4 py-3 font-medium ${sortableThClass}`}>{t("list.headers.eta")}{sortIndicator("eta")}</th>
                <th onClick={() => toggleSort("booking_cutoff")} className={`px-4 py-3 font-medium ${sortableThClass}`}>{t("list.headers.bookingCutoff")}{sortIndicator("booking_cutoff")}</th>
                <th onClick={() => toggleSort("cargo_cutoff")} className={`px-4 py-3 font-medium ${sortableThClass}`}>{t("list.headers.cargoCutoff")}{sortIndicator("cargo_cutoff")}</th>
                <th onClick={() => toggleSort("status")} className={`px-4 py-3 font-medium ${sortableThClass}`}>{t("list.headers.status")}{sortIndicator("status")}</th>
                <th className="px-4 py-3 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sortRows(filtered, sortCol, sortDir, {
                vessel_name: (r) => r.vessel_name,
                voyage_number: (r) => r.voyage_number,
                shipping_line: (r) => r.shipping_line,
                port_of_loading: (r) => r.port_of_loading,
                port_of_discharge: (r) => r.port_of_discharge,
                etd: (r) => r.etd,
                eta: (r) => r.eta,
                booking_cutoff: (r) => r.booking_cutoff,
                cargo_cutoff: (r) => r.cargo_cutoff,
                status: (r) => r.status,
              }).map((s) => (
                <tr key={s.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2 font-medium">{s.vessel_name}</td>
                  <td className="px-4 py-2 text-gray-600">{s.voyage_number}</td>
                  <td className="px-4 py-2">{s.shipping_line_name ?? s.shipping_line}</td>
                  <td className="px-4 py-2">{s.port_of_loading}</td>
                  <td className="px-4 py-2">{s.port_of_discharge}</td>
                  <td className="px-4 py-2">{new Date(s.etd).toLocaleDateString()}</td>
                  <td className="px-4 py-2">{new Date(s.eta).toLocaleDateString()}</td>
                  <td className="px-4 py-2">
                    <CutoffCell dateStr={s.booking_cutoff} />
                  </td>
                  <td className="px-4 py-2">
                    <CutoffCell dateStr={s.cargo_cutoff} />
                  </td>
                  <td className="px-4 py-2">
                    {editId === s.id ? (
                      <select
                        className="rounded border border-gray-300 px-2 py-1 text-xs"
                        value={editStatus}
                        onChange={(e) => {
                          handleStatusUpdate(s.id, e.target.value);
                        }}
                      >
                        <option value="scheduled">Scheduled</option>
                        <option value="departed">Departed</option>
                        <option value="arrived">Arrived</option>
                        <option value="cancelled">Cancelled</option>
                      </select>
                    ) : (
                      <button
                        onClick={() => {
                          setEditId(s.id);
                          setEditStatus(s.status);
                        }}
                        title={t("list.clickToChangeStatus")}
                      >
                        <StatusBadge status={s.status} />
                      </button>
                    )}
                  </td>
                  <td className="px-4 py-2">
                    <button
                      onClick={() =>
                        handleDelete(s.id, `${s.vessel_name} ${s.voyage_number}`)
                      }
                      className="text-red-500 hover:text-red-700 text-xs"
                    >
                      {t("list.delete")}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
