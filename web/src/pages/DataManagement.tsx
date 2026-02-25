import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import api from "../api/client";
import CsvImport from "../components/CsvImport";
import PageHeader from "../components/PageHeader";

interface GrowerSummary {
  id: string;
  name: string;
  grower_code: string | null;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  region: string | null;
  total_hectares: number | null;
}

interface HarvestTeamSummary {
  id: string;
  name: string;
  team_leader: string | null;
  team_size: number | null;
}

export default function DataManagement() {
  const { t } = useTranslation("data");
  const [growers, setGrowers] = useState<GrowerSummary[]>([]);
  const [teams, setTeams] = useState<HarvestTeamSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [gRes, tRes] = await Promise.all([
        api.get<{ items: GrowerSummary[] }>("/growers/"),
        api.get<HarvestTeamSummary[]>("/payments/harvest-teams"),
      ]);
      setGrowers(gRes.data.items || []);
      setTeams(tRes.data || []);
    } catch {
      // Data tables may be empty but CSV import buttons remain available
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-8">
      <PageHeader
        title={t("title")}
        subtitle={t("subtitle")}
      />

      {/* Growers section */}
      <section>
        <h2 className="text-lg font-semibold text-gray-800 mb-3">{t("growers.title")}</h2>
        <CsvImport entity="growers" label="Growers" onSuccess={fetchData} />
        <div className="mt-3 bg-white border rounded-lg overflow-hidden">
          {loading ? (
            <p className="text-gray-400 text-sm p-4">{t("common:actions.loading")}</p>
          ) : growers.length === 0 ? (
            <p className="text-gray-400 text-sm p-4">
              {t("growers.empty")}
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">{t("common:table.name")}</th>
                  <th className="text-left px-4 py-2 font-medium">{t("growers.headers.code")}</th>
                  <th className="text-left px-4 py-2 font-medium">{t("common:table.contact")}</th>
                  <th className="text-left px-4 py-2 font-medium">{t("common:table.phone")}</th>
                  <th className="text-left px-4 py-2 font-medium">{t("growers.headers.region")}</th>
                  <th className="text-right px-4 py-2 font-medium">
                    {t("growers.headers.hectares")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {growers.map((g) => (
                  <tr key={g.id} className="hover:bg-green-50/50 even:bg-gray-50/50">
                    <td className="px-4 py-2 font-medium">{g.name}</td>
                    <td className="px-4 py-2 text-gray-500 font-mono text-xs">
                      {g.grower_code || "\u2014"}
                    </td>
                    <td className="px-4 py-2 text-gray-500">
                      {g.contact_person || "\u2014"}
                    </td>
                    <td className="px-4 py-2 text-gray-500">
                      {g.phone || "\u2014"}
                    </td>
                    <td className="px-4 py-2 text-gray-500">
                      {g.region || "\u2014"}
                    </td>
                    <td className="px-4 py-2 text-right text-gray-500">
                      {g.total_hectares ?? "\u2014"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {/* Harvest Teams section */}
      <section>
        <h2 className="text-lg font-semibold text-gray-800 mb-3">
          {t("teams.title")}
        </h2>
        <CsvImport
          entity="harvest-teams"
          label="Harvest Teams"
          onSuccess={fetchData}
        />
        <div className="mt-3 bg-white border rounded-lg overflow-hidden">
          {loading ? (
            <p className="text-gray-400 text-sm p-4">{t("common:actions.loading")}</p>
          ) : teams.length === 0 ? (
            <p className="text-gray-400 text-sm p-4">
              {t("teams.empty")}
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">{t("common:table.name")}</th>
                  <th className="text-left px-4 py-2 font-medium">
                    {t("teams.headers.teamLeader")}
                  </th>
                  <th className="text-right px-4 py-2 font-medium">
                    {t("teams.headers.teamSize")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {teams.map((tm) => (
                  <tr key={tm.id} className="hover:bg-green-50/50 even:bg-gray-50/50">
                    <td className="px-4 py-2 font-medium">{tm.name}</td>
                    <td className="px-4 py-2 text-gray-500">
                      {tm.team_leader || "\u2014"}
                    </td>
                    <td className="px-4 py-2 text-right text-gray-500">
                      {tm.team_size ?? "\u2014"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}
