import React, { useMemo, useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import type { StepProps } from "../WizardShell";
import { Spinner } from "../WizardShell";
import { useTableSort, sortRows, sortableThClass } from "../../../hooks/useTableSort";

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
  const { t } = useTranslation("wizard");
  const { register, control, watch, getValues } = useForm<FormData>({
    defaultValues: (draftData as Partial<FormData>) ?? {
      suppliers: [{ name: "", tags: [], contact_person: "", phone: "", email: "" }],
    },
  });
  const { fields, append, remove } = useFieldArray({ control, name: "suppliers" });
  const [showForms, setShowForms] = useState(true);
  const { sortCol, sortDir, toggleSort, sortIndicator } = useTableSort();

  const suppliers = watch("suppliers");

  // Build display rows with original indices, then sort
  const sortedSuppliers = useMemo(() => {
    const rows = suppliers
      ?.map((s, idx) => ({ ...s, _idx: idx }))
      .filter((s) => s.name?.trim()) ?? [];
    return sortRows(rows, sortCol, sortDir, {
      name: (r) => r.name,
      tags: (r) => (r.tags || []).join(", "),
      contact_person: (r) => r.contact_person || "",
      phone: (r) => r.phone || "",
    });
  }, [suppliers, sortCol, sortDir]);

  const filterEmpty = (data: FormData) => ({
    suppliers: data.suppliers.filter((s) => s.name?.trim()),
  });
  const saveDraft = () => onSave(filterEmpty(getValues()), false);
  const saveAndComplete = () => onSave(filterEmpty(getValues()), true);

  const hasEntries = suppliers?.some((s) => s.name?.trim());
  const supplierCount = suppliers?.filter((s) => s.name?.trim()).length ?? 0;

  return (
    <form className="space-y-6 max-w-2xl">
      {/* Summary table */}
      {hasEntries && (
        <div className="bg-white rounded-lg border overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-b">
            <span className="text-xs font-medium text-gray-600 uppercase tracking-wide">
              {t("step3.supplierCount", { count: supplierCount })}
            </span>
            <button
              type="button"
              onClick={() => setShowForms(!showForms)}
              className="text-xs text-green-600 hover:text-green-700"
            >
              {t("step3.collapseExpand")}
            </button>
          </div>
          <table className="w-full text-sm">
            <thead className="text-gray-500 text-xs">
              <tr>
                <th className={`text-left px-4 py-1.5 font-medium ${sortableThClass}`} onClick={() => toggleSort("name")}>{t("common:table.name")}{sortIndicator("name")}</th>
                <th className={`text-left px-4 py-1.5 font-medium ${sortableThClass}`} onClick={() => toggleSort("tags")}>Tags{sortIndicator("tags")}</th>
                <th className={`text-left px-4 py-1.5 font-medium ${sortableThClass}`} onClick={() => toggleSort("contact_person")}>{t("common:table.contact")}{sortIndicator("contact_person")}</th>
                <th className={`text-left px-4 py-1.5 font-medium ${sortableThClass}`} onClick={() => toggleSort("phone")}>{t("common:table.phone")}{sortIndicator("phone")}</th>
                <th className="px-4 py-1.5"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {sortedSuppliers.map((s) => (
                  <tr key={s._idx} className="hover:bg-gray-50">
                    <td className="px-4 py-1.5 font-medium">{s.name}</td>
                    <td className="px-4 py-1.5">
                      <div className="flex flex-wrap gap-1">
                        {(s.tags || []).map((tg) => (
                          <span key={tg} className="bg-gray-100 text-gray-600 text-xs px-1.5 py-0.5 rounded">
                            {tg}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-1.5 text-gray-600">{s.contact_person || "\u2014"}</td>
                    <td className="px-4 py-1.5 text-gray-600">{s.phone || "\u2014"}</td>
                    <td className="px-4 py-1.5 text-right">
                      <button
                        type="button"
                        onClick={() => setShowForms(true)}
                        className="text-xs text-green-600 hover:text-green-700 mr-2"
                      >
                        {t("common:actions.edit")}
                      </button>
                      <button type="button" onClick={() => remove(s._idx)} className="text-xs text-red-500">
                          {t("common:actions.remove")}
                        </button>
                    </td>
                  </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Collapsible form section */}
      {showForms && (
        <div className="space-y-4">
          {fields.map((field, idx) => (
            <fieldset key={field.id} className="p-4 border rounded space-y-3">
              <div className="flex justify-between items-center">
                <legend className="text-sm font-medium text-gray-700">{t("step3.supplier", { index: idx + 1 })}</legend>
                <button type="button" onClick={() => remove(idx)} className="text-xs text-red-500 hover:text-red-700">{t("common:actions.remove")}</button>
              </div>
              <input {...register(`suppliers.${idx}.name`)} placeholder={t("step3.supplierName")} className="w-full border rounded px-3 py-2 text-sm" />
              <div className="flex flex-wrap gap-2">
                {TAG_OPTIONS.map((tag) => (
                  <label key={tag} className="flex items-center gap-1 text-xs">
                    <input type="checkbox" value={tag} {...register(`suppliers.${idx}.tags`)} />
                    {tag}
                  </label>
                ))}
              </div>
              <div className="grid grid-cols-3 gap-3">
                <input {...register(`suppliers.${idx}.contact_person`)} placeholder={t("step3.contactPerson")} className="border rounded px-3 py-2 text-sm" />
                <input {...register(`suppliers.${idx}.phone`)} placeholder={t("step3.phone")} className="border rounded px-3 py-2 text-sm" />
                <input {...register(`suppliers.${idx}.email`)} placeholder={t("step3.email")} className="border rounded px-3 py-2 text-sm" />
              </div>
            </fieldset>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={() => { append({ name: "", tags: [], contact_person: "", phone: "", email: "" }); setShowForms(true); }}
        className="text-sm text-green-600"
      >
        {t("step3.addSupplier")}
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
