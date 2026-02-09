import React from "react";
import { useFieldArray, useForm } from "react-hook-form";
import type { StepProps } from "../WizardShell";

interface SupplierForm {
  name: string;
  tags: string[];
  contact_person: string;
  phone: string;
  email: string;
}

interface FormData {
  suppliers: SupplierForm[];
}

const TAG_OPTIONS = ["packaging", "services", "labour", "transport", "chemicals"];

export default function Step3Suppliers({ onSave, saving, draftData }: StepProps) {
  const { register, control, handleSubmit } = useForm<FormData>({
    defaultValues: (draftData as Partial<FormData>) ?? {
      suppliers: [{ name: "", tags: [], contact_person: "", phone: "", email: "" }],
    },
  });
  const { fields, append, remove } = useFieldArray({ control, name: "suppliers" });

  const saveDraft = handleSubmit((data) => onSave(data, false));
  const saveAndComplete = handleSubmit((data) => onSave(data, true));

  return (
    <form className="space-y-6 max-w-2xl">
      {fields.map((field, idx) => (
        <fieldset key={field.id} className="p-4 border rounded space-y-3">
          <div className="flex justify-between items-center">
            <legend className="text-sm font-medium text-gray-700">Supplier {idx + 1}</legend>
            {fields.length > 1 && (
              <button type="button" onClick={() => remove(idx)} className="text-xs text-red-500">Remove</button>
            )}
          </div>
          <input {...register(`suppliers.${idx}.name`, { required: true })} placeholder="Supplier name *" className="w-full border rounded px-3 py-2 text-sm" />
          <div className="flex flex-wrap gap-2">
            {TAG_OPTIONS.map((tag) => (
              <label key={tag} className="flex items-center gap-1 text-xs">
                <input type="checkbox" value={tag} {...register(`suppliers.${idx}.tags`)} />
                {tag}
              </label>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-3">
            <input {...register(`suppliers.${idx}.contact_person`)} placeholder="Contact person" className="border rounded px-3 py-2 text-sm" />
            <input {...register(`suppliers.${idx}.phone`)} placeholder="Phone" className="border rounded px-3 py-2 text-sm" />
            <input {...register(`suppliers.${idx}.email`)} placeholder="Email" className="border rounded px-3 py-2 text-sm" />
          </div>
        </fieldset>
      ))}
      <button type="button" onClick={() => append({ name: "", tags: [], contact_person: "", phone: "", email: "" })} className="text-sm text-green-600">+ Add supplier</button>
      <div className="flex gap-3 pt-4 border-t">
        <button type="button" onClick={saveDraft} disabled={saving} className="px-4 py-2 border rounded text-sm">Save Draft</button>
        <button type="button" onClick={saveAndComplete} disabled={saving} className="px-4 py-2 bg-green-600 text-white rounded text-sm font-medium">Save & Continue</button>
      </div>
    </form>
  );
}
