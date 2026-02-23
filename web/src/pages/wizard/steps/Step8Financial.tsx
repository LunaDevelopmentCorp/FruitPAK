import React from "react";
import { useForm } from "react-hook-form";
import type { StepProps } from "../WizardShell";
import { Spinner } from "../WizardShell";
import {
  CURRENCIES,
  COMMON_EXPORT_CURRENCIES,
  getCurrencyLabel,
  getDefaultCurrency,
} from "../../../constants/currencies";

interface FormData {
  base_currency: string;
  export_currencies: string[];
  packing_rate_per_kg: number | null;
  cold_storage_rate_per_pallet_day: number | null;
  transport_rate_per_pallet: number | null;
  labour_rate_per_hour: number | null;
  grower_payment_terms_days: number | null;
  client_payment_terms_days: number | null;
}

export default function Step8Financial({ onSave, saving, draftData, completedData }: StepProps) {
  // Auto-derive base currency from enterprise country (Step 1)
  const step1Country = (completedData?.["1"]?.country as string) || "";
  const autoDefault = getDefaultCurrency(step1Country) ?? "ZAR";

  const { register, handleSubmit } = useForm<FormData>({
    defaultValues: (draftData as Partial<FormData>) ?? {
      base_currency: autoDefault,
      export_currencies: ["USD", "EUR"],
    },
  });

  const saveDraft = handleSubmit((data) => onSave(data, false));
  const saveAndComplete = handleSubmit((data) => onSave(data, true));

  return (
    <form className="space-y-6 max-w-2xl">
      <p className="text-sm text-gray-500">
        This step is optional. You can skip it and configure financials later.
      </p>

      <fieldset className="space-y-4">
        <legend className="text-sm font-medium text-gray-700">Currencies</legend>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Base / Operational Currency
          </label>
          <p className="text-xs text-gray-400 mb-1">
            Used for local costs: labour, grower payments, packing, transport.
          </p>
          <select {...register("base_currency")} className="border rounded px-3 py-2 text-sm w-full">
            {CURRENCIES.map((c) => (
              <option key={c.code} value={c.code}>
                {getCurrencyLabel(c.code)}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Export / Client Currencies
          </label>
          <p className="text-xs text-gray-400 mb-1">
            Common currencies for invoicing export clients (select all that apply).
          </p>
          <div className="grid grid-cols-2 gap-1">
            {COMMON_EXPORT_CURRENCIES.map((code) => (
              <label key={code} className="flex items-center gap-2 text-sm py-0.5">
                <input type="checkbox" value={code} {...register("export_currencies")} />
                {getCurrencyLabel(code)}
              </label>
            ))}
          </div>
        </div>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-sm font-medium text-gray-700">Rates</legend>
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
