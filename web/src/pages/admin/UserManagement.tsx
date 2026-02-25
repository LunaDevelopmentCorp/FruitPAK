import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  listUsers,
  createUser,
  updateUser,
  deactivateUser,
  activateUser,
  UserSummary,
  CreateUserPayload,
  UserUpdate,
} from "../../api/admin";
import { listPackhouses } from "../../api/batches";
import { getErrorMessage } from "../../api/client";
import { useAuthStore } from "../../store/authStore";
import { showToast } from "../../store/toastStore";

interface Packhouse {
  id: string;
  name: string;
}

const ROLE_COLORS: Record<string, string> = {
  administrator: "bg-red-50 text-red-700",
  supervisor: "bg-blue-50 text-blue-700",
  operator: "bg-gray-100 text-gray-600",
};

const ROLES = ["administrator", "supervisor", "operator"] as const;

export default function UserManagement() {
  const { t } = useTranslation("admin");
  const currentUser = useAuthStore((s) => s.user);
  const [users, setUsers] = useState<UserSummary[]>([]);
  const [packhouses, setPackhouses] = useState<Packhouse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState<UserSummary | null>(null);
  const [formData, setFormData] = useState<{
    email: string;
    full_name: string;
    phone: string;
    password: string;
    role: string;
    assigned_packhouses: string[];
  }>({
    email: "",
    full_name: "",
    phone: "",
    password: "",
    role: "operator",
    assigned_packhouses: [],
  });
  const [saving, setSaving] = useState(false);

  // Confirm deactivate
  const [confirmToggle, setConfirmToggle] = useState<UserSummary | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [userList, phList] = await Promise.all([
        listUsers(),
        listPackhouses(),
      ]);
      setUsers(userList);
      setPackhouses(phList as Packhouse[]);
    } catch {
      setError(t("users.loadFailed"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const openCreate = () => {
    setEditingUser(null);
    setFormData({
      email: "",
      full_name: "",
      phone: "",
      password: "",
      role: "operator",
      assigned_packhouses: [],
    });
    setShowModal(true);
  };

  const openEdit = (u: UserSummary) => {
    setEditingUser(u);
    setFormData({
      email: u.email,
      full_name: u.full_name,
      phone: u.phone || "",
      password: "",
      role: u.role,
      assigned_packhouses: u.assigned_packhouses || [],
    });
    setShowModal(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (editingUser) {
        const payload: UserUpdate = {};
        if (formData.full_name !== editingUser.full_name) payload.full_name = formData.full_name;
        if (formData.phone !== (editingUser.phone || "")) payload.phone = formData.phone;
        if (formData.role !== editingUser.role) payload.role = formData.role;
        const oldPH = JSON.stringify(editingUser.assigned_packhouses || []);
        const newPH = JSON.stringify(formData.assigned_packhouses);
        if (oldPH !== newPH) payload.assigned_packhouses = formData.assigned_packhouses;

        if (Object.keys(payload).length === 0) {
          setShowModal(false);
          return;
        }
        await updateUser(editingUser.id, payload);
        showToast("success", t("users.toast.updated", { name: formData.full_name }));
      } else {
        const payload: CreateUserPayload = {
          email: formData.email,
          full_name: formData.full_name,
          role: formData.role,
        };
        if (formData.phone) payload.phone = formData.phone;
        if (formData.password) payload.password = formData.password;
        if (formData.assigned_packhouses.length > 0) {
          payload.assigned_packhouses = formData.assigned_packhouses;
        }
        await createUser(payload);
        showToast("success", t("users.toast.created", { name: formData.full_name }));
      }
      setShowModal(false);
      await fetchData();
    } catch (err: unknown) {
      showToast("error", getErrorMessage(err, t("users.saveFailed")));
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async () => {
    if (!confirmToggle) return;
    const u = confirmToggle;
    setConfirmToggle(null);
    try {
      if (u.is_active) {
        await deactivateUser(u.id);
        showToast("success", t("users.toast.deactivated", { name: u.full_name }));
      } else {
        await activateUser(u.id);
        showToast("success", t("users.toast.reactivated", { name: u.full_name }));
      }
      await fetchData();
    } catch (err: unknown) {
      showToast("error", getErrorMessage(err, t("users.statusFailed")));
    }
  };

  const togglePackhouse = (phId: string) => {
    setFormData((prev) => ({
      ...prev,
      assigned_packhouses: prev.assigned_packhouses.includes(phId)
        ? prev.assigned_packhouses.filter((id) => id !== phId)
        : [...prev.assigned_packhouses, phId],
    }));
  };

  if (loading) return <p className="text-gray-400 text-sm">{t("users.loading")}</p>;
  if (error) return <p className="text-red-600 text-sm">{error}</p>;

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <p className="text-sm text-gray-500">{t("users.count", { count: users.length })}</p>
        <button
          onClick={openCreate}
          className="bg-green-600 text-white text-sm px-4 py-2 rounded font-medium hover:bg-green-700"
        >
          {t("users.newUser")}
        </button>
      </div>

      <div className="bg-white border rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <th className="text-left px-4 py-2 font-medium">{t("users.headers.name")}</th>
              <th className="text-left px-4 py-2 font-medium">{t("users.headers.email")}</th>
              <th className="text-left px-4 py-2 font-medium">{t("users.headers.phone")}</th>
              <th className="text-left px-4 py-2 font-medium">{t("users.headers.role")}</th>
              <th className="text-left px-4 py-2 font-medium">{t("users.headers.status")}</th>
              <th className="px-4 py-2 font-medium" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {users.map((u) => (
              <tr key={u.id} className={`hover:bg-gray-50 ${!u.is_active ? "opacity-50" : ""}`}>
                <td className="px-4 py-2 font-medium text-gray-800">{u.full_name}</td>
                <td className="px-4 py-2 text-gray-600">{u.email}</td>
                <td className="px-4 py-2 text-gray-500">{u.phone || "\u2014"}</td>
                <td className="px-4 py-2">
                  <span
                    className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                      ROLE_COLORS[u.role] || "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {u.role}
                  </span>
                </td>
                <td className="px-4 py-2">
                  <span
                    className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                      u.is_active
                        ? "bg-green-50 text-green-700"
                        : "bg-red-50 text-red-600"
                    }`}
                  >
                    {u.is_active ? t("common:status.active") : t("common:status.inactive")}
                  </span>
                </td>
                <td className="px-4 py-2 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={() => openEdit(u)}
                      className="text-xs text-blue-600 hover:underline"
                    >
                      {t("common:actions.edit")}
                    </button>
                    {u.id !== currentUser?.id && (
                      <button
                        onClick={() => setConfirmToggle(u)}
                        className={`text-xs ${
                          u.is_active
                            ? "text-red-500 hover:underline"
                            : "text-green-600 hover:underline"
                        }`}
                      >
                        {u.is_active ? t("common:actions.deactivate") : t("common:actions.activate")}
                      </button>
                    )}
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
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">
              {editingUser ? t("users.modal.editTitle") : t("users.modal.newTitle")}
            </h3>

            <div className="space-y-3">
              {!editingUser && (
                <div>
                  <label className="block text-xs text-gray-500 mb-1">{t("users.modal.email")}</label>
                  <input
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData((p) => ({ ...p, email: e.target.value }))}
                    className="border rounded px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs text-gray-500 mb-1">{t("users.modal.fullName")}</label>
                <input
                  type="text"
                  value={formData.full_name}
                  onChange={(e) => setFormData((p) => ({ ...p, full_name: e.target.value }))}
                  className="border rounded px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-500 mb-1">{t("users.modal.phone")}</label>
                <input
                  type="text"
                  value={formData.phone}
                  onChange={(e) => setFormData((p) => ({ ...p, phone: e.target.value }))}
                  className="border rounded px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>

              {!editingUser && (
                <div>
                  <label className="block text-xs text-gray-500 mb-1">
                    {t("users.modal.password")} <span className="text-gray-400">{t("users.modal.passwordHelp")}</span>
                  </label>
                  <input
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData((p) => ({ ...p, password: e.target.value }))}
                    className="border rounded px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-green-500"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs text-gray-500 mb-1">{t("users.modal.role")}</label>
                <select
                  value={formData.role}
                  onChange={(e) => setFormData((p) => ({ ...p, role: e.target.value }))}
                  disabled={editingUser?.id === currentUser?.id}
                  className="border rounded px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-green-500 disabled:opacity-50"
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {t(`users.modal.roles.${r}`)}
                    </option>
                  ))}
                </select>
              </div>

              {packhouses.length > 0 && formData.role === "operator" && (
                <div>
                  <label className="block text-xs text-gray-500 mb-1">{t("users.modal.assignedPackhouses")}</label>
                  <div className="flex flex-wrap gap-2">
                    {packhouses.map((ph) => (
                      <button
                        key={ph.id}
                        type="button"
                        onClick={() => togglePackhouse(ph.id)}
                        className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                          formData.assigned_packhouses.includes(ph.id)
                            ? "bg-green-50 border-green-300 text-green-700"
                            : "bg-white border-gray-200 text-gray-500 hover:bg-gray-50"
                        }`}
                      >
                        {ph.name}
                      </button>
                    ))}
                  </div>
                  <p className="text-[10px] text-gray-400 mt-1">
                    {t("users.modal.packhouseHelp")}
                  </p>
                </div>
              )}
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
                disabled={saving || (!editingUser && (!formData.email || !formData.full_name))}
                className="flex-1 bg-green-600 text-white rounded px-4 py-2 text-sm font-medium hover:bg-green-700 disabled:opacity-50"
              >
                {saving ? t("common:actions.saving") : editingUser ? t("users.modal.saveChanges") : t("users.modal.createUser")}
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
              {confirmToggle.is_active ? t("users.confirm.deactivateTitle") : t("users.confirm.reactivateTitle")}
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              {confirmToggle.is_active
                ? t("users.confirm.deactivateText", { name: confirmToggle.full_name })
                : t("users.confirm.reactivateText", { name: confirmToggle.full_name })}
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
