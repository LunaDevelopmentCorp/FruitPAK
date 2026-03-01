import { Fragment, useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import api, { getErrorMessage } from "../api/client";
import { fetchAllPages } from "../api/fetchAll";
import CsvImport from "../components/CsvImport";
import { useTableSort, sortRows, sortableThClass } from "../hooks/useTableSort";
import PageHeader from "../components/PageHeader";
import { showToast } from "../store/toastStore";

interface GrowerField {
  name: string;
  code?: string;
  hectares?: number | null;
  fruit_type?: string;
}

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
  fields: GrowerField[] | null;
  notes: string | null;
}

interface HarvestTeamSummary {
  id: string;
  name: string;
  team_leader: string | null;
  team_size: number | null;
  estimated_volume_kg: number | null;
  rate_per_kg: number | null;
  fruit_types: string[] | null;
  assigned_fields: string[] | null;
  notes: string | null;
}

interface TeamFormData {
  name: string;
  team_leader: string;
  team_size: string;
  estimated_volume_kg: string;
  rate_per_kg: string;
  notes: string;
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
  onDelete,
}: {
  grower: GrowerSummary;
  onSave: (updated: GrowerSummary) => void;
  onCancel: () => void;
  onDelete: (id: string) => void;
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

  const [fields, setFields] = useState<GrowerField[]>(grower.fields || []);

  const addField = () => setFields((prev) => [...prev, { name: "", code: "", hectares: null, fruit_type: "" }]);
  const removeField = (idx: number) => setFields((prev) => prev.filter((_, i) => i !== idx));
  const updateField = (idx: number, key: keyof GrowerField, value: string | number | null) => {
    setFields((prev) => prev.map((f, i) => (i === idx ? { ...f, [key]: value } : f)));
  };

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
        fields: fields.filter((f) => f.name.trim()),
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
      <td colSpan={12} className="px-4 py-4 bg-green-50/30 border-t border-b border-green-200">
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

          {/* Fields / Blocks */}
          <div className="border-t pt-3">
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
                {t("growers.headers.fields", "Farm Fields / Blocks")}
              </h4>
              <button
                type="button"
                onClick={addField}
                className="text-xs text-green-700 hover:text-green-800 font-medium"
              >
                + {t("growers.addField", "Add Field")}
              </button>
            </div>
            {fields.length === 0 ? (
              <p className="text-xs text-gray-400">{t("growers.noFields", "No fields added")}</p>
            ) : (
              <div className="space-y-2">
                {fields.map((f, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <input
                      value={f.name}
                      onChange={(e) => updateField(idx, "name", e.target.value)}
                      placeholder={t("growers.fieldName", "Field name")}
                      className={`${inputBase} flex-1`}
                    />
                    <input
                      value={f.code || ""}
                      onChange={(e) => updateField(idx, "code", e.target.value)}
                      placeholder={t("growers.fieldCode", "Code")}
                      className={`${inputBase} w-24`}
                    />
                    <input
                      type="number"
                      step="0.1"
                      value={f.hectares ?? ""}
                      onChange={(e) =>
                        updateField(idx, "hectares", e.target.value ? parseFloat(e.target.value) : null)
                      }
                      placeholder={t("growers.fieldHectares", "Hectares")}
                      className={`${inputBase} w-24`}
                    />
                    <input
                      value={f.fruit_type || ""}
                      onChange={(e) => updateField(idx, "fruit_type", e.target.value)}
                      placeholder={t("growers.fieldFruitType", "Fruit type")}
                      className={`${inputBase} w-28`}
                    />
                    <button
                      type="button"
                      onClick={() => removeField(idx)}
                      className="text-red-400 hover:text-red-600 text-sm px-1"
                      title="Remove"
                    >
                      x
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex gap-2 items-center">
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
            <div className="flex-1" />
            <button
              type="button"
              onClick={() => {
                if (window.confirm(t("growers.confirmDelete", `Delete "${grower.name}"? This cannot be undone.`))) {
                  onDelete(grower.id);
                }
              }}
              className="px-4 py-1.5 text-sm text-red-600 border border-red-200 rounded font-medium hover:bg-red-50"
            >
              {t("common:actions.delete", "Delete")}
            </button>
          </div>
        </form>
      </td>
    </tr>
  );
}

function TeamEditPanel({
  team,
  onSave,
  onCancel,
  onDelete,
}: {
  team: HarvestTeamSummary;
  onSave: (updated: HarvestTeamSummary) => void;
  onCancel: () => void;
  onDelete: (id: string) => void;
}) {
  const { t } = useTranslation("data");
  const {
    register,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<TeamFormData>({
    defaultValues: {
      name: team.name,
      team_leader: team.team_leader || "",
      team_size: team.team_size?.toString() || "",
      estimated_volume_kg: team.estimated_volume_kg?.toString() || "",
      rate_per_kg: team.rate_per_kg?.toString() || "",
      notes: team.notes || "",
    },
  });

  const onSubmit = async (data: TeamFormData) => {
    try {
      const payload: Record<string, unknown> = {
        name: data.name,
        team_leader: data.team_leader || null,
        team_size: data.team_size ? parseInt(data.team_size) : null,
        estimated_volume_kg: data.estimated_volume_kg ? parseFloat(data.estimated_volume_kg) : null,
        rate_per_kg: data.rate_per_kg ? parseFloat(data.rate_per_kg) : null,
        notes: data.notes || null,
      };
      const res = await api.patch<HarvestTeamSummary>(`/harvest-teams/${team.id}`, payload);
      onSave(res.data);
      showToast("success", t("teams.updated"));
    } catch (err) {
      showToast("error", getErrorMessage(err, t("teams.updateFailed")));
    }
  };

  return (
    <tr>
      <td colSpan={6} className="px-4 py-4 bg-green-50/30 border-t border-b border-green-200">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                {t("common:table.name")} *
              </label>
              <input {...register("name", { required: true })} className={inputBase} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                {t("teams.headers.teamLeader")}
              </label>
              <input {...register("team_leader")} className={inputBase} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                {t("teams.headers.teamSize")}
              </label>
              <input {...register("team_size")} type="number" className={inputBase} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                {t("teams.headers.estVolume")}
              </label>
              <input {...register("estimated_volume_kg")} type="number" step="0.1" className={inputBase} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                {t("teams.headers.ratePerKg")}
              </label>
              <input {...register("rate_per_kg")} type="number" step="0.01" className={inputBase} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                {t("common:table.notes")}
              </label>
              <input {...register("notes")} className={inputBase} />
            </div>
          </div>
          <div className="flex gap-2 items-center">
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
            <div className="flex-1" />
            <button
              type="button"
              onClick={() => {
                if (window.confirm(t("teams.confirmDelete", `Delete "${team.name}"? This cannot be undone.`))) {
                  onDelete(team.id);
                }
              }}
              className="px-4 py-1.5 text-sm text-red-600 border border-red-200 rounded font-medium hover:bg-red-50"
            >
              {t("common:actions.delete", "Delete")}
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
  // Team-specific state
  const [teamEditingId, setTeamEditingId] = useState<string | null>(null);
  const [teamSearch, setTeamSearch] = useState("");

  const { sortCol, sortDir, toggleSort, sortIndicator } = useTableSort();
  const { sortCol: teamSortCol, sortDir: teamSortDir, toggleSort: toggleTeamSort, sortIndicator: teamSortIndicator } = useTableSort();

  const fetchData = async () => {
    setLoading(true);
    try {
      const [gRes, tRes] = await Promise.all([
        fetchAllPages<GrowerSummary>("/growers/"),
        fetchAllPages<HarvestTeamSummary>("/harvest-teams/"),
      ]);
      setGrowers(gRes.items);
      setTeams(tRes.items);
    } catch {
      // Data tables may be empty but CSV import buttons remain available
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const filteredGrowers = useMemo(() => {
    const rows = growers.filter((g) => {
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
    });
    return sortRows(rows, sortCol, sortDir, {
      name: (g) => g.name,
      grower_code: (g) => g.grower_code,
      contact_person: (g) => g.contact_person,
      phone: (g) => g.phone,
      email: (g) => g.email,
      region: (g) => g.region,
      total_hectares: (g) => g.total_hectares,
      estimated_volume_tons: (g) => g.estimated_volume_tons,
      globalg_ap_certified: (g) => g.globalg_ap_certified ? 1 : 0,
      globalg_ap_number: (g) => g.globalg_ap_number,
    });
  }, [growers, search, ggnFilter, sortCol, sortDir]);

  const handleGrowerSave = (updated: GrowerSummary) => {
    setGrowers((prev) => prev.map((g) => (g.id === updated.id ? updated : g)));
    setEditingId(null);
  };

  const handleGrowerDelete = async (id: string) => {
    try {
      await api.delete(`/growers/${id}`);
      setGrowers((prev) => prev.filter((g) => g.id !== id));
      setEditingId(null);
      showToast("success", t("growers.deleted", "Grower deleted"));
    } catch (err) {
      showToast("error", getErrorMessage(err, t("growers.deleteFailed", "Failed to delete grower")));
    }
  };

  // Filtered & sorted teams
  const filteredTeams = useMemo(() => {
    const rows = teams.filter((tm) => {
      if (!teamSearch.trim()) return true;
      const q = teamSearch.toLowerCase();
      return (
        tm.name.toLowerCase().includes(q) ||
        (tm.team_leader || "").toLowerCase().includes(q) ||
        (tm.notes || "").toLowerCase().includes(q)
      );
    });
    return sortRows(rows, teamSortCol, teamSortDir, {
      name: (tm) => tm.name,
      team_leader: (tm) => tm.team_leader,
      team_size: (tm) => tm.team_size,
      estimated_volume_kg: (tm) => tm.estimated_volume_kg,
    });
  }, [teams, teamSearch, teamSortCol, teamSortDir]);

  const handleTeamSave = (updated: HarvestTeamSummary) => {
    setTeams((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
    setTeamEditingId(null);
  };

  const handleTeamDelete = async (id: string) => {
    try {
      await api.delete(`/harvest-teams/${id}`);
      setTeams((prev) => prev.filter((t) => t.id !== id));
      setTeamEditingId(null);
      showToast("success", t("teams.deleted"));
    } catch (err) {
      showToast("error", getErrorMessage(err, t("teams.deleteFailed")));
    }
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
                  <th className="text-center px-4 py-2 font-medium">{t("growers.headers.fields", "Fields")}</th>
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
                      <td className="px-4 py-2 text-gray-500 text-xs">
                        {g.fields && g.fields.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {g.fields.map((f, i) => (
                              <span key={i} className="inline-block bg-green-100 text-green-700 rounded px-1.5 py-0.5 font-mono whitespace-nowrap">
                                {f.code || f.name}
                              </span>
                            ))}
                          </div>
                        ) : "\u2014"}
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
                        onDelete={handleGrowerDelete}
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
        <p className="text-xs text-gray-500 mb-2">{t("teams.clickToEdit")}</p>
        <CsvImport entity="harvest-teams" label="Harvest Teams" onSuccess={fetchData} />

        {/* Team filter bar */}
        {teams.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <input
              type="text"
              value={teamSearch}
              onChange={(e) => setTeamSearch(e.target.value)}
              placeholder={t("teams.searchPlaceholder")}
              className="border rounded-lg px-3 py-1.5 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-green-500"
            />
            <span className="text-xs text-gray-500">
              {t("teams.showing", { count: filteredTeams.length, total: teams.length })}
            </span>
            {teamSearch && (
              <button
                onClick={() => setTeamSearch("")}
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
          ) : teams.length === 0 ? (
            <p className="text-gray-400 text-sm p-4">{t("teams.empty")}</p>
          ) : filteredTeams.length === 0 ? (
            <p className="text-gray-400 text-sm p-4">{t("teams.noMatch")}</p>
          ) : (
            <table className="w-full text-sm whitespace-nowrap">
              <thead className="bg-gray-50 text-gray-600 select-none">
                <tr>
                  <th className="text-left px-4 py-2 font-medium cursor-pointer hover:text-green-700" onClick={() => toggleTeamSort("name")}>{t("common:table.name")}{teamSortIndicator("name")}</th>
                  <th className="text-left px-4 py-2 font-medium cursor-pointer hover:text-green-700" onClick={() => toggleTeamSort("team_leader")}>{t("teams.headers.teamLeader")}{teamSortIndicator("team_leader")}</th>
                  <th className="text-right px-4 py-2 font-medium cursor-pointer hover:text-green-700" onClick={() => toggleTeamSort("team_size")}>{t("teams.headers.teamSize")}{teamSortIndicator("team_size")}</th>
                  <th className="text-right px-4 py-2 font-medium cursor-pointer hover:text-green-700" onClick={() => toggleTeamSort("estimated_volume_kg")}>{t("teams.headers.estVolume")}{teamSortIndicator("estimated_volume_kg")}</th>
                  <th className="text-left px-4 py-2 font-medium">{t("teams.headers.fruitTypes")}</th>
                  <th className="text-left px-4 py-2 font-medium">{t("common:table.notes")}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredTeams.map((tm) => (
                  <Fragment key={tm.id}>
                    <tr
                      onClick={() => setTeamEditingId(teamEditingId === tm.id ? null : tm.id)}
                      className={`cursor-pointer ${
                        teamEditingId === tm.id
                          ? "bg-green-50"
                          : "hover:bg-green-50/50 even:bg-gray-50/50"
                      }`}
                    >
                      <td className="px-4 py-2 font-medium">{tm.name}</td>
                      <td className="px-4 py-2 text-gray-500">{tm.team_leader || "\u2014"}</td>
                      <td className="px-4 py-2 text-right text-gray-500">{tm.team_size ?? "\u2014"}</td>
                      <td className="px-4 py-2 text-right text-gray-500">{tm.estimated_volume_kg != null ? `${tm.estimated_volume_kg.toLocaleString()} kg` : "\u2014"}</td>
                      <td className="px-4 py-2 text-gray-500 text-xs">
                        {tm.fruit_types && tm.fruit_types.length > 0 ? (
                          <div className="flex flex-wrap gap-1">
                            {tm.fruit_types.map((ft, i) => (
                              <span key={i} className="inline-block bg-green-100 text-green-700 rounded px-1.5 py-0.5">{ft}</span>
                            ))}
                          </div>
                        ) : "\u2014"}
                      </td>
                      <td className="px-4 py-2 text-gray-500 max-w-[200px] truncate">{tm.notes || "\u2014"}</td>
                    </tr>
                    {teamEditingId === tm.id && (
                      <TeamEditPanel
                        key={`edit-${tm.id}`}
                        team={tm}
                        onSave={handleTeamSave}
                        onCancel={() => setTeamEditingId(null)}
                        onDelete={handleTeamDelete}
                      />
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </section>
    </div>
  );
}
