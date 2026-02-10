import React from "react";
import { useForm } from "react-hook-form";
import type { StepProps } from "../WizardShell";
import { Spinner } from "../WizardShell";

interface FormData {
  trading_name: string;
  legal_name: string;
  registration_number: string;
  vat_number: string;
  exporter_code: string;
  fbo_code: string;
  ppecb_code: string;
  address_line_1: string;
  city: string;
  province: string;
  postal_code: string;
  country: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
}

export default function Step1Company({ onSave, saving, draftData }: StepProps) {
  const { register, handleSubmit, formState } = useForm<FormData>({
    defaultValues: (draftData as Partial<FormData>) ?? {},
  });

  const saveDraft = handleSubmit((data) => onSave(data, false));
  const saveAndComplete = handleSubmit((data) => onSave(data, true));

  return (
    <form className="space-y-6 max-w-2xl">
      {/* Business identity */}
      <fieldset className="space-y-3">
        <legend className="text-sm font-medium text-gray-700">
          Business Identity
        </legend>
        <input
          {...register("trading_name", { required: true })}
          placeholder="Trading name *"
          className="w-full border rounded px-3 py-2 text-sm"
        />
        <input
          {...register("legal_name")}
          placeholder="Legal / registered name"
          className="w-full border rounded px-3 py-2 text-sm"
        />
        <div className="grid grid-cols-2 gap-3">
          <input
            {...register("registration_number")}
            placeholder="Company reg. number"
            className="border rounded px-3 py-2 text-sm"
          />
          <input
            {...register("vat_number")}
            placeholder="VAT number"
            className="border rounded px-3 py-2 text-sm"
          />
        </div>
      </fieldset>

      {/* Exporter details */}
      <fieldset className="space-y-3">
        <legend className="text-sm font-medium text-gray-700">
          Exporter Details
        </legend>
        <div className="grid grid-cols-3 gap-3">
          <input
            {...register("exporter_code")}
            placeholder="Exporter code"
            className="border rounded px-3 py-2 text-sm"
          />
          <input
            {...register("fbo_code")}
            placeholder="FBO code"
            className="border rounded px-3 py-2 text-sm"
          />
          <input
            {...register("ppecb_code")}
            placeholder="PPECB code"
            className="border rounded px-3 py-2 text-sm"
          />
        </div>
      </fieldset>

      {/* Address */}
      <fieldset className="space-y-3">
        <legend className="text-sm font-medium text-gray-700">Address</legend>
        <input
          {...register("address_line_1")}
          placeholder="Street address"
          className="w-full border rounded px-3 py-2 text-sm"
        />
        <div className="grid grid-cols-3 gap-3">
          <input
            {...register("city")}
            placeholder="City"
            className="border rounded px-3 py-2 text-sm"
          />
          <input
            {...register("province")}
            placeholder="Province / State"
            className="border rounded px-3 py-2 text-sm"
          />
          <input
            {...register("postal_code")}
            placeholder="Postal code"
            className="border rounded px-3 py-2 text-sm"
          />
        </div>
        <input
          {...register("country")}
          placeholder="Country"
          className="w-full border rounded px-3 py-2 text-sm"
        />
      </fieldset>

      {/* Contact */}
      <fieldset className="space-y-3">
        <legend className="text-sm font-medium text-gray-700">
          Primary Contact
        </legend>
        <input
          {...register("contact_name")}
          placeholder="Full name"
          className="w-full border rounded px-3 py-2 text-sm"
        />
        <div className="grid grid-cols-2 gap-3">
          <input
            {...register("contact_email")}
            placeholder="Email"
            type="email"
            className="border rounded px-3 py-2 text-sm"
          />
          <input
            {...register("contact_phone")}
            placeholder="Phone"
            className="border rounded px-3 py-2 text-sm"
          />
        </div>
      </fieldset>

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
          disabled={saving || !formState.isValid}
          className="px-4 py-2 bg-green-600 text-white rounded text-sm font-medium hover:bg-green-700 disabled:opacity-50"
        >
          {saving && <Spinner />} Save & Continue
        </button>
      </div>
    </form>
  );
}
