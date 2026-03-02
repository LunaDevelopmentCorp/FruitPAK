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
import {
  listCustomRoles,
  getPermissionGroups,
  CustomRole,
  PermissionGroup,
} from "../../api/customRoles";
import { listPackhouses } from "../../api/batches";
import { getErrorMessage } from "../../api/client";
import { useTableSort, sortRows, sortableThClass } from "../../hooks/useTableSort";
import { useAuthStore } from "../../store/authStore";
import { showToast } from "../../store/toastStore";
import PermissionMatrix from "../../components/PermissionMatrix";

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
  const [customRoles, setCustomRoles] = useState<CustomRole[]>([]);
  const [permissionGroups, setPermissionGroups] = useState<PermissionGroup[]>([]);
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
    custom_role_id: string;
    custom_permissions: Record<string, boolean>;
  }>({
    email: "",
    full_name: "",
    phone: "",
    password: "",
    role: "operator",
    assigned_packhouses: [],
    custom_role_id: "",
    custom_permissions: {},
  });
  const [saving, setSaving] = useState(false);
  const [showOverrides, setShowOverrides] = useState(false);

  const { sortCol, sortDir, toggleSort, sortIndicator } = useTableSort();

  // Confirm deactivate
  const [confirmToggle, setConfirmToggle] = useState<UserSummary | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [userList, phList, roleList, groups] = await Promise.all([
        listUsers(),
        listPackhouses(),
        listCustomRoles().catch(() => []),
        getPermissionGroups().catch(() => []),
      ]);
      setUsers(userList);
      setPackhouses(phList as Packhouse[]);
      setCustomRoles(roleList);
      setPermissionGroups(groups);
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
      custom_role_id: "",
      custom_permissions: {},
    });
    setShowOverrides(false);
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
      custom_role_id: u.custom_role_id || "",
      custom_permissions: u.custom_permissions || {},
    });
    setShowOverrides(
      u.custom_permissions != null && Object.keys(u.custom_permissions).length > 0
    );
    setShowModal(true);
  };

  // Compute base permissions for the override matrix
  const getBasePermissions = (): string[] => {
    if (formData.custom_role_id) {
      const cr = customRoles.find((r) => r.id === formData.custom_role_id);
      return cr?.permissions || [];
    }
    // Fall back to role defaults — we can't replicate exact backend logic,
    // but the user's effective permissions come from the server.
    // For the override UI, show the editing user's current permissions minus overrides.
    if (editingUser) {
      return editingUser.permissions;
    }
    return [];
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

        const oldCrId = editingUser.custom_role_id || "";
        if (formData.custom_role_id !== oldCrId) {
          payload.custom_role_id = formData.custom_role_id || null;
        }

        const oldOverrides = JSON.stringify(editingUser.custom_permissions || {});
        const newOverrides = JSON.stringify(formData.custom_permissions);
        if (oldOverrides !== newOverrides) {
          payload.custom_permissions =
            Object.keys(formData.custom_permissions).length > 0
              ? formData.custom_permissions
              : null;
        }

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
        if (formData.custom_role_id) {
          payload.custom_role_id = formData.custom_role_id;
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

  const activeCustomRoles = customRoles.filter((r) => r.is_active);

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
              <th onClick={() => toggleSort("full_name")} className={`text-left px-4 py-2 font-medium ${sortableThClass}`}>{t("users.headers.name")}{sortIndicator("full_name")}</th>
              <th onClick={() => toggleSort("email")} className={`text-left px-4 py-2 font-medium ${sortableThClass}`}>{t("users.headers.email")}{sortIndicator("email")}</th>
              <th onClick={() => toggleSort("phone")} className={`text-left px-4 py-2 font-medium ${sortableThClass}`}>{t("users.headers.phone")}{sortIndicator("phone")}</th>
              <th onClick={() => toggleSort("role")} className={`text-left px-4 py-2 font-medium ${sortableThClass}`}>{t("users.headers.role")}{sortIndicator("role")}</th>
              <th onClick={() => toggleSort("status")} className={`text-left px-4 py-2 font-medium ${sortableThClass}`}>{t("users.headers.status")}{sortIndicator("status")}</th>
              <th className="px-4 py-2 font-medium" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {sortRows(users, sortCol, sortDir, {
              full_name: (u) => u.full_name,
              email: (u) => u.email,
              phone: (u) => u.phone || "",
              role: (u) => u.role,
              status: (u) => (u.is_active ? "active" : "inactive"),
            }).map((u) => (
              <tr key={u.id} className={`hover:bg-gray-50 ${!u.is_active ? "opacity-50" : ""}`}>
                <td className="px-4 py-2 font-medium text-gray-800">{u.full_name}</td>
                <td className="px-4 py-2 text-gray-600">{u.email}</td>
                <td className="px-4 py-2 text-gray-500">{u.phone || "\u2014"}</td>
                <td className="px-4 py-2">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                        ROLE_COLORS[u.role] || "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {u.role}
                    </span>
                    {u.custom_role_name && (
                      <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-purple-50 text-purple-700">
                        {u.custom_role_name}
                      </span>
                    )}
                  </div>
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
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
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

              {/* Custom Role dropdown */}
              {activeCustomRoles.length > 0 && (
                <div>
                  <label className="block text-xs text-gray-500 mb-1">{t("users.modal.customRole")}</label>
                  <select
                    value={formData.custom_role_id}
                    onChange={(e) =>
                      setFormData((p) => ({
                        ...p,
                        custom_role_id: e.target.value,
                        // Clear overrides when switching custom role
                        custom_permissions: {},
                      }))
                    }
                    className="border rounded px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-green-500"
                  >
                    <option value="">{t("users.modal.noCustomRole")}</option>
                    {activeCustomRoles.map((cr) => (
                      <option key={cr.id} value={cr.id}>
                        {cr.name}
                      </option>
                    ))}
                  </select>
                  <p className="text-[10px] text-gray-400 mt-1">
                    {t("users.modal.customRoleHelp")}
                  </p>
                </div>
              )}

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

              {/* Permission Overrides */}
              {editingUser && permissionGroups.length > 0 && (
                <div className="border-t pt-3">
                  <button
                    type="button"
                    onClick={() => setShowOverrides(!showOverrides)}
                    className="flex items-center gap-2 text-xs font-medium text-gray-600 hover:text-gray-800"
                  >
                    <svg
                      className={`w-3 h-3 transition-transform ${showOverrides ? "rotate-90" : ""}`}
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                    {t("users.modal.permissionOverrides")}
                    {Object.keys(formData.custom_permissions).length > 0 && (
                      <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">
                        {Object.keys(formData.custom_permissions).length}
                      </span>
                    )}
                  </button>
                  <p className="text-[10px] text-gray-400 mt-1">
                    {t("users.modal.overridesHelp")}
                  </p>
                  {showOverrides && (
                    <div className="mt-3">
                      <PermissionMatrix
                        mode="override"
                        groups={permissionGroups}
                        basePermissions={getBasePermissions()}
                        overrides={formData.custom_permissions}
                        onOverrideChange={(overrides) =>
                          setFormData((p) => ({ ...p, custom_permissions: overrides }))
                        }
                      />
                    </div>
                  )}
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
