import React from "react";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation("wizard");
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
          {t("step1.businessIdentity")}
        </legend>
        <input
          {...register("trading_name", { required: true })}
          placeholder={t("step1.tradingName")}
          className="w-full border rounded px-3 py-2 text-sm"
        />
        <input
          {...register("legal_name")}
          placeholder={t("step1.legalName")}
          className="w-full border rounded px-3 py-2 text-sm"
        />
        <div className="grid grid-cols-2 gap-3">
          <input
            {...register("registration_number")}
            placeholder={t("step1.companyReg")}
            className="border rounded px-3 py-2 text-sm"
          />
          <input
            {...register("vat_number")}
            placeholder={t("step1.vatNumber")}
            className="border rounded px-3 py-2 text-sm"
          />
        </div>
      </fieldset>

      {/* Exporter details */}
      <fieldset className="space-y-3">
        <legend className="text-sm font-medium text-gray-700">
          {t("step1.exporterDetails")}
        </legend>
        <div className="grid grid-cols-3 gap-3">
          <input
            {...register("exporter_code")}
            placeholder={t("step1.exporterCode")}
            className="border rounded px-3 py-2 text-sm"
          />
          <input
            {...register("fbo_code")}
            placeholder={t("step1.fboCode")}
            className="border rounded px-3 py-2 text-sm"
          />
          <input
            {...register("ppecb_code")}
            placeholder={t("step1.ppecbCode")}
            className="border rounded px-3 py-2 text-sm"
          />
        </div>
      </fieldset>

      {/* Address */}
      <fieldset className="space-y-3">
        <legend className="text-sm font-medium text-gray-700">{t("step1.address")}</legend>
        <input
          {...register("address_line_1")}
          placeholder={t("step1.streetAddress")}
          className="w-full border rounded px-3 py-2 text-sm"
        />
        <div className="grid grid-cols-3 gap-3">
          <input
            {...register("city")}
            placeholder={t("step1.city")}
            className="border rounded px-3 py-2 text-sm"
          />
          <input
            {...register("province")}
            placeholder={t("step1.province")}
            className="border rounded px-3 py-2 text-sm"
          />
          <input
            {...register("postal_code")}
            placeholder={t("step1.postalCode")}
            className="border rounded px-3 py-2 text-sm"
          />
        </div>
        <input
          {...register("country")}
          placeholder={t("step1.country")}
          className="w-full border rounded px-3 py-2 text-sm"
        />
      </fieldset>

      {/* Contact */}
      <fieldset className="space-y-3">
        <legend className="text-sm font-medium text-gray-700">
          {t("step1.primaryContact")}
        </legend>
        <input
          {...register("contact_name")}
          placeholder={t("step1.fullName")}
          className="w-full border rounded px-3 py-2 text-sm"
        />
        <div className="grid grid-cols-2 gap-3">
          <input
            {...register("contact_email")}
            placeholder={t("step1.email")}
            type="email"
            className="border rounded px-3 py-2 text-sm"
          />
          <input
            {...register("contact_phone")}
            placeholder={t("step1.phone")}
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
          {saving && <Spinner />} {t("saveDraft")}
        </button>
        <button
          type="button"
          onClick={saveAndComplete}
          disabled={saving || !formState.isValid}
          className="px-4 py-2 bg-green-600 text-white rounded text-sm font-medium hover:bg-green-700 disabled:opacity-50"
        >
          {saving && <Spinner />} {t("saveContinue")}
        </button>
      </div>
    </form>
  );
}
