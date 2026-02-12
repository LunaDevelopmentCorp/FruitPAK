import React from "react";
import { useFieldArray, useForm } from "react-hook-form";
import type { StepProps } from "../WizardShell";
import { Spinner } from "../WizardShell";

interface TransportForm {
  name: string;
  container_type: string;
  temp_setpoint_c: number | null;
  pallet_capacity: number | null;
  max_weight_kg: number | null;
}

interface FormData {
  transport_configs: TransportForm[];
}

const CONTAINER_TYPES = ["reefer_20ft", "reefer_40ft", "open_truck", "break_bulk"];

export default function Step7Transport({ onSave, saving, draftData }: StepProps) {
  const { register, control, handleSubmit, watch } = useForm<FormData>({
    defaultValues: (draftData as Partial<FormData>) ?? {
      transport_configs: [{ name: "", container_type: "reefer_40ft", temp_setpoint_c: null, pallet_capacity: null, max_weight_kg: null }],
    },
  });
  const { fields, append, remove } = useFieldArray({ control, name: "transport_configs" });

  const configs = watch("transport_configs");

  const saveDraft = handleSubmit((data) => onSave(data, false));
  const saveAndComplete = handleSubmit((data) => onSave(data, true));

  return (
    <form className="space-y-6 max-w-2xl">
      {fields.map((field, idx) => {
        const tempC = configs?.[idx]?.temp_setpoint_c;
        const weightKg = configs?.[idx]?.max_weight_kg;
        return (
          <fieldset key={field.id} className="p-4 border rounded space-y-3">
            <div className="flex justify-between items-center">
              <legend className="text-sm font-medium text-gray-700">Config {idx + 1}</legend>
              {fields.length > 1 && (
                <button type="button" onClick={() => remove(idx)} className="text-xs text-red-500">Remove</button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <input {...register(`transport_configs.${idx}.name`, { required: true })} placeholder="Name *" className="border rounded px-3 py-2 text-sm" />
              <select {...register(`transport_configs.${idx}.container_type`)} className="border rounded px-3 py-2 text-sm">
                {CONTAINER_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g, " ")}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <input {...register(`transport_configs.${idx}.temp_setpoint_c`, { valueAsNumber: true })} placeholder="Temp (\u00B0C)" type="number" step="0.5" className="w-full border rounded px-3 py-2 text-sm" />
                {tempC != null && !isNaN(tempC) && (
                  <span className="text-xs text-gray-400 mt-0.5 block">
                    {"\u2248"} {(tempC * 9 / 5 + 32).toFixed(1)} {"\u00B0F"}
                  </span>
                )}
              </div>
              <input {...register(`transport_configs.${idx}.pallet_capacity`, { valueAsNumber: true })} placeholder="Pallet capacity" type="number" className="border rounded px-3 py-2 text-sm" />
              <div>
                <input {...register(`transport_configs.${idx}.max_weight_kg`, { valueAsNumber: true })} placeholder="Max weight (kg)" type="number" className="w-full border rounded px-3 py-2 text-sm" />
                {weightKg != null && weightKg > 0 && (
                  <span className="text-xs text-gray-400 mt-0.5 block">
                    {"\u2248"} {(weightKg * 2.20462).toLocaleString(undefined, { maximumFractionDigits: 0 })} lb
                  </span>
                )}
              </div>
            </div>
          </fieldset>
        );
      })}
      <button type="button" onClick={() => append({ name: "", container_type: "reefer_40ft", temp_setpoint_c: null, pallet_capacity: null, max_weight_kg: null })} className="text-sm text-green-600">+ Add config</button>
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
