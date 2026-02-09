import React from "react";
import { useFieldArray, useForm } from "react-hook-form";
import type { StepProps } from "../WizardShell";

interface GrowerForm {
  name: string;
  grower_code: string;
  contact_person: string;
  phone: string;
  region: string;
  total_hectares: number | null;
  estimated_volume_tons: number | null;
  globalg_ap_certified: boolean;
  globalg_ap_number: string;
}

interface FormData {
  growers: GrowerForm[];
}

export default function Step4Growers({ onSave, saving, draftData }: StepProps) {
  const { register, control, handleSubmit } = useForm<FormData>({
    defaultValues: (draftData as Partial<FormData>) ?? {
      growers: [{ name: "", grower_code: "", contact_person: "", phone: "", region: "", total_hectares: null, estimated_volume_tons: null, globalg_ap_certified: false, globalg_ap_number: "" }],
    },
  });
  const { fields, append, remove } = useFieldArray({ control, name: "growers" });

  const saveDraft = handleSubmit((data) => onSave(data, false));
  const saveAndComplete = handleSubmit((data) => onSave(data, true));

  return (
    <form className="space-y-6 max-w-2xl">
      {fields.map((field, idx) => (
        <fieldset key={field.id} className="p-4 border rounded space-y-3">
          <div className="flex justify-between items-center">
            <legend className="text-sm font-medium text-gray-700">Grower {idx + 1}</legend>
            {fields.length > 1 && (
              <button type="button" onClick={() => remove(idx)} className="text-xs text-red-500">Remove</button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <input {...register(`growers.${idx}.name`, { required: true })} placeholder="Grower name *" className="border rounded px-3 py-2 text-sm" />
            <input {...register(`growers.${idx}.grower_code`)} placeholder="Grower code" className="border rounded px-3 py-2 text-sm" />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <input {...register(`growers.${idx}.contact_person`)} placeholder="Contact" className="border rounded px-3 py-2 text-sm" />
            <input {...register(`growers.${idx}.phone`)} placeholder="Phone" className="border rounded px-3 py-2 text-sm" />
            <input {...register(`growers.${idx}.region`)} placeholder="Region" className="border rounded px-3 py-2 text-sm" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <input {...register(`growers.${idx}.total_hectares`, { valueAsNumber: true })} placeholder="Total hectares" type="number" className="border rounded px-3 py-2 text-sm" />
            <input {...register(`growers.${idx}.estimated_volume_tons`, { valueAsNumber: true })} placeholder="Est. volume (tons)" type="number" className="border rounded px-3 py-2 text-sm" />
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1 text-sm">
              <input type="checkbox" {...register(`growers.${idx}.globalg_ap_certified`)} /> GLOBALG.A.P. certified
            </label>
            <input {...register(`growers.${idx}.globalg_ap_number`)} placeholder="GGN number" className="border rounded px-3 py-2 text-sm" />
          </div>
        </fieldset>
      ))}
      <button type="button" onClick={() => append({ name: "", grower_code: "", contact_person: "", phone: "", region: "", total_hectares: null, estimated_volume_tons: null, globalg_ap_certified: false, globalg_ap_number: "" })} className="text-sm text-green-600">+ Add grower</button>
      <div className="flex gap-3 pt-4 border-t">
        <button type="button" onClick={saveDraft} disabled={saving} className="px-4 py-2 border rounded text-sm">Save Draft</button>
        <button type="button" onClick={saveAndComplete} disabled={saving} className="px-4 py-2 bg-green-600 text-white rounded text-sm font-medium">Save & Continue</button>
      </div>
    </form>
  );
}
