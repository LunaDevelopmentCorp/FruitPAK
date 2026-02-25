import { Fragment, useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import api, { getErrorMessage } from "../api/client";
import { fetchAllPages } from "../api/fetchAll";
import CsvImport from "../components/CsvImport";
import PageHeader from "../components/PageHeader";
import { showToast } from "../store/toastStore";

interface GrowerSummary {
  id: string;
  name: string;
  grower_code: string | null;
  contact_person: string | null;
  phone: string | null;
  email: string | null;
  region: string | null;
  total_hectares: number | null;
  estimated_volume_tons: number | null;
  globalg_ap_certified: boolean;
  globalg_ap_number: string | null;
  notes: string | null;
}

interface HarvestTeamSummary {
  id: string;
  name: string;
  team_leader: string | null;
  team_size: number | null;
}

interface GrowerFormData {
  name: string;
  grower_code: string;
  contact_person: string;
  email: string;
  phone: string;
  region: string;
  total_hectares: string;
  estimated_volume_tons: string;
  globalg_ap_certified: boolean;
  globalg_ap_number: string;
  notes: string;
}

const inputBase =
  "w-full border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500";

function GrowerEditPanel({
  grower,
  onSave,
  onCancel,
}: {
  grower: GrowerSummary;
  onSave: (updated: GrowerSummary) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation("data");
  const {
    register,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<GrowerFormData>({
    defaultValues: {
      name: grower.name,
      grower_code: grower.grower_code || "",
      contact_person: grower.contact_person || "",
      email: grower.email || "",
      phone: grower.phone || "",
      region: grower.region || "",
      total_hectares: grower.total_hectares?.toString() || "",
      estimated_volume_tons: grower.estimated_volume_tons?.toString() || "",
      globalg_ap_certified: grower.globalg_ap_certified,
      globalg_ap_number: grower.globalg_ap_number || "",
      notes: grower.notes || "",
    },
  });

  const onSubmit = async (data: GrowerFormData) => {
    try {
      const payload: Record<string, unknown> = {
        name: data.name,
        grower_code: data.grower_code || null,
        contact_person: data.contact_person || null,
        email: data.email || null,
        phone: data.phone || null,
        region: data.region || null,
        total_hectares: data.total_hectares ? parseFloat(data.total_hectares) : null,
        estimated_volume_tons: data.estimated_volume_tons
          ? parseFloat(data.estimated_volume_tons)
          : null,
        globalg_ap_certified: data.globalg_ap_certified,
        globalg_ap_number: data.globalg_ap_number || null,
        notes: data.notes || null,
      };
      const res = await api.patch<GrowerSummary>(`/growers/${grower.id}`, payload);
      onSave(res.data);
      showToast("success", t("growers.updated"));
    } catch (err) {
      showToast("error", getErrorMessage(err, t("growers.updateFailed")));
    }
  };

  return (
    <tr>
      <td colSpan={11} className="px-4 py-4 bg-green-50/30 border-t border-b border-green-200">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                {t("common:table.name")} *
              </label>
              <input {...register("name", { required: true })} className={inputBase} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                {t("growers.headers.code")}
              </label>
              <input {...register("grower_code")} className={inputBase} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                {t("common:table.contact")}
              </label>
              <input {...register("contact_person")} className={inputBase} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                {t("common:table.phone")}
              </label>
              <input {...register("phone")} className={inputBase} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                {t("common:table.email")}
              </label>
              <input {...register("email")} className={inputBase} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                {t("growers.headers.region")}
              </label>
              <input {...register("region")} className={inputBase} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                {t("growers.headers.hectares")}
              </label>
              <input {...register("total_hectares")} type="number" step="0.1" className={inputBase} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                {t("growers.headers.volume")}
              </label>
              <input
                {...register("estimated_volume_tons")}
                type="number"
                step="0.1"
                className={inputBase}
              />
            </div>
            <div className="flex items-end gap-2 pb-0.5">
              <input
                {...register("globalg_ap_certified")}
                type="checkbox"
                className="h-4 w-4 rounded border-gray-300 text-green-600 focus:ring-green-500"
              />
              <label className="text-xs font-medium text-gray-600">
                {t("growers.headers.ggn")}
              </label>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                {t("growers.headers.ggnNumber")}
              </label>
              <input {...register("globalg_ap_number")} className={inputBase} />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-gray-600 mb-1">
                {t("common:table.notes")}
              </label>
              <input {...register("notes")} className={inputBase} />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-1.5 text-sm bg-green-600 text-white rounded font-medium hover:bg-green-700 disabled:opacity-50"
            >
              {isSubmitting ? t("common:actions.saving") : t("common:actions.saveChanges")}
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-1.5 text-sm border rounded font-medium hover:bg-gray-50"
            >
              {t("common:actions.cancel")}
            </button>
          </div>
        </form>
      </td>
    </tr>
  );
}

export default function DataManagement() {
  const { t } = useTranslation("data");
  const [growers, setGrowers] = useState<GrowerSummary[]>([]);
  const [teams, setTeams] = useState<HarvestTeamSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [ggnFilter, setGgnFilter] = useState<"all" | "yes" | "no">("all");
  const [sortKey, setSortKey] = useState<keyof GrowerSummary | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const toggleSort = (key: keyof GrowerSummary) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const sortIndicator = (key: keyof GrowerSummary) =>
    sortKey === key ? (sortDir === "asc" ? " \u25B2" : " \u25BC") : "";

  const fetchData = async () => {
    setLoading(true);
    try {
      const [gRes, tRes] = await Promise.all([
        fetchAllPages<GrowerSummary>("/growers/"),
        api.get<HarvestTeamSummary[]>("/payments/harvest-teams"),
      ]);
      setGrowers(gRes.items);
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

  const filteredGrowers = growers
    .filter((g) => {
      if (ggnFilter === "yes" && !g.globalg_ap_certified) return false;
      if (ggnFilter === "no" && g.globalg_ap_certified) return false;
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        g.name.toLowerCase().includes(q) ||
        (g.grower_code || "").toLowerCase().includes(q) ||
        (g.contact_person || "").toLowerCase().includes(q) ||
        (g.region || "").toLowerCase().includes(q) ||
        (g.email || "").toLowerCase().includes(q) ||
        (g.globalg_ap_number || "").toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      if (!sortKey) return 0;
      const av = a[sortKey];
      const bv = b[sortKey];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      let cmp: number;
      if (typeof av === "number" && typeof bv === "number") {
        cmp = av - bv;
      } else if (typeof av === "boolean" && typeof bv === "boolean") {
        cmp = Number(av) - Number(bv);
      } else {
        const sa = String(av);
        const sb = String(bv);
        // Natural sort: if both values look numeric, compare as numbers
        const na = Number(sa);
        const nb = Number(sb);
        if (sa !== "" && sb !== "" && !isNaN(na) && !isNaN(nb)) {
          cmp = na - nb;
        } else {
          cmp = sa.localeCompare(sb, undefined, { numeric: true, sensitivity: "base" });
        }
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

  const handleGrowerSave = (updated: GrowerSummary) => {
    setGrowers((prev) => prev.map((g) => (g.id === updated.id ? updated : g)));
    setEditingId(null);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-8">
      <PageHeader title={t("title")} subtitle={t("subtitle")} />

      {/* Growers section */}
      <section>
        <h2 className="text-lg font-semibold text-gray-800 mb-3">{t("growers.title")}</h2>
        <p className="text-xs text-gray-500 mb-2">{t("growers.clickToEdit")}</p>
        <CsvImport entity="growers" label="Growers" onSuccess={fetchData} />

        {/* Filter bar */}
        {growers.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("growers.searchPlaceholder")}
              className="border rounded-lg px-3 py-1.5 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-green-500"
            />
            <select
              value={ggnFilter}
              onChange={(e) => setGgnFilter(e.target.value as "all" | "yes" | "no")}
              className="border rounded-lg px-3 py-1.5 text-sm text-gray-600 focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              <option value="all">{t("growers.filterGgnAll")}</option>
              <option value="yes">{t("growers.filterGgnYes")}</option>
              <option value="no">{t("growers.filterGgnNo")}</option>
            </select>
            <span className="text-xs text-gray-500">
              {t("growers.showing", { count: filteredGrowers.length, total: growers.length })}
            </span>
            {(search || ggnFilter !== "all") && (
              <button
                onClick={() => { setSearch(""); setGgnFilter("all"); }}
                className="text-xs text-blue-600 hover:underline"
              >
                {t("common:actions.clearFilters")}
              </button>
            )}
          </div>
        )}

        <div className="mt-3 bg-white border rounded-lg overflow-x-auto">
          {loading ? (
            <p className="text-gray-400 text-sm p-4">{t("common:actions.loading")}</p>
          ) : growers.length === 0 ? (
            <p className="text-gray-400 text-sm p-4">{t("growers.empty")}</p>
          ) : filteredGrowers.length === 0 ? (
            <p className="text-gray-400 text-sm p-4">{t("growers.noMatch")}</p>
          ) : (
            <table className="w-full text-sm whitespace-nowrap">
              <thead className="bg-gray-50 text-gray-600 select-none">
                <tr>
                  <th className="text-left px-4 py-2 font-medium cursor-pointer hover:text-green-700" onClick={() => toggleSort("name")}>{t("common:table.name")}{sortIndicator("name")}</th>
                  <th className="text-left px-4 py-2 font-medium cursor-pointer hover:text-green-700" onClick={() => toggleSort("grower_code")}>{t("growers.headers.code")}{sortIndicator("grower_code")}</th>
                  <th className="text-left px-4 py-2 font-medium cursor-pointer hover:text-green-700" onClick={() => toggleSort("contact_person")}>{t("common:table.contact")}{sortIndicator("contact_person")}</th>
                  <th className="text-left px-4 py-2 font-medium cursor-pointer hover:text-green-700" onClick={() => toggleSort("phone")}>{t("common:table.phone")}{sortIndicator("phone")}</th>
                  <th className="text-left px-4 py-2 font-medium cursor-pointer hover:text-green-700" onClick={() => toggleSort("email")}>{t("common:table.email")}{sortIndicator("email")}</th>
                  <th className="text-left px-4 py-2 font-medium cursor-pointer hover:text-green-700" onClick={() => toggleSort("region")}>{t("growers.headers.region")}{sortIndicator("region")}</th>
                  <th className="text-right px-4 py-2 font-medium cursor-pointer hover:text-green-700" onClick={() => toggleSort("total_hectares")}>{t("growers.headers.hectares")}{sortIndicator("total_hectares")}</th>
                  <th className="text-right px-4 py-2 font-medium cursor-pointer hover:text-green-700" onClick={() => toggleSort("estimated_volume_tons")}>{t("growers.headers.volume")}{sortIndicator("estimated_volume_tons")}</th>
                  <th className="text-center px-4 py-2 font-medium cursor-pointer hover:text-green-700" onClick={() => toggleSort("globalg_ap_certified")}>{t("growers.headers.ggn")}{sortIndicator("globalg_ap_certified")}</th>
                  <th className="text-left px-4 py-2 font-medium cursor-pointer hover:text-green-700" onClick={() => toggleSort("globalg_ap_number")}>{t("growers.headers.ggnNumber")}{sortIndicator("globalg_ap_number")}</th>
                  <th className="text-left px-4 py-2 font-medium">{t("common:table.notes")}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredGrowers.map((g) => (
                  <Fragment key={g.id}>
                    <tr
                      onClick={() => setEditingId(editingId === g.id ? null : g.id)}
                      className={`cursor-pointer ${
                        editingId === g.id
                          ? "bg-green-50"
                          : "hover:bg-green-50/50 even:bg-gray-50/50"
                      }`}
                    >
                      <td className="px-4 py-2 font-medium">{g.name}</td>
                      <td className="px-4 py-2 text-gray-500 font-mono text-xs">
                        {g.grower_code || "\u2014"}
                      </td>
                      <td className="px-4 py-2 text-gray-500">{g.contact_person || "\u2014"}</td>
                      <td className="px-4 py-2 text-gray-500">{g.phone || "\u2014"}</td>
                      <td className="px-4 py-2 text-gray-500">{g.email || "\u2014"}</td>
                      <td className="px-4 py-2 text-gray-500">{g.region || "\u2014"}</td>
                      <td className="px-4 py-2 text-right text-gray-500">
                        {g.total_hectares ?? "\u2014"}
                      </td>
                      <td className="px-4 py-2 text-right text-gray-500">
                        {g.estimated_volume_tons ?? "\u2014"}
                      </td>
                      <td className="px-4 py-2 text-center">
                        {g.globalg_ap_certified ? (
                          <span className="inline-block w-5 h-5 rounded-full bg-green-100 text-green-700 text-xs leading-5">
                            Y
                          </span>
                        ) : (
                          <span className="inline-block w-5 h-5 rounded-full bg-gray-100 text-gray-400 text-xs leading-5">
                            N
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-gray-500 font-mono text-xs">
                        {g.globalg_ap_number || "\u2014"}
                      </td>
                      <td className="px-4 py-2 text-gray-500 max-w-[200px] truncate">
                        {g.notes || "\u2014"}
                      </td>
                    </tr>
                    {editingId === g.id && (
                      <GrowerEditPanel
                        key={`edit-${g.id}`}
                        grower={g}
                        onSave={handleGrowerSave}
                        onCancel={() => setEditingId(null)}
                      />
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>

      {/* Harvest Teams section */}
      <section>
        <h2 className="text-lg font-semibold text-gray-800 mb-3">{t("teams.title")}</h2>
        <CsvImport entity="harvest-teams" label="Harvest Teams" onSuccess={fetchData} />
        <div className="mt-3 bg-white border rounded-lg overflow-hidden">
          {loading ? (
            <p className="text-gray-400 text-sm p-4">{t("common:actions.loading")}</p>
          ) : teams.length === 0 ? (
            <p className="text-gray-400 text-sm p-4">{t("teams.empty")}</p>
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
                    <td className="px-4 py-2 text-gray-500">{tm.team_leader || "\u2014"}</td>
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
