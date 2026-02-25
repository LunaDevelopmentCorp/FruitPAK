import React, { useEffect, useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import type { StepProps } from "../WizardShell";
import { Spinner } from "../WizardShell";
import { listPackhouses } from "../../../api/batches";

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

const EMPTY_PACKHOUSE: PackhouseForm = {
  name: "",
  location: "",
  capacity_tons_per_day: null,
  cold_rooms: null,
  pack_lines: [],
};

export default function Step2Packhouse({
  onSave,
  saving,
  draftData,
}: StepProps) {
  const { t } = useTranslation("wizard");
  const [loading, setLoading] = useState(true);

  const { register, control, getValues, reset } = useForm<FormData>({
    defaultValues: { packhouses: [{ ...EMPTY_PACKHOUSE }] },
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: "packhouses",
  });

  // Load live packhouses from DB on mount — the source of truth
  useEffect(() => {
    listPackhouses()
      .then((live) => {
        if (live.length > 0) {
          reset({
            packhouses: live.map((ph) => ({
              name: ph.name,
              location: ph.location ?? "",
              capacity_tons_per_day: ph.capacity_tons_per_day ?? null,
              cold_rooms: ph.cold_rooms ?? null,
              pack_lines: [],
            })),
          });
        } else if (draftData && (draftData as Partial<FormData>).packhouses?.length) {
          reset(draftData as unknown as FormData);
        }
      })
      .catch(() => {
        // Fallback to draft data if API fails
        if (draftData && (draftData as Partial<FormData>).packhouses?.length) {
          reset(draftData as unknown as FormData);
        }
      })
      .finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const filterEmpty = (data: FormData) => ({
    packhouses: data.packhouses.filter((p) => p.name?.trim()),
  });
  const saveDraft = () => onSave(filterEmpty(getValues()), false);
  const saveAndComplete = () => onSave(filterEmpty(getValues()), true);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-8 text-sm text-gray-500">
        <Spinner /> {t("step2.loading")}
      </div>
    );
  }

  return (
    <form className="space-y-6 max-w-2xl">
      {fields.map((field, idx) => (
        <fieldset key={field.id} className="p-4 border rounded space-y-3">
          <div className="flex justify-between items-center">
            <legend className="text-sm font-medium text-gray-700">
              {t("step2.packhouse", { index: idx + 1 })}
            </legend>
            <button
              type="button"
              onClick={() => remove(idx)}
              className="text-xs text-red-500 hover:text-red-700"
            >
              {t("common:actions.remove")}
            </button>
          </div>

          <input
            {...register(`packhouses.${idx}.name`)}
            placeholder={t("step2.name")}
            className="w-full border rounded px-3 py-2 text-sm"
          />
          <input
            {...register(`packhouses.${idx}.location`)}
            placeholder={t("step2.location")}
            className="w-full border rounded px-3 py-2 text-sm"
          />
          <div className="grid grid-cols-2 gap-3">
            <input
              {...register(`packhouses.${idx}.capacity_tons_per_day`, {
                valueAsNumber: true,
              })}
              placeholder={t("step2.capacity")}
              type="number"
              className="border rounded px-3 py-2 text-sm"
            />
            <input
              {...register(`packhouses.${idx}.cold_rooms`, {
                valueAsNumber: true,
              })}
              placeholder={t("step2.coldRooms")}
              type="number"
              className="border rounded px-3 py-2 text-sm"
            />
          </div>
        </fieldset>
      ))}

      <button
        type="button"
        onClick={() => append({ ...EMPTY_PACKHOUSE })}
        className="text-sm text-green-600 hover:text-green-700"
      >
        {t("step2.addPackhouse")}
      </button>

      {/* Actions */}
      <div className="flex gap-3 pt-4 border-t">
        <button
          type="button"
          onClick={saveDraft}
          disabled={saving}
          className="px-4 py-2 border rounded text-sm text-gray-700 hover:bg-gray-50 disabled:opacity-50"
        >
          {saving && <Spinner />} {t("saveDraft")}
        </button>
        <button
          type="button"
          onClick={saveAndComplete}
          disabled={saving}
          className="px-4 py-2 bg-green-600 text-white rounded text-sm font-medium hover:bg-green-700 disabled:opacity-50"
        >
          {saving && <Spinner />} {t("saveContinue")}
        </button>
      </div>
    </form>
  );
}
