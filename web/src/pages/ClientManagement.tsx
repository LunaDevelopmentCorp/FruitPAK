import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  listClients,
  createClient,
  updateClient,
  deleteClient,
  ClientSummary,
  ClientCreate,
  ClientUpdate,
} from "../api/clients";
import { getErrorMessage } from "../api/client";
import { CURRENCIES, formatCurrency } from "../constants/currencies";
import { useTableSort, sortRows, sortableThClass } from "../hooks/useTableSort";
import { showToast } from "../store/toastStore";
import CsvImport from "../components/CsvImport";
import PageHeader from "../components/PageHeader";
import StatusBadge from "../components/StatusBadge";

const INCOTERMS = ["FOB", "CIF", "CFR", "EXW", "DDP"] as const;

export default function ClientManagement() {
  const { t } = useTranslation("clients");
  const [clients, setClients] = useState<ClientSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingClient, setEditingClient] = useState<ClientSummary | null>(null);
  const [formData, setFormData] = useState<{
    name: string;
    contact_person: string;
    email: string;
    phone: string;
    address: string;
    country: string;
    incoterm: string;
    payment_terms_days: string;
    currency: string;
    credit_limit: string;
    notes: string;
  }>({
    name: "",
    contact_person: "",
    email: "",
    phone: "",
    address: "",
    country: "",
    incoterm: "",
    payment_terms_days: "",
    currency: "",
    credit_limit: "",
    notes: "",
  });
  const [saving, setSaving] = useState(false);

  const { sortCol, sortDir, toggleSort, sortIndicator } = useTableSort();

  // Confirm deactivate/activate
  const [confirmToggle, setConfirmToggle] = useState<ClientSummary | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const clientList = await listClients();
      setClients(clientList);
    } catch {
      setError(t("loadFailed"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const openCreate = () => {
    setEditingClient(null);
    setFormData({
      name: "",
      contact_person: "",
      email: "",
      phone: "",
      address: "",
      country: "",
      incoterm: "",
      payment_terms_days: "",
      currency: "",
      credit_limit: "",
      notes: "",
    });
    setShowModal(true);
  };

  const openEdit = (c: ClientSummary) => {
    setEditingClient(c);
    setFormData({
      name: c.name,
      contact_person: c.contact_person || "",
      email: c.email || "",
      phone: c.phone || "",
      address: c.address || "",
      country: c.country || "",
      incoterm: c.incoterm || "",
      payment_terms_days: c.payment_terms_days != null ? String(c.payment_terms_days) : "",
      currency: c.currency || "",
      credit_limit: c.credit_limit != null ? String(c.credit_limit) : "",
      notes: c.notes || "",
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (editingClient) {
        const payload: ClientUpdate = {};
        if (formData.name !== editingClient.name) payload.name = formData.name;
        if (formData.contact_person !== (editingClient.contact_person || ""))
          payload.contact_person = formData.contact_person || undefined;
        if (formData.email !== (editingClient.email || ""))
          payload.email = formData.email || undefined;
        if (formData.phone !== (editingClient.phone || ""))
          payload.phone = formData.phone || undefined;
        if (formData.address !== (editingClient.address || ""))
          payload.address = formData.address || undefined;
        if (formData.country !== (editingClient.country || ""))
          payload.country = formData.country || undefined;
        if (formData.incoterm !== (editingClient.incoterm || ""))
          payload.incoterm = formData.incoterm || undefined;
        const newPTD = formData.payment_terms_days ? Number(formData.payment_terms_days) : undefined;
        if (newPTD !== (editingClient.payment_terms_days ?? undefined))
          payload.payment_terms_days = newPTD;
        if (formData.currency !== (editingClient.currency || ""))
          payload.currency = formData.currency || undefined;
        const newCL = formData.credit_limit ? Number(formData.credit_limit) : undefined;
        if (newCL !== (editingClient.credit_limit ?? undefined))
          payload.credit_limit = newCL;
        if (formData.notes !== (editingClient.notes || ""))
          payload.notes = formData.notes || undefined;

        if (Object.keys(payload).length === 0) {
          setShowModal(false);
          return;
        }
        await updateClient(editingClient.id, payload);
        showToast("success", t("toast.updated", { name: formData.name }));
      } else {
        const payload: ClientCreate = {
          name: formData.name,
        };
        if (formData.contact_person) payload.contact_person = formData.contact_person;
        if (formData.email) payload.email = formData.email;
        if (formData.phone) payload.phone = formData.phone;
        if (formData.address) payload.address = formData.address;
        if (formData.country) payload.country = formData.country;
        if (formData.incoterm) payload.incoterm = formData.incoterm;
        if (formData.payment_terms_days) payload.payment_terms_days = Number(formData.payment_terms_days);
        if (formData.currency) payload.currency = formData.currency;
        if (formData.credit_limit) payload.credit_limit = Number(formData.credit_limit);
        if (formData.notes) payload.notes = formData.notes;
        await createClient(payload);
        showToast("success", t("toast.created", { name: formData.name }));
      }
      setShowModal(false);
      await fetchData();
    } catch (err: unknown) {
      showToast("error", getErrorMessage(err, t("saveFailed")));
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async () => {
    if (!confirmToggle) return;
    const c = confirmToggle;
    setConfirmToggle(null);
    try {
      await deleteClient(c.id);
      showToast(
        "success",
        c.is_active
          ? `${t("common:actions.deactivate")} ${c.name}`
          : `${t("common:actions.reactivate")} ${c.name}`,
      );
      await fetchData();
    } catch (err: unknown) {
      showToast("error", getErrorMessage(err, t("statusFailed")));
    }
  };

  if (loading) return <p className="text-gray-400 text-sm">{t("loading")}</p>;
  if (error) return <p className="text-red-600 text-sm">{error}</p>;

  return (
    <div>
      <PageHeader
        title={t("title")}
        subtitle={t("count", { count: clients.length })}
        action={
          <button
            onClick={openCreate}
            className="bg-green-600 text-white text-sm px-4 py-2 rounded font-medium hover:bg-green-700"
          >
            {t("newClient")}
          </button>
        }
      />

      <CsvImport entity="clients" label="Clients" onSuccess={fetchData} />

      <div className="mt-4 bg-white border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <th onClick={() => toggleSort("name")} className={`text-left px-4 py-2 font-medium ${sortableThClass}`}>{t("headers.name")}{sortIndicator("name")}</th>
              <th onClick={() => toggleSort("contact_person")} className={`text-left px-4 py-2 font-medium ${sortableThClass}`}>{t("headers.contact")}{sortIndicator("contact_person")}</th>
              <th onClick={() => toggleSort("email")} className={`text-left px-4 py-2 font-medium ${sortableThClass}`}>{t("headers.email")}{sortIndicator("email")}</th>
              <th onClick={() => toggleSort("phone")} className={`text-left px-4 py-2 font-medium ${sortableThClass}`}>{t("headers.phone")}{sortIndicator("phone")}</th>
              <th onClick={() => toggleSort("country")} className={`text-left px-4 py-2 font-medium ${sortableThClass}`}>{t("headers.country")}{sortIndicator("country")}</th>
              <th onClick={() => toggleSort("incoterm")} className={`text-left px-4 py-2 font-medium ${sortableThClass}`}>{t("headers.incoterm")}{sortIndicator("incoterm")}</th>
              <th onClick={() => toggleSort("payment_terms")} className={`text-left px-4 py-2 font-medium ${sortableThClass}`}>{t("headers.paymentTerms")}{sortIndicator("payment_terms")}</th>
              <th onClick={() => toggleSort("credit_limit")} className={`text-left px-4 py-2 font-medium ${sortableThClass}`}>{t("headers.creditLimit")}{sortIndicator("credit_limit")}</th>
              <th onClick={() => toggleSort("status")} className={`text-left px-4 py-2 font-medium ${sortableThClass}`}>{t("headers.status")}{sortIndicator("status")}</th>
              <th className="px-4 py-2 font-medium" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {sortRows(clients, sortCol, sortDir, {
              name: (c) => c.name,
              contact_person: (c) => c.contact_person || "",
              email: (c) => c.email || "",
              phone: (c) => c.phone || "",
              country: (c) => c.country || "",
              incoterm: (c) => c.incoterm || "",
              payment_terms: (c) => c.payment_terms_days ?? -1,
              credit_limit: (c) => c.credit_limit ?? -1,
              status: (c) => (c.is_active ? "active" : "inactive"),
            }).map((c) => (
              <tr key={c.id} className={`hover:bg-green-50/50 even:bg-gray-50/50 ${!c.is_active ? "opacity-50" : ""}`}>
                <td className="px-4 py-2 font-medium text-gray-800">{c.name}</td>
                <td className="px-4 py-2 text-gray-600">{c.contact_person || "\u2014"}</td>
                <td className="px-4 py-2 text-gray-600">{c.email || "\u2014"}</td>
                <td className="px-4 py-2 text-gray-500">{c.phone || "\u2014"}</td>
                <td className="px-4 py-2 text-gray-500">{c.country || "\u2014"}</td>
                <td className="px-4 py-2 text-gray-500">{c.incoterm || "\u2014"}</td>
                <td className="px-4 py-2 text-gray-500">
                  {c.payment_terms_days != null ? `${c.payment_terms_days} ${t("days")}` : "\u2014"}
                </td>
                <td className="px-4 py-2 text-gray-500">
                  {formatCurrency(c.credit_limit, c.currency || "USD")}
                </td>
                <td className="px-4 py-2">
                  <StatusBadge status={c.is_active ? "active" : "inactive"} />
                </td>
                <td className="px-4 py-2 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={() => openEdit(c)}
                      className="text-xs text-blue-600 hover:underline"
                    >
                      {t("common:actions.edit")}
                    </button>
                    <button
                      onClick={() => setConfirmToggle(c)}
                      className={`text-xs ${
                        c.is_active
                          ? "text-red-500 hover:underline"
                          : "text-green-600 hover:underline"
                      }`}
                    >
                      {c.is_active ? t("common:actions.deactivate") : t("common:actions.activate")}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Create / Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">
              {editingClient ? t("modal.editTitle") : t("modal.newTitle")}
            </h3>

            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">{t("modal.name")}</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))}
                  className="border rounded px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-1">{t("modal.contactPerson")}</label>
                <input
                  type="text"
                  value={formData.contact_person}
                  onChange={(e) => setFormData((p) => ({ ...p, contact_person: e.target.value }))}
                  className="border rounded px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-1">{t("modal.email")}</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData((p) => ({ ...p, email: e.target.value }))}
                  className="border rounded px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-1">{t("modal.phone")}</label>
                <input
                  type="text"
                  value={formData.phone}
                  onChange={(e) => setFormData((p) => ({ ...p, phone: e.target.value }))}
                  className="border rounded px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-1">{t("modal.address")}</label>
                <textarea
                  value={formData.address}
                  onChange={(e) => setFormData((p) => ({ ...p, address: e.target.value }))}
                  rows={2}
                  className="border rounded px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-1">{t("modal.country")}</label>
                <input
                  type="text"
                  value={formData.country}
                  onChange={(e) => setFormData((p) => ({ ...p, country: e.target.value }))}
                  className="border rounded px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-1">{t("modal.incoterm")}</label>
                <select
                  value={formData.incoterm}
                  onChange={(e) => setFormData((p) => ({ ...p, incoterm: e.target.value }))}
                  className="border rounded px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-green-500"
                >
                  <option value="">{t("modal.selectIncoterm")}</option>
                  {INCOTERMS.map((term) => (
                    <option key={term} value={term}>
                      {term}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-1">{t("modal.paymentTerms")}</label>
                <input
                  type="number"
                  min={0}
                  value={formData.payment_terms_days}
                  onChange={(e) => setFormData((p) => ({ ...p, payment_terms_days: e.target.value }))}
                  className="border rounded px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-1">{t("modal.currency")}</label>
                <select
                  value={formData.currency}
                  onChange={(e) => setFormData((p) => ({ ...p, currency: e.target.value }))}
                  className="border rounded px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-green-500"
                >
                  <option value="">{t("modal.selectIncoterm")}</option>
                  {CURRENCIES.map((c) => (
                    <option key={c.code} value={c.code}>
                      {c.code} ({c.name})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-1">{t("modal.creditLimit")}</label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={formData.credit_limit}
                  onChange={(e) => setFormData((p) => ({ ...p, credit_limit: e.target.value }))}
                  className="border rounded px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-1">{t("modal.notes")}</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData((p) => ({ ...p, notes: e.target.value }))}
                  rows={3}
                  className="border rounded px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-5">
              <button
                onClick={() => setShowModal(false)}
                className="flex-1 border rounded px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
              >
                {t("common:actions.cancel")}
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !formData.name}
                className="flex-1 bg-green-600 text-white rounded px-4 py-2 text-sm font-medium hover:bg-green-700 disabled:opacity-50"
              >
                {saving ? t("common:actions.saving") : editingClient ? t("modal.saveChanges") : t("modal.createClient")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toggle active confirmation modal */}
      {confirmToggle && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
            <h3
              className={`text-lg font-semibold mb-2 ${
                confirmToggle.is_active ? "text-red-700" : "text-green-700"
              }`}
            >
              {confirmToggle.is_active ? t("confirm.deactivateTitle") : t("confirm.reactivateTitle")}
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              {confirmToggle.is_active
                ? t("confirm.deactivateText", { name: confirmToggle.name })
                : t("confirm.reactivateText", { name: confirmToggle.name })}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmToggle(null)}
                className="flex-1 border rounded px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
              >
                {t("common:actions.cancel")}
              </button>
              <button
                onClick={handleToggleActive}
                className={`flex-1 text-white rounded px-4 py-2 text-sm font-medium ${
                  confirmToggle.is_active
                    ? "bg-red-600 hover:bg-red-700"
                    : "bg-green-600 hover:bg-green-700"
                }`}
              >
                {confirmToggle.is_active ? t("common:actions.deactivate") : t("common:actions.reactivate")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
