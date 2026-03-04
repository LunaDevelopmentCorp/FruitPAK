import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  createHarvestTeam,
  updateHarvestTeam,
  deleteHarvestTeam,
  HarvestTeamItem,
} from "../../api/payments";
import { getErrorMessage } from "../../api/client";
import { getCurrencySymbol } from "../../constants/currencies";
import { showToast } from "../../store/toastStore";
import type { TeamManagementTabProps } from "./types";

export default function TeamManagementTab({
  teams,
  baseCurrency,
  onRefresh,
}: TeamManagementTabProps) {
  const { t } = useTranslation("payments");

  // ── Local state ─────────────────────────────────────────
  const [teamSearch, setTeamSearch] = useState("");
  const [editingTeam, setEditingTeam] = useState<HarvestTeamItem | null>(null);
  const [addingTeam, setAddingTeam] = useState(false);
  const [teamForm, setTeamForm] = useState({
    name: "",
    team_leader: "",
    team_size: "",
    estimated_volume_kg: "",
    rate_per_kg: "",
    notes: "",
  });
  const [teamSaving, setTeamSaving] = useState(false);

  // ── Filtered / sorted teams ─────────────────────────────
  const filteredTeams = useMemo(() => {
    const sorted = [...teams].sort((a, b) =>
      a.name.localeCompare(b.name, undefined, {
        numeric: true,
        sensitivity: "base",
      }),
    );
    if (!teamSearch) return sorted;
    const q = teamSearch.toLowerCase();
    return sorted.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        (t.team_leader || "").toLowerCase().includes(q),
    );
  }, [teams, teamSearch]);

  // ── Team editing helpers ────────────────────────────────
  const startEditTeam = (team: HarvestTeamItem) => {
    setEditingTeam(team);
    setAddingTeam(false);
    setTeamForm({
      name: team.name,
      team_leader: team.team_leader || "",
      team_size: team.team_size?.toString() || "",
      estimated_volume_kg: team.estimated_volume_kg?.toString() || "",
      rate_per_kg: team.rate_per_kg?.toString() || "",
      notes: team.notes || "",
    });
  };

  const startAddTeam = () => {
    setEditingTeam(null);
    setAddingTeam(true);
    setTeamForm({
      name: "",
      team_leader: "",
      team_size: "",
      estimated_volume_kg: "",
      rate_per_kg: "",
      notes: "",
    });
  };

  const cancelTeamEdit = () => {
    setEditingTeam(null);
    setAddingTeam(false);
  };

  const saveTeam = async () => {
    setTeamSaving(true);
    try {
      const payload: Record<string, unknown> = { name: teamForm.name };
      if (teamForm.team_leader) payload.team_leader = teamForm.team_leader;
      if (teamForm.team_size) payload.team_size = Number(teamForm.team_size);
      if (teamForm.estimated_volume_kg)
        payload.estimated_volume_kg = Number(teamForm.estimated_volume_kg);
      if (teamForm.rate_per_kg)
        payload.rate_per_kg = Number(teamForm.rate_per_kg);
      if (teamForm.notes) payload.notes = teamForm.notes;

      if (editingTeam) {
        await updateHarvestTeam(
          editingTeam.id,
          payload as Partial<HarvestTeamItem>,
        );
        showToast("success", t("team.management.teamUpdated"));
      } else {
        await createHarvestTeam(payload as Partial<HarvestTeamItem>);
        showToast("success", t("team.management.teamCreated"));
      }
      cancelTeamEdit();
      onRefresh();
    } catch (err) {
      showToast(
        "error",
        getErrorMessage(
          err,
          editingTeam
            ? t("team.management.updateFailed")
            : t("team.management.createFailed"),
        ),
      );
    } finally {
      setTeamSaving(false);
    }
  };

  const handleDeleteTeam = async (team: HarvestTeamItem) => {
    if (!confirm(t("team.management.confirmDelete", { name: team.name })))
      return;
    try {
      await deleteHarvestTeam(team.id);
      showToast("success", t("team.management.teamDeleted"));
      cancelTeamEdit();
      onRefresh();
    } catch (err) {
      showToast(
        "error",
        getErrorMessage(err, t("team.management.deleteFailed")),
      );
    }
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <input
          type="text"
          value={teamSearch}
          onChange={(e) => setTeamSearch(e.target.value)}
          placeholder={t("team.management.searchPlaceholder")}
          className="border rounded px-3 py-2 text-sm flex-1 max-w-sm"
        />
        <button
          onClick={startAddTeam}
          className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700"
        >
          + {t("team.management.addTeam")}
        </button>
      </div>

      {/* Add / Edit panel */}
      {(addingTeam || editingTeam) && (
        <div className="bg-white rounded-lg border p-4 space-y-3">
          <h4 className="text-sm font-semibold text-gray-700">
            {editingTeam ? editingTeam.name : t("team.management.addTeam")}
          </h4>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">
                {t("common:table.name")} *
              </label>
              <input
                value={teamForm.name}
                onChange={(e) =>
                  setTeamForm({ ...teamForm, name: e.target.value })
                }
                className="w-full border rounded px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">
                {t("team.management.teamLeader")}
              </label>
              <input
                value={teamForm.team_leader}
                onChange={(e) =>
                  setTeamForm({ ...teamForm, team_leader: e.target.value })
                }
                className="w-full border rounded px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">
                {t("team.management.teamSize")}
              </label>
              <input
                type="number"
                value={teamForm.team_size}
                onChange={(e) =>
                  setTeamForm({ ...teamForm, team_size: e.target.value })
                }
                className="w-full border rounded px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">
                {t("team.management.estVolume")}
              </label>
              <input
                type="number"
                value={teamForm.estimated_volume_kg}
                onChange={(e) =>
                  setTeamForm({
                    ...teamForm,
                    estimated_volume_kg: e.target.value,
                  })
                }
                className="w-full border rounded px-2 py-1.5 text-sm"
                placeholder="kg"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">
                {t("team.management.ratePerKg")}
              </label>
              <input
                type="number"
                step="0.01"
                value={teamForm.rate_per_kg}
                onChange={(e) =>
                  setTeamForm({ ...teamForm, rate_per_kg: e.target.value })
                }
                className="w-full border rounded px-2 py-1.5 text-sm"
                placeholder="e.g. 2.50"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">
                {t("team.form.notes")}
              </label>
              <input
                value={teamForm.notes}
                onChange={(e) =>
                  setTeamForm({ ...teamForm, notes: e.target.value })
                }
                className="w-full border rounded px-2 py-1.5 text-sm"
              />
            </div>
          </div>
          <div className="flex gap-2 pt-1">
            <button
              onClick={saveTeam}
              disabled={!teamForm.name || teamSaving}
              className="px-4 py-1.5 text-sm font-medium text-white bg-green-600 rounded hover:bg-green-700 disabled:opacity-50"
            >
              {teamSaving
                ? t("common:actions.saving")
                : t("common:actions.save")}
            </button>
            <button
              onClick={cancelTeamEdit}
              className="px-4 py-1.5 text-sm border text-gray-600 rounded hover:bg-gray-50"
            >
              {t("common:actions.cancel")}
            </button>
            {editingTeam && (
              <button
                onClick={() => handleDeleteTeam(editingTeam)}
                className="px-4 py-1.5 text-sm text-red-600 border border-red-200 rounded hover:bg-red-50 ml-auto"
              >
                {t("common:actions.delete")}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Team list */}
      <div className="bg-white rounded-lg border p-4">
        {filteredTeams.length === 0 ? (
          <p className="text-sm text-gray-400">
            {t("team.management.empty")}
          </p>
        ) : (
          <>
            <p className="text-xs text-gray-500 mb-2">
              {t("team.management.showing", {
                count: filteredTeams.length,
                total: teams.length,
              })}
            </p>
            <table className="w-full text-sm">
              <thead className="text-gray-500 text-xs">
                <tr>
                  <th className="text-left px-2 py-1.5 font-medium">
                    {t("common:table.name")}
                  </th>
                  <th className="text-left px-2 py-1.5 font-medium">
                    {t("team.management.teamLeader")}
                  </th>
                  <th className="text-right px-2 py-1.5 font-medium">
                    {t("team.management.teamSize")}
                  </th>
                  <th className="text-right px-2 py-1.5 font-medium">
                    {t("team.management.ratePerKg")}
                  </th>
                  <th className="text-right px-2 py-1.5 font-medium">
                    {t("team.management.estVolume")}
                  </th>
                  <th className="text-left px-2 py-1.5 font-medium">
                    {t("team.form.notes")}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredTeams.map((tm) => (
                  <tr
                    key={tm.id}
                    onClick={() => startEditTeam(tm)}
                    className={`cursor-pointer hover:bg-green-50/50 even:bg-gray-50/50 ${
                      editingTeam?.id === tm.id ? "bg-green-50" : ""
                    }`}
                  >
                    <td className="px-2 py-1.5 font-medium">{tm.name}</td>
                    <td className="px-2 py-1.5 text-gray-500">
                      {tm.team_leader || "\u2014"}
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      {tm.team_size ?? "\u2014"}
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      {tm.rate_per_kg != null
                        ? `${getCurrencySymbol(baseCurrency)} ${tm.rate_per_kg}`
                        : "\u2014"}
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      {tm.estimated_volume_kg != null
                        ? `${tm.estimated_volume_kg.toLocaleString()} kg`
                        : "\u2014"}
                    </td>
                    <td className="px-2 py-1.5 text-gray-500 truncate max-w-[200px]">
                      {tm.notes || "\u2014"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>
    </div>
  );
}
