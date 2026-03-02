import { Fragment, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  listShippingSchedules,
  createShippingSchedule,
  updateShippingSchedule,
  deleteShippingSchedule,
  ShippingScheduleSummary,
} from "../api/shippingSchedules";
import {
  listShippingLines,
  createShippingLine,
  updateShippingLine,
  deleteShippingLine,
  ShippingLineOut,
} from "../api/shippingLines";
import {
  listTransporters,
  createTransporter,
  updateTransporter,
  deleteTransporter,
  TransporterOut,
} from "../api/transporters";
import {
  listShippingAgents,
  createShippingAgent,
  updateShippingAgent,
  deleteShippingAgent,
  ShippingAgentOut,
} from "../api/shippingAgents";
import api, { getErrorMessage } from "../api/client";
import { showToast } from "../store/toastStore";
import PageHeader from "../components/PageHeader";
import StatusBadge from "../components/StatusBadge";
import CsvImport from "../components/CsvImport";
import { useTableSort, sortRows, sortableThClass } from "../hooks/useTableSort";

const inputBase =
  "block w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-green-500 focus:ring-green-500";

const inputCompact =
  "w-full border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500";

// ── Shared logistics entity type ──────────────────────────────────
interface LogisticsEntity {
  id: string;
  name: string;
  code: string;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
}

interface LogisticsCreatePayload {
  name: string;
  code: string;
  contact_person?: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
}

interface LogisticsUpdatePayload {
  name?: string;
  code?: string;
  contact_person?: string;
  phone?: string;
  email?: string;
  address?: string;
  notes?: string;
}

interface LogisticsSectionProps {
  title: string;
  items: LogisticsEntity[];
  loading: boolean;
  onReload: () => void;
  onCreate: (payload: LogisticsCreatePayload) => Promise<LogisticsEntity>;
  onUpdate: (id: string, payload: LogisticsUpdatePayload) => Promise<LogisticsEntity>;
  onDelete: (id: string) => Promise<unknown>;
  onToggleActive: (id: string, active: boolean) => Promise<LogisticsEntity>;
}

