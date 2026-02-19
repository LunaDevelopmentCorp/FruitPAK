import { useEffect, useState } from "react";
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
import { showToast } from "../store/toastStore";

const INCOTERMS = ["FOB", "CIF", "CFR", "EXW", "DDP"] as const;
const CURRENCIES = ["USD", "EUR", "GBP", "ZAR"] as const;

const CURRENCY_SYMBOLS: Record<string, string> = {
  USD: "$",
  EUR: "\u20AC",
  GBP: "\u00A3",
  ZAR: "R",
};

function formatCurrency(amount: number | null, currency: string | null): string {
  if (amount == null) return "\u2014";
  const symbol = CURRENCY_SYMBOLS[currency || "USD"] || "$";
  return `${symbol}${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function ClientManagement() {
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

  // Confirm deactivate/activate
  const [confirmToggle, setConfirmToggle] = useState<ClientSummary | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const clientList = await listClients();
      setClients(clientList);
    } catch {
      setError("Failed to load clients");
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
        showToast("success", `Updated ${formData.name}`);
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
        showToast("success", `Created client ${formData.name}`);
      }
      setShowModal(false);
      await fetchData();
    } catch (err: unknown) {
      showToast("error", getErrorMessage(err, "Failed to save client"));
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
        c.is_active ? `Deactivated ${c.name}` : `Reactivated ${c.name}`,
      );
      await fetchData();
    } catch (err: unknown) {
      showToast("error", getErrorMessage(err, "Failed to update client status"));
    }
  };

  if (loading) return <p className="text-gray-400 text-sm">Loading clients...</p>;
  if (error) return <p className="text-red-600 text-sm">{error}</p>;

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <p className="text-sm text-gray-500">{clients.length} client{clients.length !== 1 ? "s" : ""}</p>
        <button
          onClick={openCreate}
          className="bg-green-600 text-white text-sm px-4 py-2 rounded font-medium hover:bg-green-700"
        >
          + New Client
        </button>
      </div>

      <div className="bg-white border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <th className="text-left px-4 py-2 font-medium">Name</th>
              <th className="text-left px-4 py-2 font-medium">Contact</th>
              <th className="text-left px-4 py-2 font-medium">Email</th>
              <th className="text-left px-4 py-2 font-medium">Phone</th>
              <th className="text-left px-4 py-2 font-medium">Country</th>
              <th className="text-left px-4 py-2 font-medium">Incoterm</th>
              <th className="text-left px-4 py-2 font-medium">Payment Terms</th>
              <th className="text-left px-4 py-2 font-medium">Credit Limit</th>
              <th className="text-left px-4 py-2 font-medium">Status</th>
              <th className="px-4 py-2 font-medium" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {clients.map((c) => (
              <tr key={c.id} className={`hover:bg-gray-50 ${!c.is_active ? "opacity-50" : ""}`}>
                <td className="px-4 py-2 font-medium text-gray-800">{c.name}</td>
                <td className="px-4 py-2 text-gray-600">{c.contact_person || "\u2014"}</td>
                <td className="px-4 py-2 text-gray-600">{c.email || "\u2014"}</td>
                <td className="px-4 py-2 text-gray-500">{c.phone || "\u2014"}</td>
                <td className="px-4 py-2 text-gray-500">{c.country || "\u2014"}</td>
                <td className="px-4 py-2 text-gray-500">{c.incoterm || "\u2014"}</td>
                <td className="px-4 py-2 text-gray-500">
                  {c.payment_terms_days != null ? `${c.payment_terms_days} days` : "\u2014"}
                </td>
                <td className="px-4 py-2 text-gray-500">
                  {formatCurrency(c.credit_limit, c.currency)}
                </td>
                <td className="px-4 py-2">
                  <span
                    className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                      c.is_active
                        ? "bg-green-50 text-green-700"
                        : "bg-red-50 text-red-600"
                    }`}
                  >
                    {c.is_active ? "Active" : "Inactive"}
                  </span>
                </td>
                <td className="px-4 py-2 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={() => openEdit(c)}
                      className="text-xs text-blue-600 hover:underline"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => setConfirmToggle(c)}
                      className={`text-xs ${
                        c.is_active
                          ? "text-red-500 hover:underline"
                          : "text-green-600 hover:underline"
                      }`}
                    >
                      {c.is_active ? "Deactivate" : "Activate"}
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
              {editingClient ? "Edit Client" : "New Client"}
            </h3>

            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-500 mb-1">Name *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData((p) => ({ ...p, name: e.target.value }))}
                  className="border rounded px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-1">Contact Person</label>
                <input
                  type="text"
                  value={formData.contact_person}
                  onChange={(e) => setFormData((p) => ({ ...p, contact_person: e.target.value }))}
                  className="border rounded px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-1">Email</label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData((p) => ({ ...p, email: e.target.value }))}
                  className="border rounded px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-1">Phone</label>
                <input
                  type="text"
                  value={formData.phone}
                  onChange={(e) => setFormData((p) => ({ ...p, phone: e.target.value }))}
                  className="border rounded px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-1">Address</label>
                <textarea
                  value={formData.address}
                  onChange={(e) => setFormData((p) => ({ ...p, address: e.target.value }))}
                  rows={2}
                  className="border rounded px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-1">Country</label>
                <input
                  type="text"
                  value={formData.country}
                  onChange={(e) => setFormData((p) => ({ ...p, country: e.target.value }))}
                  className="border rounded px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-1">Incoterm</label>
                <select
                  value={formData.incoterm}
                  onChange={(e) => setFormData((p) => ({ ...p, incoterm: e.target.value }))}
                  className="border rounded px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-green-500"
                >
                  <option value="">— Select —</option>
                  {INCOTERMS.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-1">Payment Terms (days)</label>
                <input
                  type="number"
                  min={0}
                  value={formData.payment_terms_days}
                  onChange={(e) => setFormData((p) => ({ ...p, payment_terms_days: e.target.value }))}
                  className="border rounded px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-1">Currency</label>
                <select
                  value={formData.currency}
                  onChange={(e) => setFormData((p) => ({ ...p, currency: e.target.value }))}
                  className="border rounded px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-green-500"
                >
                  <option value="">— Select —</option>
                  {CURRENCIES.map((cur) => (
                    <option key={cur} value={cur}>
                      {cur}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-1">Credit Limit</label>
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
                <label className="block text-xs text-gray-500 mb-1">Notes</label>
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
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !formData.name}
                className="flex-1 bg-green-600 text-white rounded px-4 py-2 text-sm font-medium hover:bg-green-700 disabled:opacity-50"
              >
                {saving ? "Saving..." : editingClient ? "Save Changes" : "Create Client"}
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
              {confirmToggle.is_active ? "Deactivate Client?" : "Reactivate Client?"}
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              {confirmToggle.is_active
                ? `This will deactivate ${confirmToggle.name}. They will no longer appear in active client lists.`
                : `This will reactivate ${confirmToggle.name}, making them available for orders again.`}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmToggle(null)}
                className="flex-1 border rounded px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleToggleActive}
                className={`flex-1 text-white rounded px-4 py-2 text-sm font-medium ${
                  confirmToggle.is_active
                    ? "bg-red-600 hover:bg-red-700"
                    : "bg-green-600 hover:bg-green-700"
                }`}
              >
                {confirmToggle.is_active ? "Deactivate" : "Reactivate"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
