import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  listAllUsers,
  resetUserPassword,
  platformActivateUser,
  platformDeactivateUser,
  impersonateUser,
  PlatformUser,
} from "../../api/platform";
import { useAuthStore } from "../../store/authStore";
import { showToast } from "../../store/toastStore";
import StatusBadge from "../../components/StatusBadge";

export default function PlatformUsers() {
  const { t } = useTranslation("platform");
  const [users, setUsers] = useState<PlatformUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [resetResult, setResetResult] = useState<{ email: string; password: string } | null>(null);
  const setAuth = useAuthStore((s) => s.setAuth);

  useEffect(() => {
    listAllUsers()
      .then(setUsers)
      .finally(() => setLoading(false));
  }, []);

  const handleResetPassword = async (user: PlatformUser) => {
    if (!confirm(t("users.resetConfirm", { email: user.email }))) return;
    try {
      const result = await resetUserPassword(user.id);
      setResetResult({ email: result.email, password: result.temporary_password });
      showToast("success", t("users.passwordReset", { email: result.email }));
    } catch {
      showToast("error", t("users.resetFailed"));
    }
  };

  const handleToggleActive = async (user: PlatformUser) => {
    try {
      const updated = user.is_active
        ? await platformDeactivateUser(user.id)
        : await platformActivateUser(user.id);
      setUsers((prev) => prev.map((u) => (u.id === updated.id ? updated : u)));
      showToast("success", t("users.activateSuccess", { name: updated.full_name, status: updated.is_active ? "activated" : "deactivated" }));
    } catch {
      showToast("error", t("users.activateFailed"));
    }
  };

  const handleImpersonate = async (user: PlatformUser) => {
    if (!confirm(t("users.impersonateConfirm", { email: user.email }))) return;
    try {
      const result = await impersonateUser(user.id);
      // Store the impersonation tokens
      setAuth(result.access_token, result.refresh_token, {
        id: user.id,
        email: user.email,
        full_name: user.full_name,
        phone: user.phone,
        role: user.role,
        is_active: user.is_active,
        enterprise_id: user.enterprise_id,
        is_onboarded: true,
        permissions: [],
        assigned_packhouses: null,
      });
      window.location.href = "/dashboard";
    } catch {
      showToast("error", t("users.impersonateFailed"));
    }
  };

  if (loading) return <p className="text-gray-400 text-sm">{t("users.loading")}</p>;

  return (
    <div>
      {/* Password reset modal */}
      {resetResult && (
        <div className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <p className="text-sm font-medium text-yellow-800">
            {t("users.tempPassword", { email: resetResult.email })}
          </p>
          <p className="mt-1 font-mono text-lg bg-white px-3 py-1 rounded border select-all">
            {resetResult.password}
          </p>
          <p className="text-xs text-yellow-600 mt-2">
            {t("users.tempPasswordHelp")}
          </p>
          <button
            onClick={() => setResetResult(null)}
            className="mt-2 text-xs text-yellow-700 underline"
          >
            {t("users.dismiss")}
          </button>
        </div>
      )}

      {users.length === 0 ? (
        <p className="text-gray-400 text-sm">{t("users.empty")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-gray-600">
              <tr>
                <th className="px-4 py-2">{t("users.headers.name")}</th>
                <th className="px-4 py-2">{t("users.headers.email")}</th>
                <th className="px-4 py-2">{t("users.headers.enterprise")}</th>
                <th className="px-4 py-2">{t("users.headers.role")}</th>
                <th className="px-4 py-2 text-center">{t("users.headers.status")}</th>
                <th className="px-4 py-2">{t("users.headers.created")}</th>
                <th className="px-4 py-2">{t("users.headers.actions")}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2 font-medium">{u.full_name}</td>
                  <td className="px-4 py-2 text-gray-500">{u.email}</td>
                  <td className="px-4 py-2 text-gray-500">
                    {u.enterprise_name || <span className="text-gray-300">{"\u2014"}</span>}
                  </td>
                  <td className="px-4 py-2">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${
                        u.role === "platform_admin"
                          ? "bg-purple-100 text-purple-700"
                          : u.role === "administrator"
                          ? "bg-blue-100 text-blue-700"
                          : u.role === "supervisor"
                          ? "bg-green-100 text-green-700"
                          : "bg-gray-100 text-gray-600"
                      }`}
                    >
                      {u.role.replace("_", " ")}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-center">
                    <StatusBadge status={u.is_active ? "active" : "inactive"} />
                  </td>
                  <td className="px-4 py-2 text-gray-400 text-xs">
                    {new Date(u.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-2">
                    <div className="flex gap-1">
                      <button
                        onClick={() => handleResetPassword(u)}
                        className="text-xs px-2 py-1 rounded bg-yellow-50 text-yellow-700 hover:bg-yellow-100"
                      >
                        {t("users.resetPw")}
                      </button>
                      {u.role !== "platform_admin" && (
                        <>
                          <button
                            onClick={() => handleToggleActive(u)}
                            className={`text-xs px-2 py-1 rounded ${
                              u.is_active
                                ? "bg-red-50 text-red-600 hover:bg-red-100"
                                : "bg-green-50 text-green-600 hover:bg-green-100"
                            }`}
                          >
                            {u.is_active ? t("common:actions.deactivate") : t("common:actions.activate")}
                          </button>
                          {u.enterprise_id && (
                            <button
                              onClick={() => handleImpersonate(u)}
                              className="text-xs px-2 py-1 rounded bg-blue-50 text-blue-600 hover:bg-blue-100"
                            >
                              {t("users.impersonate")}
                            </button>
                          )}
                        </>
                      )}
                    </div>
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
