import React from "react";
import { useFieldArray, useForm } from "react-hook-form";
import type { StepProps } from "../WizardShell";
import { Spinner } from "../WizardShell";

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
      {fields.map((field, idx) => {
        const volumeKg = teams?.[idx]?.estimated_volume_kg;
        return (
          <fieldset key={field.id} className="p-4 border rounded space-y-3">
            <div className="flex justify-between items-center">
              <legend className="text-sm font-medium text-gray-700">Team {idx + 1}</legend>
              <button type="button" onClick={() => remove(idx)} className="text-xs text-red-500 hover:text-red-700">Remove</button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <input {...register(`harvest_teams.${idx}.name`)} placeholder="Team name" className="border rounded px-3 py-2 text-sm" />
              <input {...register(`harvest_teams.${idx}.team_leader`)} placeholder="Team leader" className="border rounded px-3 py-2 text-sm" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <input {...register(`harvest_teams.${idx}.team_size`, { valueAsNumber: true })} placeholder="Team size" type="number" className="border rounded px-3 py-2 text-sm" />
              <div>
                <input {...register(`harvest_teams.${idx}.estimated_volume_kg`, { valueAsNumber: true })} placeholder="Est. volume (kg)" type="number" className="w-full border rounded px-3 py-2 text-sm" />
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
      <button type="button" onClick={() => append({ name: "", team_leader: "", team_size: null, estimated_volume_kg: null })} className="text-sm text-green-600">+ Add team</button>
      <div className="flex gap-3 pt-4 border-t">
        <button type="button" onClick={saveDraft} disabled={saving} className="px-4 py-2 border rounded text-sm">
          {saving && <Spinner />} Save Draft
        </button>
        <button type="button" onClick={saveAndComplete} disabled={saving} className="px-4 py-2 bg-green-600 text-white rounded text-sm font-medium">
          {saving && <Spinner />} Save & Continue
        </button>
      </div>
    </form>
  );
}