// ── Edit row panel ────────────────────────────────────────────────
function LogisticsEditRow({
  item,
  onSave,
  onCancel,
  onDelete,
  onToggleActive,
}: {
  item: LogisticsEntity;
  onSave: (updated: LogisticsEntity) => void;
  onCancel: () => void;
  onDelete: (id: string) => void;
  onToggleActive: (id: string, active: boolean) => void;
}) {
  const { t } = useTranslation("shipping");
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: item.name,
    code: item.code,
    contact_person: item.contact_person || "",
    phone: item.phone || "",
    email: item.email || "",
    address: item.address || "",
    notes: item.notes || "",
  });

  return (
    <tr>
      <td colSpan={8} className="px-4 py-4 bg-green-50/30 border-t border-b border-green-200">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              {t("logistics.form.name", { defaultValue: "Name" })} *
            </label>
            <input
              className={inputCompact}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              {t("logistics.form.code", { defaultValue: "Code" })} *
            </label>
            <input
              className={inputCompact}
              value={form.code}
              onChange={(e) => setForm({ ...form, code: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              {t("logistics.form.contactPerson", { defaultValue: "Contact Person" })}
            </label>
            <input
              className={inputCompact}
              value={form.contact_person}
              onChange={(e) => setForm({ ...form, contact_person: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              {t("logistics.form.phone", { defaultValue: "Phone" })}
            </label>
            <input
              className={inputCompact}
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              {t("logistics.form.email", { defaultValue: "Email" })}
            </label>
            <input
              className={inputCompact}
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              {t("logistics.form.address", { defaultValue: "Address" })}
            </label>
            <input
              className={inputCompact}
              value={form.address}
              onChange={(e) => setForm({ ...form, address: e.target.value })}
            />
          </div>
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-gray-600 mb-1">
              {t("logistics.form.notes", { defaultValue: "Notes" })}
            </label>
            <input
              className={inputCompact}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </div>
        </div>
        <div className="flex gap-2 items-center mt-3">
          <button
            disabled={saving}
            onClick={async () => {
              if (!form.name.trim() || !form.code.trim()) {
                showToast("error", t("logistics.form.requiredFields", { defaultValue: "Name and code are required." }));
                return;
              }
              setSaving(true);
              try {
                onSave({
                  ...item,
                  name: form.name.trim(),
                  code: form.code.trim(),
                  contact_person: form.contact_person.trim() || null,
                  phone: form.phone.trim() || null,
                  email: form.email.trim() || null,
                  address: form.address.trim() || null,
                  notes: form.notes.trim() || null,
                });
              } finally {
                setSaving(false);
              }
            }}
            className="px-4 py-1.5 text-sm bg-green-600 text-white rounded font-medium hover:bg-green-700 disabled:opacity-50"
          >
            {saving
              ? t("logistics.form.saving", { defaultValue: "Saving..." })
              : t("logistics.form.save", { defaultValue: "Save" })}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-1.5 text-sm border rounded font-medium hover:bg-gray-50"
          >
            {t("logistics.form.cancel", { defaultValue: "Cancel" })}
          </button>
          <button
            type="button"
            onClick={() => onToggleActive(item.id, !item.is_active)}
            className={`px-4 py-1.5 text-sm border rounded font-medium ${
              item.is_active
                ? "text-amber-600 border-amber-200 hover:bg-amber-50"
                : "text-green-600 border-green-200 hover:bg-green-50"
            }`}
          >
            {item.is_active
              ? t("logistics.inactive", { defaultValue: "Deactivate" })
              : t("logistics.active", { defaultValue: "Activate" })}
          </button>
          <div className="flex-1" />
          <button
            type="button"
            onClick={() => {
              if (window.confirm(t("logistics.deleteConfirm", { name: item.name, defaultValue: `Delete "${item.name}"? This cannot be undone.` }))) {
                onDelete(item.id);
              }
            }}
            className="px-4 py-1.5 text-sm text-red-600 border border-red-200 rounded font-medium hover:bg-red-50"
          >
            {t("logistics.delete", { defaultValue: "Delete" })}
          </button>
        </div>
      </td>
    </tr>
  );
}

// ── Collapsible logistics section ─────────────────────────────────
function LogisticsSection({
  title,
  items,
  loading,
  onReload,
  onCreate,
  onUpdate,
  onDelete,
  onToggleActive,
}: LogisticsSectionProps) {
  const { t } = useTranslation("shipping");
  const [expanded, setExpanded] = useState(false);
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: "",
    code: "",
    contact_person: "",
    phone: "",
    email: "",
    address: "",
    notes: "",
  });

  const { sortCol, sortDir, toggleSort, sortIndicator } = useTableSort();

  const filtered = useMemo(() => {
    const rows = items.filter((item) => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        item.name.toLowerCase().includes(q) ||
        item.code.toLowerCase().includes(q) ||
        (item.contact_person || "").toLowerCase().includes(q) ||
        (item.email || "").toLowerCase().includes(q)
      );
    });
    return sortRows(rows, sortCol, sortDir, {
      name: (r) => r.name,
      code: (r) => r.code,
      contact_person: (r) => r.contact_person,
      phone: (r) => r.phone,
      email: (r) => r.email,
      is_active: (r) => (r.is_active ? 1 : 0),
    });
  }, [items, search, sortCol, sortDir]);

  const resetCreateForm = () => {
    setCreateForm({ name: "", code: "", contact_person: "", phone: "", email: "", address: "", notes: "" });
  };

  const handleCreate = async () => {
    if (!createForm.name.trim() || !createForm.code.trim()) {
      showToast("error", t("logistics.form.requiredFields", { defaultValue: "Name and code are required." }));
      return;
    }
    setCreating(true);
    try {
      await onCreate({
        name: createForm.name.trim(),
        code: createForm.code.trim(),
        contact_person: createForm.contact_person.trim() || undefined,
        phone: createForm.phone.trim() || undefined,
        email: createForm.email.trim() || undefined,
        address: createForm.address.trim() || undefined,
        notes: createForm.notes.trim() || undefined,
      });
      showToast("success", t("logistics.created", { defaultValue: "Record created." }));
      resetCreateForm();
      setShowCreate(false);
      onReload();
    } catch (err) {
      showToast("error", getErrorMessage(err, t("logistics.createFailed", { defaultValue: "Failed to create record." })));
    } finally {
      setCreating(false);
    }
  };

  const handleSave = async (merged: LogisticsEntity) => {
    try {
      await onUpdate(merged.id, {
        name: merged.name,
        code: merged.code,
        contact_person: merged.contact_person || undefined,
        phone: merged.phone || undefined,
        email: merged.email || undefined,
        address: merged.address || undefined,
        notes: merged.notes || undefined,
      });
      showToast("success", t("logistics.updated", { defaultValue: "Record updated." }));
      setEditingId(null);
      onReload();
    } catch (err) {
      showToast("error", getErrorMessage(err, t("logistics.updateFailed", { defaultValue: "Failed to update record." })));
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await onDelete(id);
      showToast("success", t("logistics.deleted", { defaultValue: "Record deleted." }));
      setEditingId(null);
      onReload();
    } catch (err) {
      showToast("error", getErrorMessage(err, t("logistics.deleteFailed", { defaultValue: "Failed to delete record." })));
    }
  };

  const handleToggleActive = async (id: string, active: boolean) => {
    try {
      await onToggleActive(id, active);
      showToast("success", t("logistics.updated", { defaultValue: "Record updated." }));
      setEditingId(null);
      onReload();
    } catch (err) {
      showToast("error", getErrorMessage(err, t("logistics.updateFailed", { defaultValue: "Failed to update record." })));
    }
  };

  return (
    <section className="border border-gray-200 rounded-lg bg-white shadow-sm overflow-hidden">
      {/* Collapsible header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-6 py-4 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span className="text-gray-400 text-sm select-none">{expanded ? "\u25BC" : "\u25B6"}</span>
          <h3 className="text-lg font-semibold text-gray-800">{title}</h3>
          <span className="text-xs text-gray-400 bg-gray-100 rounded-full px-2 py-0.5">
            {items.length}
          </span>
        </div>
      </button>

      {expanded && (
        <div className="px-6 pb-6 space-y-4">
          {/* Toolbar: search + add button */}
          <div className="flex flex-wrap items-center gap-3">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("logistics.search", { defaultValue: "Search by name, code, or contact..." })}
              className="border rounded-lg px-3 py-1.5 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-green-500"
            />
            <button
              onClick={() => {
                resetCreateForm();
                setShowCreate(!showCreate);
              }}
              className="px-4 py-1.5 bg-green-600 text-white rounded-md text-sm hover:bg-green-700"
            >
              {t("logistics.add", { defaultValue: "+ Add" })}
            </button>
            {search && (
              <button
                onClick={() => setSearch("")}
                className="text-xs text-blue-600 hover:underline"
              >
                Clear
              </button>
            )}
          </div>

          {/* Inline create form */}
          {showCreate && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    {t("logistics.form.name", { defaultValue: "Name" })} *
                  </label>
                  <input
                    className={inputCompact}
                    placeholder={t("logistics.form.namePlaceholder", { defaultValue: "e.g. Maersk" })}
                    value={createForm.name}
                    onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    {t("logistics.form.code", { defaultValue: "Code" })} *
                  </label>
                  <input
                    className={inputCompact}
                    placeholder={t("logistics.form.codePlaceholder", { defaultValue: "e.g. MAER" })}
                    value={createForm.code}
                    onChange={(e) => setCreateForm({ ...createForm, code: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    {t("logistics.form.contactPerson", { defaultValue: "Contact Person" })}
                  </label>
                  <input
                    className={inputCompact}
                    value={createForm.contact_person}
                    onChange={(e) => setCreateForm({ ...createForm, contact_person: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    {t("logistics.form.phone", { defaultValue: "Phone" })}
                  </label>
                  <input
                    className={inputCompact}
                    value={createForm.phone}
                    onChange={(e) => setCreateForm({ ...createForm, phone: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    {t("logistics.form.email", { defaultValue: "Email" })}
                  </label>
                  <input
                    className={inputCompact}
                    type="email"
                    value={createForm.email}
                    onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    {t("logistics.form.address", { defaultValue: "Address" })}
                  </label>
                  <input
                    className={inputCompact}
                    value={createForm.address}
                    onChange={(e) => setCreateForm({ ...createForm, address: e.target.value })}
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    {t("logistics.form.notes", { defaultValue: "Notes" })}
                  </label>
                  <input
                    className={inputCompact}
                    value={createForm.notes}
                    onChange={(e) => setCreateForm({ ...createForm, notes: e.target.value })}
                  />
                </div>
              </div>
              <div className="flex gap-3 mt-3">
                <button
                  onClick={handleCreate}
                  disabled={creating}
                  className="px-4 py-1.5 bg-green-600 text-white rounded-md text-sm hover:bg-green-700 disabled:opacity-50"
                >
                  {creating
                    ? t("logistics.form.saving", { defaultValue: "Saving..." })
                    : t("logistics.form.save", { defaultValue: "Save" })}
                </button>
                <button
                  onClick={() => setShowCreate(false)}
                  className="px-4 py-1.5 border border-gray-300 rounded-md text-sm text-gray-700 hover:bg-gray-50"
                >
                  {t("logistics.form.cancel", { defaultValue: "Cancel" })}
                </button>
              </div>
            </div>
          )}

          {/* Table */}
          {loading ? (
            <p className="text-gray-400 text-sm">{t("logistics.loading", { defaultValue: "Loading..." })}</p>
          ) : items.length === 0 ? (
            <p className="text-gray-400 text-sm">{t("logistics.empty", { defaultValue: "No records yet. Add one to get started." })}</p>
          ) : filtered.length === 0 ? (
            <p className="text-gray-400 text-sm">{t("logistics.noMatch", { defaultValue: "No records match your search." })}</p>
          ) : (
            <div className="overflow-x-auto border border-gray-200 rounded-lg">
              <table className="w-full text-sm whitespace-nowrap">
                <thead className="bg-gray-50 text-gray-600 select-none">
                  <tr>
                    <th className={`text-left px-4 py-2 font-medium ${sortableThClass}`} onClick={() => toggleSort("name")}>
                      {t("logistics.headers.name", { defaultValue: "Name" })}{sortIndicator("name")}
                    </th>
                    <th className={`text-left px-4 py-2 font-medium ${sortableThClass}`} onClick={() => toggleSort("code")}>
                      {t("logistics.headers.code", { defaultValue: "Code" })}{sortIndicator("code")}
                    </th>
                    <th className={`text-left px-4 py-2 font-medium ${sortableThClass}`} onClick={() => toggleSort("contact_person")}>
                      {t("logistics.headers.contact", { defaultValue: "Contact Person" })}{sortIndicator("contact_person")}
                    </th>
                    <th className={`text-left px-4 py-2 font-medium ${sortableThClass}`} onClick={() => toggleSort("phone")}>
                      {t("logistics.headers.phone", { defaultValue: "Phone" })}{sortIndicator("phone")}
                    </th>
                    <th className={`text-left px-4 py-2 font-medium ${sortableThClass}`} onClick={() => toggleSort("email")}>
                      {t("logistics.headers.email", { defaultValue: "Email" })}{sortIndicator("email")}
                    </th>
                    <th className={`text-center px-4 py-2 font-medium ${sortableThClass}`} onClick={() => toggleSort("is_active")}>
                      {t("logistics.headers.status", { defaultValue: "Status" })}{sortIndicator("is_active")}
                    </th>
                    <th className="px-4 py-2 font-medium" />
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filtered.map((item) => (
                    <Fragment key={item.id}>
                      <tr
                        onClick={() => setEditingId(editingId === item.id ? null : item.id)}
                        className={`cursor-pointer ${
                          editingId === item.id
                            ? "bg-green-50"
                            : "hover:bg-green-50/50 even:bg-gray-50/50"
                        }`}
                      >
                        <td className="px-4 py-2 font-medium">{item.name}</td>
                        <td className="px-4 py-2 text-gray-500 font-mono text-xs">{item.code}</td>
                        <td className="px-4 py-2 text-gray-500">{item.contact_person || "\u2014"}</td>
                        <td className="px-4 py-2 text-gray-500">{item.phone || "\u2014"}</td>
                        <td className="px-4 py-2 text-gray-500">{item.email || "\u2014"}</td>
                        <td className="px-4 py-2 text-center">
                          {item.is_active ? (
                            <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                              {t("logistics.active", { defaultValue: "Active" })}
                            </span>
                          ) : (
                            <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
                              {t("logistics.inactive", { defaultValue: "Inactive" })}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-2 text-right">
                          <span className="text-xs text-gray-400">
                            {editingId === item.id ? "Click to collapse" : "Click to edit"}
                          </span>
                        </td>
                      </tr>
                      {editingId === item.id && (
                        <LogisticsEditRow
                          key={`edit-${item.id}`}
                          item={item}
                          onSave={handleSave}
                          onCancel={() => setEditingId(null)}
                          onDelete={handleDelete}
                          onToggleActive={handleToggleActive}
                        />
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </section>
  );
}

// ── Helpers ───────────────────────────────────────────────────────

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const diff = new Date(dateStr).getTime() - new Date().getTime();
  return Math.ceil(diff / 86_400_000);
}

function CutoffCell({ dateStr }: { dateStr: string | null }) {
  const { t } = useTranslation("shipping");
  if (!dateStr) return <span className="text-gray-400">{"\u2014"}</span>;

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

// ── Main page component ──────────────────────────────────────────

export default function ShippingSchedules() {
  const { t } = useTranslation("shipping");
  const { sortCol, sortDir, toggleSort, sortIndicator } = useTableSort();

  const [schedules, setSchedules] = useState<ShippingScheduleSummary[]>([]);
  const [shippingLines, setShippingLines] = useState<ShippingLineOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Logistics entity state
  const [allShippingLines, setAllShippingLines] = useState<ShippingLineOut[]>([]);
  const [transporters, setTransporters] = useState<TransporterOut[]>([]);
  const [shippingAgents, setShippingAgents] = useState<ShippingAgentOut[]>([]);
  const [logisticsLoading, setLogisticsLoading] = useState(true);

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

  const loadLogistics = () => {
    setLogisticsLoading(true);
    Promise.all([listShippingLines(), listTransporters(), listShippingAgents()])
      .then(([lines, trans, agents]) => {
        setAllShippingLines(lines);
        setShippingLines(lines.filter((l) => l.is_active));
        setTransporters(trans);
        setShippingAgents(agents);
      })
      .catch(() => {})
      .finally(() => setLogisticsLoading(false));
  };

  useEffect(() => {
    loadSchedules();
  }, [statusFilter, lineFilter]);

  useEffect(() => {
    loadLogistics();
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

  // Toggle active helpers for each entity type (backend uses PATCH with is_active)
  const toggleShippingLineActive = async (id: string, active: boolean) => {
    const { data } = await api.patch<ShippingLineOut>(`/shipping-lines/${id}`, { is_active: active });
    return data;
  };
  const toggleTransporterActive = async (id: string, active: boolean) => {
    const { data } = await api.patch<TransporterOut>(`/transporters/${id}`, { is_active: active });
    return data;
  };
  const toggleShippingAgentActive = async (id: string, active: boolean) => {
    const { data } = await api.patch<ShippingAgentOut>(`/shipping-agents/${id}`, { is_active: active });
    return data;
  };

  return (
    <div className="max-w-7xl mx-auto px-6 py-8 space-y-8">
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

      {/* ── Schedules Table ──────────────────────────────────── */}
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

      {/* ── Logistics Management Sections ────────────────────── */}
      <div className="space-y-4 pt-4">
        <h2 className="text-lg font-semibold text-gray-800">
          {t("logistics.sectionTitle", { defaultValue: "Logistics Partners" })}
        </h2>

        <LogisticsSection
          title={t("logistics.shippingLines", { defaultValue: "Shipping Lines" })}
          items={allShippingLines}
          loading={logisticsLoading}
          onReload={loadLogistics}
          onCreate={createShippingLine}
          onUpdate={updateShippingLine}
          onDelete={deleteShippingLine}
          onToggleActive={toggleShippingLineActive}
        />

        <LogisticsSection
          title={t("logistics.transporters", { defaultValue: "Transporters" })}
          items={transporters}
          loading={logisticsLoading}
          onReload={loadLogistics}
          onCreate={createTransporter}
          onUpdate={updateTransporter}
          onDelete={deleteTransporter}
          onToggleActive={toggleTransporterActive}
        />

        <LogisticsSection
          title={t("logistics.shippingAgents", { defaultValue: "Shipping Agents" })}
          items={shippingAgents}
          loading={logisticsLoading}
          onReload={loadLogistics}
          onCreate={createShippingAgent}
          onUpdate={updateShippingAgent}
          onDelete={deleteShippingAgent}
          onToggleActive={toggleShippingAgentActive}
        />
      </div>
    </div>
  );
}
