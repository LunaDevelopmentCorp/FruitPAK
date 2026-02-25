import React, { useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import type { StepProps } from "../WizardShell";
import { Spinner } from "../WizardShell";

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

const EMPTY_GROWER: GrowerForm = {
  name: "", grower_code: "", contact_person: "", phone: "", region: "",
  total_hectares: null, estimated_volume_tons: null,
  globalg_ap_certified: false, globalg_ap_number: "",
};

export default function Step4Growers({ onSave, saving, draftData }: StepProps) {
  const { t } = useTranslation("wizard");
  const { register, control, watch, getValues, setError, clearErrors, formState } = useForm<FormData>({
    defaultValues: (draftData as Partial<FormData>) ?? { growers: [{ ...EMPTY_GROWER }] },
  });
  const { fields, append, remove } = useFieldArray({ control, name: "growers" });
  const [showForms, setShowForms] = useState(true);

  const growers = watch("growers");

  const hasUncertified = growers?.some((g) => g.name?.trim() && !g.globalg_ap_certified);
  const hasEntries = growers?.some((g) => g.name?.trim());
  const growerCount = growers?.filter((g) => g.name?.trim()).length ?? 0;

  const filterEmpty = (data: FormData) => ({
    growers: data.growers.filter((g) => g.name?.trim()),
  });
  const saveDraft = () => onSave(filterEmpty(getValues()), false);

  const saveAndComplete = () => {
    const filtered = filterEmpty(getValues());
    // Validate: certified growers must have GGN number
    let valid = true;
    filtered.growers.forEach((g, idx) => {
      if (g.globalg_ap_certified && !g.globalg_ap_number?.trim()) {
        setError(`growers.${idx}.globalg_ap_number`, {
          type: "manual",
          message: t("step4.ggnError"),
        });
        valid = false;
      }
    });
    if (!valid) {
      setShowForms(true);
      return;
    }
    return onSave(filtered, true);
  };

  return (
    <form className="space-y-6 max-w-2xl">
      {/* Certification warning */}
      {hasUncertified && (
        <div className="p-3 bg-yellow-50 border border-yellow-200 rounded text-sm text-yellow-800">
          {t("step4.certWarning")}
        </div>
      )}

      {/* Summary table */}
      {hasEntries && (
        <div className="bg-white rounded-lg border overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-b">
            <span className="text-xs font-medium text-gray-600 uppercase tracking-wide">
              {t("step4.growerCount", { count: growerCount })}
            </span>
            <button
              type="button"
              onClick={() => setShowForms(!showForms)}
              className="text-xs text-green-600 hover:text-green-700"
            >
              {t("step4.collapseExpand")}
            </button>
          </div>
          <table className="w-full text-sm">
            <thead className="text-gray-500 text-xs">
              <tr>
                <th className="text-left px-4 py-1.5 font-medium">{t("step4.headers.name")}</th>
                <th className="text-left px-4 py-1.5 font-medium">{t("step4.headers.code")}</th>
                <th className="text-left px-4 py-1.5 font-medium">{t("step4.headers.region")}</th>
                <th className="text-right px-4 py-1.5 font-medium">{t("step4.headers.hectares")}</th>
                <th className="text-center px-4 py-1.5 font-medium">{t("step4.headers.certified")}</th>
                <th className="px-4 py-1.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {growers.map((g, idx) =>
                g.name?.trim() ? (
                  <tr key={idx} className="hover:bg-gray-50">
                    <td className="px-4 py-1.5 font-medium">{g.name}</td>
                    <td className="px-4 py-1.5 text-gray-600 font-mono text-xs">{g.grower_code || "\u2014"}</td>
                    <td className="px-4 py-1.5 text-gray-600">{g.region || "\u2014"}</td>
                    <td className="px-4 py-1.5 text-gray-600 text-right">{g.total_hectares ?? "\u2014"}</td>
                    <td className="px-4 py-1.5 text-center">
                      {g.globalg_ap_certified
                        ? <span className="text-green-600">{"\u2713"}</span>
                        : <span className="text-gray-300">{"\u2014"}</span>}
                    </td>
                    <td className="px-4 py-1.5 text-right">
                      <button
                        type="button"
                        onClick={() => setShowForms(true)}
                        className="text-xs text-green-600 hover:text-green-700 mr-2"
                      >
                        {t("common:actions.edit")}
                      </button>
                      <button type="button" onClick={() => remove(idx)} className="text-xs text-red-500 hover:text-red-700">
                          {t("common:actions.remove")}
                        </button>
                    </td>
                  </tr>
                ) : null
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Collapsible form section */}
      {showForms && (
        <div className="space-y-4">
          {fields.map((field, idx) => {
            const isCertified = growers?.[idx]?.globalg_ap_certified;
            const ggnError = formState.errors.growers?.[idx]?.globalg_ap_number;
            return (
              <fieldset key={field.id} className="p-4 border rounded space-y-3">
                <div className="flex justify-between items-center">
                  <legend className="text-sm font-medium text-gray-700">{t("step4.grower", { index: idx + 1 })}</legend>
                  <button type="button" onClick={() => remove(idx)} className="text-xs text-red-500 hover:text-red-700">{t("common:actions.remove")}</button>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <input {...register(`growers.${idx}.name`)} placeholder={t("step4.growerName")} className="border rounded px-3 py-2 text-sm" />
                  <input {...register(`growers.${idx}.grower_code`)} placeholder={t("step4.growerCode")} className="border rounded px-3 py-2 text-sm" />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <input {...register(`growers.${idx}.contact_person`)} placeholder={t("step4.contact")} className="border rounded px-3 py-2 text-sm" />
                  <input {...register(`growers.${idx}.phone`)} placeholder={t("step4.phone")} className="border rounded px-3 py-2 text-sm" />
                  <input {...register(`growers.${idx}.region`)} placeholder={t("step4.region")} className="border rounded px-3 py-2 text-sm" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <input {...register(`growers.${idx}.total_hectares`, { valueAsNumber: true })} placeholder={t("step4.totalHectares")} type="number" className="border rounded px-3 py-2 text-sm" />
                  <input {...register(`growers.${idx}.estimated_volume_tons`, { valueAsNumber: true })} placeholder={t("step4.estVolume")} type="number" className="border rounded px-3 py-2 text-sm" />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-3">
                    <label className="flex items-center gap-1 text-sm">
                      <input
                        type="checkbox"
                        {...register(`growers.${idx}.globalg_ap_certified`, {
                          onChange: () => clearErrors(`growers.${idx}.globalg_ap_number`),
                        })}
                      />
                      {t("step4.certified")}
                    </label>
                    <div className="flex-1">
                      <input
                        {...register(`growers.${idx}.globalg_ap_number`, {
                          required: isCertified ? t("step4.ggnError") : false,
                        })}
                        placeholder={isCertified ? t("step4.ggnRequired") : t("step4.ggnOptional")}
                        className={`w-full border rounded px-3 py-2 text-sm ${ggnError ? "border-red-400" : ""}`}
                      />
                    </div>
                  </div>
                  {ggnError && (
                    <p className="text-xs text-red-500 ml-6">{ggnError.message}</p>
                  )}
                </div>
              </fieldset>
            );
          })}
        </div>
      )}

      <button
        type="button"
        onClick={() => { append({ ...EMPTY_GROWER }); setShowForms(true); }}
        className="text-sm text-green-600"
      >
        {t("step4.addGrower")}
      </button>

      <div className="flex gap-3 pt-4 border-t">
        <button type="button" onClick={saveDraft} disabled={saving} className="px-4 py-2 border rounded text-sm">
          {saving && <Spinner />} {t("saveDraft")}
        </button>
        <button type="button" onClick={saveAndComplete} disabled={saving} className="px-4 py-2 bg-green-600 text-white rounded text-sm font-medium">
          {saving && <Spinner />} {t("saveContinue")}
        </button>
      </div>
    </form>
  );
}
