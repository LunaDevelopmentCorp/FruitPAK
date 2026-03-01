import React, { useState } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import type { StepProps } from "../WizardShell";
import { Spinner } from "../WizardShell";

interface TransportForm {
  name: string;
  container_type: string;
  temp_setpoint_c: number | null;
  pallet_capacity: number | null;
  max_weight_kg: number | null;
}

interface ContactEntity {
  name: string;
  code: string;
  contact_person: string;
  phone: string;
  email: string;
}

interface FormData {
  transport_configs: TransportForm[];
  shipping_lines: ContactEntity[];
  transporters: ContactEntity[];
  shipping_agents: ContactEntity[];
}

const CONTAINER_TYPES = ["reefer_20ft", "reefer_40ft", "open_truck", "break_bulk"];

const EMPTY_CONTACT: ContactEntity = { name: "", code: "", contact_person: "", phone: "", email: "" };

function CollapsibleSection({ title, children, defaultOpen = false }: { title: React.ReactNode; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border rounded">
      <button type="button" onClick={() => setOpen(!open)} className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50">
        <span>{title}</span>
        <svg className={`w-4 h-4 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && <div className="px-4 pb-4 space-y-3">{children}</div>}
    </div>
  );
}

export default function Step7Transport({ onSave, saving, draftData }: StepProps) {
  const { t } = useTranslation("wizard");
  const { register, control, watch, getValues } = useForm<FormData>({
    defaultValues: (draftData as Partial<FormData>) ?? {
      transport_configs: [{ name: "", container_type: "reefer_40ft", temp_setpoint_c: null, pallet_capacity: null, max_weight_kg: null }],
      shipping_lines: [],
      transporters: [],
      shipping_agents: [],
    },
  });
  const { fields, append, remove } = useFieldArray({ control, name: "transport_configs" });
  const { fields: slFields, append: slAppend, remove: slRemove } = useFieldArray({ control, name: "shipping_lines" });
  const { fields: trFields, append: trAppend, remove: trRemove } = useFieldArray({ control, name: "transporters" });
  const { fields: saFields, append: saAppend, remove: saRemove } = useFieldArray({ control, name: "shipping_agents" });

  const configs = watch("transport_configs");

  const filterEmpty = (data: FormData) => ({
    transport_configs: data.transport_configs.filter((c) => c.name?.trim()),
    shipping_lines: data.shipping_lines.filter((c) => c.name?.trim()),
    transporters: data.transporters.filter((c) => c.name?.trim()),
    shipping_agents: data.shipping_agents.filter((c) => c.name?.trim()),
  });
  const saveDraft = () => onSave(filterEmpty(getValues()), false);
  const saveAndComplete = () => onSave(filterEmpty(getValues()), true);

  return (
    <form className="space-y-6 max-w-2xl">
      {fields.map((field, idx) => {
        const tempC = configs?.[idx]?.temp_setpoint_c;
        const weightKg = configs?.[idx]?.max_weight_kg;
        return (
          <fieldset key={field.id} className="p-4 border rounded space-y-3">
            <div className="flex justify-between items-center">
              <legend className="text-sm font-medium text-gray-700">{t("step7.config", { index: idx + 1 })}</legend>
              <button type="button" onClick={() => remove(idx)} className="text-xs text-red-500 hover:text-red-700">{t("common:actions.remove")}</button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <input {...register(`transport_configs.${idx}.name`)} placeholder={t("step7.name")} className="border rounded px-3 py-2 text-sm" />
              <select {...register(`transport_configs.${idx}.container_type`)} className="border rounded px-3 py-2 text-sm">
                {CONTAINER_TYPES.map((ct) => <option key={ct} value={ct}>{ct.replace(/_/g, " ")}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <input {...register(`transport_configs.${idx}.temp_setpoint_c`, { valueAsNumber: true })} placeholder={t("step7.tempC")} type="number" step="0.5" className="w-full border rounded px-3 py-2 text-sm" />
                {tempC != null && !isNaN(tempC) && (
                  <span className="text-xs text-gray-400 mt-0.5 block">
                    {"\u2248"} {(tempC * 9 / 5 + 32).toFixed(1)} {"\u00B0F"}
                  </span>
                )}
              </div>
              <input {...register(`transport_configs.${idx}.pallet_capacity`, { valueAsNumber: true })} placeholder={t("step7.palletCapacity")} type="number" className="border rounded px-3 py-2 text-sm" />
              <div>
                <input {...register(`transport_configs.${idx}.max_weight_kg`, { valueAsNumber: true })} placeholder={t("step7.maxWeightKg")} type="number" className="w-full border rounded px-3 py-2 text-sm" />
                {weightKg != null && weightKg > 0 && (
                  <span className="text-xs text-gray-400 mt-0.5 block">
                    {"\u2248"} {(weightKg * 2.20462).toLocaleString(undefined, { maximumFractionDigits: 0 })} lb
                  </span>
                )}
              </div>
            </div>
          </fieldset>
        );
      })}
      <button type="button" onClick={() => append({ name: "", container_type: "reefer_40ft", temp_setpoint_c: null, pallet_capacity: null, max_weight_kg: null })} className="text-sm text-green-600">{t("step7.addConfig")}</button>

      {/* Shipping Lines */}
      <CollapsibleSection title={t("step7.shippingLines")}>
        {slFields.map((field, idx) => (
          <fieldset key={field.id} className="p-3 border rounded space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-xs font-medium text-gray-500">{idx + 1}</span>
              <button type="button" onClick={() => slRemove(idx)} className="text-xs text-red-500 hover:text-red-700">{t("common:actions.remove")}</button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input {...register(`shipping_lines.${idx}.name`)} placeholder={t("step7.shippingLineName")} className="border rounded px-3 py-2 text-sm" />
              <input {...register(`shipping_lines.${idx}.code`)} placeholder={t("step7.shippingLineCode")} className="border rounded px-3 py-2 text-sm" />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <input {...register(`shipping_lines.${idx}.contact_person`)} placeholder={t("step7.contactPerson")} className="border rounded px-3 py-2 text-sm" />
              <input {...register(`shipping_lines.${idx}.phone`)} placeholder={t("step7.phone")} className="border rounded px-3 py-2 text-sm" />
              <input {...register(`shipping_lines.${idx}.email`)} placeholder={t("step7.email")} type="email" className="border rounded px-3 py-2 text-sm" />
            </div>
          </fieldset>
        ))}
        <button type="button" onClick={() => slAppend({ ...EMPTY_CONTACT })} className="text-sm text-green-600">{t("step7.addShippingLine")}</button>
      </CollapsibleSection>

      {/* Transporters */}
      <CollapsibleSection title={t("step7.transporters")}>
        {trFields.map((field, idx) => (
          <fieldset key={field.id} className="p-3 border rounded space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-xs font-medium text-gray-500">{idx + 1}</span>
              <button type="button" onClick={() => trRemove(idx)} className="text-xs text-red-500 hover:text-red-700">{t("common:actions.remove")}</button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input {...register(`transporters.${idx}.name`)} placeholder={t("step7.transporterName")} className="border rounded px-3 py-2 text-sm" />
              <input {...register(`transporters.${idx}.code`)} placeholder={t("step7.transporterCode")} className="border rounded px-3 py-2 text-sm" />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <input {...register(`transporters.${idx}.contact_person`)} placeholder={t("step7.contactPerson")} className="border rounded px-3 py-2 text-sm" />
              <input {...register(`transporters.${idx}.phone`)} placeholder={t("step7.phone")} className="border rounded px-3 py-2 text-sm" />
              <input {...register(`transporters.${idx}.email`)} placeholder={t("step7.email")} type="email" className="border rounded px-3 py-2 text-sm" />
            </div>
          </fieldset>
        ))}
        <button type="button" onClick={() => trAppend({ ...EMPTY_CONTACT })} className="text-sm text-green-600">{t("step7.addTransporter")}</button>
      </CollapsibleSection>

      {/* Shipping Agents */}
      <CollapsibleSection title={t("step7.shippingAgents")}>
        {saFields.map((field, idx) => (
          <fieldset key={field.id} className="p-3 border rounded space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-xs font-medium text-gray-500">{idx + 1}</span>
              <button type="button" onClick={() => saRemove(idx)} className="text-xs text-red-500 hover:text-red-700">{t("common:actions.remove")}</button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <input {...register(`shipping_agents.${idx}.name`)} placeholder={t("step7.agentName")} className="border rounded px-3 py-2 text-sm" />
              <input {...register(`shipping_agents.${idx}.code`)} placeholder={t("step7.agentCode")} className="border rounded px-3 py-2 text-sm" />
            </div>
            <div className="grid grid-cols-3 gap-2">
              <input {...register(`shipping_agents.${idx}.contact_person`)} placeholder={t("step7.contactPerson")} className="border rounded px-3 py-2 text-sm" />
              <input {...register(`shipping_agents.${idx}.phone`)} placeholder={t("step7.phone")} className="border rounded px-3 py-2 text-sm" />
              <input {...register(`shipping_agents.${idx}.email`)} placeholder={t("step7.email")} type="email" className="border rounded px-3 py-2 text-sm" />
            </div>
          </fieldset>
        ))}
        <button type="button" onClick={() => saAppend({ ...EMPTY_CONTACT })} className="text-sm text-green-600">{t("step7.addShippingAgent")}</button>
      </CollapsibleSection>

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
