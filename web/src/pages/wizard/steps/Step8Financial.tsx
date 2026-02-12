import React from "react";
import { useForm } from "react-hook-form";
import type { StepProps } from "../WizardShell";
import { Spinner } from "../WizardShell";

interface FormData {
  currency: string;
  packing_rate_per_kg: number | null;
  cold_storage_rate_per_pallet_day: number | null;
  transport_rate_per_pallet: number | null;
  labour_rate_per_hour: number | null;
  grower_payment_terms_days: number | null;
  client_payment_terms_days: number | null;
}

export default function Step8Financial({ onSave, saving, draftData }: StepProps) {
  const { register, handleSubmit } = useForm<FormData>({
    defaultValues: (draftData as Partial<FormData>) ?? { currency: "ZAR" },
  });

  const saveDraft = handleSubmit((data) => onSave(data, false));
  const saveAndComplete = handleSubmit((data) => onSave(data, true));

  return (
    <form className="space-y-6 max-w-2xl">
      <p className="text-sm text-gray-500">
        This step is optional. You can skip it and configure financials later.
      </p>

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium text-gray-700">Currency & Rates</legend>
        <select {...register("currency")} className="border rounded px-3 py-2 text-sm">
          <option value="ZAR">ZAR (South African Rand)</option>
          <option value="USD">USD (US Dollar)</option>
          <option value="EUR">EUR (Euro)</option>
          <option value="GBP">GBP (British Pound)</option>
        </select>
        <div className="grid grid-cols-2 gap-3">
          <input {...register("packing_rate_per_kg", { valueAsNumber: true })} placeholder="Packing rate / kg" type="number" step="0.01" className="border rounded px-3 py-2 text-sm" />
          <input {...register("cold_storage_rate_per_pallet_day", { valueAsNumber: true })} placeholder="Cold storage / pallet / day" type="number" step="0.01" className="border rounded px-3 py-2 text-sm" />
          <input {...register("transport_rate_per_pallet", { valueAsNumber: true })} placeholder="Transport / pallet" type="number" step="0.01" className="border rounded px-3 py-2 text-sm" />
          <input {...register("labour_rate_per_hour", { valueAsNumber: true })} placeholder="Labour rate / hour" type="number" step="0.01" className="border rounded px-3 py-2 text-sm" />
        </div>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium text-gray-700">Payment Terms</legend>
        <div className="grid grid-cols-2 gap-3">
          <input {...register("grower_payment_terms_days", { valueAsNumber: true })} placeholder="Grower terms (days)" type="number" className="border rounded px-3 py-2 text-sm" />
          <input {...register("client_payment_terms_days", { valueAsNumber: true })} placeholder="Client terms (days)" type="number" className="border rounded px-3 py-2 text-sm" />
        </div>
      </fieldset>

      <div className="flex gap-3 pt-4 border-t">
        <button type="button" onClick={saveDraft} disabled={saving} className="px-4 py-2 border rounded text-sm">{saving && <Spinner />} Save Draft</button>
        <button type="button" onClick={saveAndComplete} disabled={saving} className="px-4 py-2 bg-green-600 text-white rounded text-sm font-medium">{saving && <Spinner />} Save & Complete</button>
      </div>
    </form>
  );
}
