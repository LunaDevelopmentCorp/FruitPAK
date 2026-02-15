import React from "react";
import { useFieldArray, useForm } from "react-hook-form";
import type { StepProps } from "../WizardShell";
import { Spinner } from "../WizardShell";

interface PackLine {
  name: string;
  line_number: number;
  custom_units: string[];
}

interface PackhouseForm {
  name: string;
  location: string;
  capacity_tons_per_day: number | null;
  cold_rooms: number | null;
  pack_lines: PackLine[];
}

interface FormData {
  packhouses: PackhouseForm[];
}

export default function Step2Packhouse({
  onSave,
  saving,
  draftData,
}: StepProps) {
  const { register, control, getValues } = useForm<FormData>({
    defaultValues: (draftData as Partial<FormData>) ?? {
      packhouses: [
        { name: "", location: "", capacity_tons_per_day: null, cold_rooms: null, pack_lines: [] },
      ],
    },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "packhouses",
  });

  const filterEmpty = (data: FormData) => ({
    packhouses: data.packhouses.filter((p) => p.name?.trim()),
  });
  const saveDraft = () => onSave(filterEmpty(getValues()), false);
  const saveAndComplete = () => onSave(filterEmpty(getValues()), true);

  return (
    <form className="space-y-6 max-w-2xl">
      {fields.map((field, idx) => (
        <fieldset key={field.id} className="p-4 border rounded space-y-3">
          <div className="flex justify-between items-center">
            <legend className="text-sm font-medium text-gray-700">
              Packhouse {idx + 1}
            </legend>
            <button
              type="button"
              onClick={() => remove(idx)}
              className="text-xs text-red-500 hover:text-red-700"
            >
              Remove
            </button>
          </div>

          <input
            {...register(`packhouses.${idx}.name`)}
            placeholder="Packhouse name"
            className="w-full border rounded px-3 py-2 text-sm"
          />
          <input
            {...register(`packhouses.${idx}.location`)}
            placeholder="Location / address"
            className="w-full border rounded px-3 py-2 text-sm"
          />
          <div className="grid grid-cols-2 gap-3">
            <input
              {...register(`packhouses.${idx}.capacity_tons_per_day`, {
                valueAsNumber: true,
              })}
              placeholder="Capacity (tons/day)"
              type="number"
              className="border rounded px-3 py-2 text-sm"
            />
            <input
              {...register(`packhouses.${idx}.cold_rooms`, {
                valueAsNumber: true,
              })}
              placeholder="Cold rooms"
              type="number"
              className="border rounded px-3 py-2 text-sm"
            />
          </div>
        </fieldset>
      ))}

      <button
        type="button"
        onClick={() =>
          append({
            name: "",
            location: "",
            capacity_tons_per_day: null,
            cold_rooms: null,
            pack_lines: [],
          })
        }
        className="text-sm text-green-600 hover:text-green-700"
      >
        + Add another packhouse
      </button>

      {/* Actions */}
      <div className="flex gap-3 pt-4 border-t">
        <button
          type="button"
          onClick={saveDraft}
          disabled={saving}
          className="px-4 py-2 border rounded text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          {saving && <Spinner />} Save Draft
        </button>
        <button
          type="button"
          onClick={saveAndComplete}
          disabled={saving}
          className="px-4 py-2 bg-green-600 text-white rounded text-sm font-medium hover:bg-green-700 disabled:opacity-50"
        >
          {saving && <Spinner />} Save & Continue
        </button>
      </div>
    </form>
  );
}
