import React from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import type { StepProps } from "../WizardShell";
import { Spinner } from "../WizardShell";
import CsvImport from "../../../components/CsvImport";

interface TeamForm {
  name: string;
  team_leader: string;
  team_size: number | null;
  estimated_volume_kg: number | null;
}

interface FormData {
  harvest_teams: TeamForm[];
}

export default function Step5HarvestTeams({ onSave, saving, draftData }: StepProps) {
  const { t } = useTranslation("wizard");
  const { register, control, watch, getValues } = useForm<FormData>({
    defaultValues: (draftData as Partial<FormData>) ?? {
      harvest_teams: [{ name: "", team_leader: "", team_size: null, estimated_volume_kg: null }],
    },
  });
  const { fields, append, remove } = useFieldArray({ control, name: "harvest_teams" });

  const teams = watch("harvest_teams");

  const filterEmpty = (data: FormData) => ({
    harvest_teams: data.harvest_teams.filter((t) => t.name?.trim()),
  });
  const saveDraft = () => onSave(filterEmpty(getValues()), false);
  const saveAndComplete = () => onSave(filterEmpty(getValues()), true);

  return (
    <form className="space-y-6 max-w-2xl">
      {/* CSV bulk import */}
      <div>
        <h3 className="text-sm font-medium text-gray-700 mb-2">{t("step5.csvImport")}</h3>
        <CsvImport entity="harvest-teams" label="Harvest Teams" onSuccess={() => {}} />
        <p className="text-xs text-gray-500 mt-1">{t("step5.csvHint")}</p>
      </div>

      <div className="relative">
        <div className="absolute inset-0 flex items-center"><div className="w-full border-t" /></div>
        <div className="relative flex justify-center"><span className="bg-gray-50 px-3 text-xs text-gray-500 uppercase">{t("step5.orManual")}</span></div>
      </div>

      {fields.map((field, idx) => {
        const volumeKg = teams?.[idx]?.estimated_volume_kg;
        return (
          <fieldset key={field.id} className="p-4 border rounded space-y-3">
            <div className="flex justify-between items-center">
              <legend className="text-sm font-medium text-gray-700">{t("step5.team", { index: idx + 1 })}</legend>
              <button type="button" onClick={() => remove(idx)} className="text-xs text-red-500 hover:text-red-700">{t("common:actions.remove")}</button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <input {...register(`harvest_teams.${idx}.name`)} placeholder={t("step5.teamName")} className="border rounded px-3 py-2 text-sm" />
              <input {...register(`harvest_teams.${idx}.team_leader`)} placeholder={t("step5.teamLeader")} className="border rounded px-3 py-2 text-sm" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <input {...register(`harvest_teams.${idx}.team_size`, { valueAsNumber: true })} placeholder={t("step5.teamSize")} type="number" className="border rounded px-3 py-2 text-sm" />
              <div>
                <input {...register(`harvest_teams.${idx}.estimated_volume_kg`, { valueAsNumber: true })} placeholder={t("step5.estVolume")} type="number" className="w-full border rounded px-3 py-2 text-sm" />
                {volumeKg != null && volumeKg > 0 && (
                  <span className="text-xs text-gray-400 mt-0.5 block">
                    {"\u2248"} {(volumeKg * 2.20462).toLocaleString(undefined, { maximumFractionDigits: 0 })} lb
                  </span>
                )}
              </div>
            </div>
          </fieldset>
        );
      })}
      <button type="button" onClick={() => append({ name: "", team_leader: "", team_size: null, estimated_volume_kg: null })} className="text-sm text-green-600">{t("step5.addTeam")}</button>
      <div className="flex gap-3 pt-4 border-t">
        <button type="button" onClick={saveDraft} disabled={saving} className="px-4 py-2 border rounded text-sm">
          {saving && <Spinner />} {t("saveDraft")}
        </button>
        <button type="button" onClick={saveAndComplete} disabled={saving} className="px-4 py-2 bg-green-600 text-white rounded text-sm font-medium">
          {saving && <Spinner />} {t("saveContinue")}
        </button>
      </div>
    </form>
  );
}
