import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { getPlatformStats, PlatformStats as Stats } from "../../api/platform";

function StatCard({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return (
    <div className="bg-white rounded-lg shadow p-5">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="text-3xl font-bold text-gray-800 mt-1">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-1">{sub}</p>}
    </div>
  );
}

export default function PlatformStats() {
  const { t } = useTranslation("platform");
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getPlatformStats()
      .then(setStats)
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <p className="text-gray-400 text-sm">{t("common:actions.loading")}</p>;
  if (!stats) return <p className="text-red-500 text-sm">{t("common:errors.failedToLoad")}</p>;

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
      <StatCard label={t("stats.totalEnterprises")} value={stats.total_enterprises} />
      <StatCard
        label={t("stats.activeEnterprises")}
        value={stats.active_enterprises}
        sub={`${stats.onboarded_enterprises} ${t("stats.onboardedEnterprises").toLowerCase()}`}
      />
      <StatCard label={t("stats.totalUsers")} value={stats.total_users} />
      <StatCard label={t("stats.recentUsers")} value={stats.active_users} />
      <StatCard
        label="Inactive Users"
        value={stats.total_users - stats.active_users}
      />
    </div>
  );
}
