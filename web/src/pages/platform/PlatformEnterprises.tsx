import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  listEnterprises,
  updateEnterprise,
  EnterpriseItem,
} from "../../api/platform";
import { useTableSort, sortRows, sortableThClass } from "../../hooks/useTableSort";
import { showToast } from "../../store/toastStore";
import StatusBadge from "../../components/StatusBadge";

export default function PlatformEnterprises() {
  const { t } = useTranslation("platform");
  const [enterprises, setEnterprises] = useState<EnterpriseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const { sortCol, sortDir, toggleSort, sortIndicator } = useTableSort();

  const fetchEnterprises = () => {
    setLoading(true);
    listEnterprises()
      .then(setEnterprises)
      .finally(() => setLoading(false));
  };

  useEffect(fetchEnterprises, []);

  const toggleActive = async (ent: EnterpriseItem) => {
    try {
      const updated = await updateEnterprise(ent.id, { is_active: !ent.is_active });
      setEnterprises((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
      showToast("success", updated.is_active
        ? t("enterprises.activated", { name: updated.name })
        : t("enterprises.deactivated", { name: updated.name }));
    } catch {
      showToast("error", t("enterprises.updateFailed"));
    }
  };

  if (loading) return <p className="text-gray-400 text-sm">{t("enterprises.loading")}</p>;

  return (
    <div>
      {enterprises.length === 0 ? (
        <p className="text-gray-400 text-sm">{t("enterprises.empty")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-gray-600">
              <tr>
                <th onClick={() => toggleSort("name")} className={`px-4 py-2 ${sortableThClass}`}>{t("enterprises.headers.name")}{sortIndicator("name")}</th>
                <th onClick={() => toggleSort("country")} className={`px-4 py-2 ${sortableThClass}`}>{t("enterprises.headers.country")}{sortIndicator("country")}</th>
                <th onClick={() => toggleSort("schema_name")} className={`px-4 py-2 ${sortableThClass}`}>{t("enterprises.headers.schema")}{sortIndicator("schema_name")}</th>
                <th onClick={() => toggleSort("user_count")} className={`px-4 py-2 text-center ${sortableThClass}`}>{t("enterprises.headers.users")}{sortIndicator("user_count")}</th>
                <th onClick={() => toggleSort("onboarded")} className={`px-4 py-2 text-center ${sortableThClass}`}>{t("enterprises.headers.onboarded")}{sortIndicator("onboarded")}</th>
                <th onClick={() => toggleSort("status")} className={`px-4 py-2 text-center ${sortableThClass}`}>{t("enterprises.headers.status")}{sortIndicator("status")}</th>
                <th onClick={() => toggleSort("created_at")} className={`px-4 py-2 ${sortableThClass}`}>{t("enterprises.headers.created")}{sortIndicator("created_at")}</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {sortRows(enterprises, sortCol, sortDir, {
                name: (e) => e.name,
                country: (e) => e.country,
                schema_name: (e) => e.tenant_schema,
                user_count: (e) => e.user_count,
                onboarded: (e) => (e.is_onboarded ? "yes" : "no"),
                status: (e) => (e.is_active ? "active" : "inactive"),
                created_at: (e) => e.created_at,
              }).map((ent) => (
                <tr key={ent.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2 font-medium">{ent.name}</td>
                  <td className="px-4 py-2 text-gray-500">{ent.country}</td>
                  <td className="px-4 py-2 text-gray-400 font-mono text-xs">{ent.tenant_schema}</td>
                  <td className="px-4 py-2 text-center">{ent.user_count}</td>
                  <td className="px-4 py-2 text-center">
                    {ent.is_onboarded ? (
                      <span className="text-green-600">{t("enterprises.yes")}</span>
                    ) : (
                      <span className="text-yellow-600">{t("enterprises.no")}</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-center">
                    <StatusBadge status={ent.is_active ? "active" : "inactive"} />
                  </td>
                  <td className="px-4 py-2 text-gray-400 text-xs">
                    {new Date(ent.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-2">
                    <button
                      onClick={() => toggleActive(ent)}
                      className={`text-xs px-2 py-1 rounded ${
                        ent.is_active
                          ? "bg-red-50 text-red-600 hover:bg-red-100"
                          : "bg-green-50 text-green-600 hover:bg-green-100"
                      }`}
                    >
                      {ent.is_active ? t("common:actions.deactivate") : t("common:actions.activate")}
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
