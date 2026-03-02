import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  listCustomRoles,
  getBuiltinRoles,
  getPermissionGroups,
  createCustomRole,
  updateCustomRole,
  deleteCustomRole,
  CustomRole,
  BuiltinRole,
  PermissionGroup,
} from "../../api/customRoles";
import { getErrorMessage } from "../../api/client";
import { showToast } from "../../store/toastStore";
import PermissionMatrix from "../../components/PermissionMatrix";

const ROLE_COLORS: Record<string, string> = {
  platform_admin: "bg-purple-50 text-purple-700 border-purple-200",
  administrator: "bg-red-50 text-red-700 border-red-200",
  supervisor: "bg-blue-50 text-blue-700 border-blue-200",
  operator: "bg-gray-100 text-gray-600 border-gray-200",
};

const ROLE_HEADER_COLORS: Record<string, string> = {
  platform_admin: "border-l-purple-500",
  administrator: "border-l-red-500",
  supervisor: "border-l-blue-500",
  operator: "border-l-gray-400",
};

function capitalize(s: string): string {
  return s
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export default function RoleManagement() {
  const { t } = useTranslation("admin");

  const [builtinRoles, setBuiltinRoles] = useState<BuiltinRole[]>([]);
  const [customRoles, setCustomRoles] = useState<CustomRole[]>([]);
  const [permissionGroups, setPermissionGroups] = useState<PermissionGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Collapsible built-in cards
  const [expandedBuiltin, setExpandedBuiltin] = useState<string | null>(null);

  // Modal state
  const [showModal, setShowModal] = useState(false);
  const [editingRole, setEditingRole] = useState<CustomRole | null>(null);
  const [formData, setFormData] = useState<{
    name: string;
    description: string;
    permissions: string[];
  }>({
    name: "",
    description: "",
    permissions: [],
  });
  const [saving, setSaving] = useState(false);

  // Delete confirmation
  const [confirmDelete, setConfirmDelete] = useState<CustomRole | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [builtins, customs, groups] = await Promise.all([
        getBuiltinRoles(),
        listCustomRoles(),
        getPermissionGroups(),
      ]);
      setBuiltinRoles(builtins);
      setCustomRoles(customs);
      setPermissionGroups(groups);
    } catch {
      setError(t("roles.loadFailed"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Group permissions by category using fetched permission groups
  const groupPermissions = (permissions: string[]): Record<string, string[]> => {
    const grouped: Record<string, string[]> = {};
    const permSet = new Set(permissions);

    for (const pg of permissionGroups) {
      const matching = pg.permissions.filter((p) => permSet.has(p));
      if (matching.length > 0) {
        grouped[pg.group] = matching;
      }
    }

    // Any permissions not in a known group
    const allKnown = new Set(permissionGroups.flatMap((pg) => pg.permissions));
    const ungrouped = permissions.filter((p) => !allKnown.has(p));
    if (ungrouped.length > 0) {
      grouped["other"] = ungrouped;
    }

    return grouped;
  };

  const toggleBuiltin = (role: string) => {
    setExpandedBuiltin((prev) => (prev === role ? null : role));
  };

  const openCreate = () => {
    setEditingRole(null);
    setFormData({ name: "", description: "", permissions: [] });
    setShowModal(true);
  };

  const openEdit = (role: CustomRole) => {
    setEditingRole(role);
    setFormData({
      name: role.name,
      description: role.description || "",
      permissions: [...role.permissions],
    });
    setShowModal(true);
  };

  const handleStartFrom = (builtinRole: string) => {
    if (!builtinRole) {
      setFormData((prev) => ({ ...prev, permissions: [] }));
      return;
    }
    const found = builtinRoles.find((r) => r.role === builtinRole);
    if (found) {
      setFormData((prev) => ({ ...prev, permissions: [...found.permissions] }));
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      if (editingRole) {
        await updateCustomRole(editingRole.id, {
          name: formData.name,
          description: formData.description || undefined,
          permissions: formData.permissions,
        });
        showToast("success", t("roles.toast.updated", { name: formData.name }));
      } else {
        await createCustomRole({
          name: formData.name,
          description: formData.description || undefined,
          permissions: formData.permissions,
        });
        showToast("success", t("roles.toast.created", { name: formData.name }));
      }
      setShowModal(false);
      await fetchData();
    } catch (err: unknown) {
      showToast("error", getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmDelete) return;
    setDeleting(true);
    try {
      await deleteCustomRole(confirmDelete.id);
      showToast("success", t("roles.toast.deleted", { name: confirmDelete.name }));
      setConfirmDelete(null);
      await fetchData();
    } catch (err: unknown) {
      showToast("error", getErrorMessage(err));
    } finally {
      setDeleting(false);
    }
  };

  if (loading) return <p className="text-gray-400 text-sm">{t("roles.loading")}</p>;
  if (error) return <p className="text-red-600 text-sm">{error}</p>;

  return (
    <div>
      <h2 className="text-lg font-semibold text-gray-800 mb-4">{t("roles.title")}</h2>

      {/* ── Built-in Roles ── */}
      <h3 className="text-sm font-semibold text-gray-600 mb-3">{t("roles.builtinTitle")}</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-8">
        {builtinRoles.map((br) => {
          const isExpanded = expandedBuiltin === br.role;
          const grouped = groupPermissions(br.permissions);

          return (
            <div
              key={br.role}
              className={`bg-white border rounded-lg border-l-4 ${
                ROLE_HEADER_COLORS[br.role] || "border-l-gray-300"
              } overflow-hidden`}
            >
              <button
                onClick={() => toggleBuiltin(br.role)}
                className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span
                    className={`inline-block px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      ROLE_COLORS[br.role] || "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {capitalize(br.role)}
                  </span>
                  <span className="text-xs text-gray-400">
                    {t("roles.permCount", { count: br.permissions.length })}
                  </span>
                </div>
                <svg
                  className={`w-4 h-4 text-gray-400 transition-transform ${
                    isExpanded ? "rotate-180" : ""
                  }`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {isExpanded && (
                <div className="px-4 pb-4 space-y-3">
                  {Object.entries(grouped).map(([group, perms]) => (
                    <div key={group}>
                      <p className="text-xs font-medium text-gray-500 mb-1.5">
                        {capitalize(group)}
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {perms.map((perm) => (
                          <span
                            key={perm}
                            className="inline-block px-2 py-0.5 rounded bg-gray-100 text-gray-600 text-[11px]"
                          >
                            {perm}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Custom Roles ── */}
      <div className="flex justify-between items-center mb-3">
        <h3 className="text-sm font-semibold text-gray-600">{t("roles.customTitle")}</h3>
        <button
          onClick={openCreate}
          className="bg-green-600 text-white text-sm px-4 py-2 rounded font-medium hover:bg-green-700"
        >
          {t("roles.newRole")}
        </button>
      </div>

      {customRoles.length === 0 ? (
        <p className="text-gray-400 text-sm bg-white border rounded-lg p-6 text-center">
          {t("roles.empty")}
        </p>
      ) : (
        <div className="bg-white border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="text-left px-4 py-2 font-medium">{t("roles.headers.name")}</th>
                <th className="text-left px-4 py-2 font-medium">{t("roles.headers.description")}</th>
                <th className="text-left px-4 py-2 font-medium">{t("roles.headers.users")}</th>
                <th className="text-left px-4 py-2 font-medium">{t("roles.headers.status")}</th>
                <th className="px-4 py-2 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {customRoles.map((role) => (
                <tr
                  key={role.id}
                  className={`hover:bg-gray-50 ${!role.is_active ? "opacity-50" : ""}`}
                >
                  <td className="px-4 py-2 font-medium text-gray-800">{role.name}</td>
                  <td className="px-4 py-2 text-gray-500 truncate max-w-xs">
                    {role.description || "\u2014"}
                  </td>
                  <td className="px-4 py-2 text-gray-600">{role.user_count}</td>
                  <td className="px-4 py-2">
                    <span
                      className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                        role.is_active
                          ? "bg-green-50 text-green-700"
                          : "bg-red-50 text-red-600"
                      }`}
                    >
                      {role.is_active
                        ? t("common:status.active")
                        : t("common:status.inactive")}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => openEdit(role)}
                        className="text-xs text-blue-600 hover:underline"
                      >
                        {t("common:actions.edit")}
                      </button>
                      <button
                        onClick={() => setConfirmDelete(role)}
                        className="text-xs text-red-500 hover:underline"
                      >
                        {t("common:actions.delete")}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Create / Edit Modal ── */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-2xl w-full mx-4 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-semibold text-gray-800 mb-4">
              {editingRole ? t("roles.modal.editTitle") : t("roles.modal.newTitle")}
            </h3>

            <div className="space-y-4">
              {/* Role Name */}
              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  {t("roles.modal.name")}
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) =>
                    setFormData((p) => ({ ...p, name: e.target.value }))
                  }
                  className="border rounded px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-xs text-gray-500 mb-1">
                  {t("roles.modal.description")}
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) =>
                    setFormData((p) => ({ ...p, description: e.target.value }))
                  }
                  rows={2}
                  className="border rounded px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
                />
              </div>

              {/* Start from built-in */}
              {!editingRole && (
                <div>
                  <label className="block text-xs text-gray-500 mb-1">
                    {t("roles.modal.startFrom")}
                  </label>
                  <select
                    onChange={(e) => handleStartFrom(e.target.value)}
                    defaultValue=""
                    className="border rounded px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-green-500"
                  >
                    <option value="">{t("roles.modal.startFromNone")}</option>
                    {builtinRoles.map((br) => (
                      <option key={br.role} value={br.role}>
                        {capitalize(br.role)}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Permissions */}
              <div>
                <label className="block text-xs text-gray-500 mb-2">
                  {t("roles.modal.permissions")}
                </label>
                <PermissionMatrix
                  groups={permissionGroups}
                  selected={formData.permissions}
                  onChange={(perms) =>
                    setFormData((p) => ({ ...p, permissions: perms }))
                  }
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
                disabled={saving || !formData.name.trim()}
                className="flex-1 bg-green-600 text-white rounded px-4 py-2 text-sm font-medium hover:bg-green-700 disabled:opacity-50"
              >
                {saving
                  ? t("common:actions.saving")
                  : editingRole
                    ? t("roles.modal.save")
                    : t("roles.modal.create")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Confirmation Modal ── */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold text-red-700 mb-2">
              {t("roles.delete.title")}
            </h3>
            <p className="text-sm text-gray-600 mb-4">
              {t("roles.delete.text", { name: confirmDelete.name })}
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmDelete(null)}
                className="flex-1 border rounded px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
              >
                {t("common:actions.cancel")}
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 bg-red-600 text-white rounded px-4 py-2 text-sm font-medium hover:bg-red-700 disabled:opacity-50"
              >
                {deleting ? t("common:actions.saving") : t("common:actions.delete")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
