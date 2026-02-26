import { useFieldArray, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import type { StepProps } from "../WizardShell";
import { Spinner } from "../WizardShell";

interface ProductForm {
  fruit_type: string;
  variety: string;
  grades: string;
  sizes: string;
}

interface PackSpecForm {
  name: string;
  pack_type: string;
  weight_kg: number | null;
  cartons_per_layer: number | null;
  layers_per_pallet: number | null;
  target_market: string;
}

interface BoxTypeForm {
  name: string;
  weight_kg: number;
  dimensions: string;
  tare_weight_kg: number;
  net_weight_target_kg: number | null;
  min_weight_kg: number | null;
  max_weight_kg: number | null;
}

interface BoxCapacityForm {
  box_size_name: string;
  capacity: number;
}

interface PalletTypeForm {
  name: string;
  capacity_boxes: number;
  notes: string;
  box_capacities: BoxCapacityForm[];
}

interface BinTypeForm {
  name: string;
  default_weight_kg: number;
  tare_weight_kg: number;
}

interface PalletRulesForm {
  allow_mixed_sizes: boolean;
  allow_mixed_box_types: boolean;
}

interface FormData {
  products: ProductForm[];
  pack_specs: PackSpecForm[];
  box_sizes: BoxTypeForm[];
  pallet_types: PalletTypeForm[];
  bin_types: BinTypeForm[];
  pallet_rules: PalletRulesForm;
}

const COMMON_PACK_SPECS: PackSpecForm[] = [
  { name: "4kg Open Top", pack_type: "carton", weight_kg: 4, cartons_per_layer: 15, layers_per_pallet: 8, target_market: "EU" },
  { name: "10kg Bulk Bin", pack_type: "bulk bin", weight_kg: 10, cartons_per_layer: 1, layers_per_pallet: 1, target_market: "Local" },
  { name: "2.5kg Flow Wrap", pack_type: "flow wrap", weight_kg: 2.5, cartons_per_layer: 20, layers_per_pallet: 8, target_market: "UK" },
  { name: "15kg Telescopic", pack_type: "telescopic", weight_kg: 15, cartons_per_layer: 10, layers_per_pallet: 6, target_market: "EU" },
  { name: "1kg Punnet Tray", pack_type: "punnet", weight_kg: 1, cartons_per_layer: 24, layers_per_pallet: 10, target_market: "EU" },
  { name: "5kg Net Bag", pack_type: "net bag", weight_kg: 5, cartons_per_layer: 18, layers_per_pallet: 8, target_market: "Local" },
];

const EMPTY_BOX: BoxTypeForm = { name: "", weight_kg: 4.0, dimensions: "", tare_weight_kg: 0, net_weight_target_kg: null, min_weight_kg: null, max_weight_kg: null };
const EMPTY_PALLET: PalletTypeForm = { name: "", capacity_boxes: 240, notes: "", box_capacities: [] };
const EMPTY_BIN: BinTypeForm = { name: "", default_weight_kg: 0, tare_weight_kg: 0 };

export default function Step6ProductPacking({ onSave, saving, draftData }: StepProps) {
  const { t } = useTranslation("wizard");
  const { register, control, watch, getValues, setValue } = useForm<FormData>({
    defaultValues: (draftData as Partial<FormData>) ?? {
      products: [{ fruit_type: "", variety: "", grades: "", sizes: "" }],
      pack_specs: [{ name: "", pack_type: "", weight_kg: null, cartons_per_layer: null, layers_per_pallet: null, target_market: "" }],
      box_sizes: [],
      pallet_types: [],
      bin_types: [],
      pallet_rules: { allow_mixed_sizes: false, allow_mixed_box_types: false },
    },
  });
  const products = useFieldArray({ control, name: "products" });
  const packSpecs = useFieldArray({ control, name: "pack_specs" });
  const boxSizes = useFieldArray({ control, name: "box_sizes" });
  const palletTypes = useFieldArray({ control, name: "pallet_types" });
  const binTypes = useFieldArray({ control, name: "bin_types" });

  const currentSpecs = watch("pack_specs");
  const currentBoxSizes = watch("box_sizes");
  const addedNames = new Set(currentSpecs?.map((s) => s.name) ?? []);

  const addPreset = (preset: PackSpecForm) => {
    const firstEmptyIdx = currentSpecs?.findIndex((s) => !s.name?.trim());
    if (firstEmptyIdx !== undefined && firstEmptyIdx >= 0) {
      packSpecs.remove(firstEmptyIdx);
    }
    packSpecs.append({ ...preset });
  };

  const transform = (data: FormData) => ({
    products: data.products
      .filter((p) => p.fruit_type?.trim())
      .flatMap((p) => {
        const grades = Array.isArray(p.grades) ? p.grades : p.grades ? p.grades.split(",").map((s) => s.trim()).filter(Boolean) : [];
        const sizes = Array.isArray(p.sizes) ? p.sizes : p.sizes ? p.sizes.split(",").map((s) => s.trim()).filter(Boolean) : [];
        // Split comma-separated varieties into separate product entries
        const varieties = p.variety ? p.variety.split(",").map((s) => s.trim()).filter(Boolean) : [""];
        return varieties.map((v) => ({
          fruit_type: p.fruit_type,
          variety: v,
          grades,
          sizes,
        }));
      }),
    pack_specs: data.pack_specs.filter((s) => s.name?.trim()),
    box_sizes: data.box_sizes.filter((b) => b.name?.trim()),
    pallet_types: data.pallet_types
      .filter((p) => p.name?.trim())
      .map((p) => ({
        ...p,
        box_capacities: (p.box_capacities || []).filter((bc) => bc.box_size_name?.trim() && bc.capacity > 0),
      })),
    bin_types: data.bin_types.filter((b) => b.name?.trim()),
    pallet_rules: data.pallet_rules,
  });

  const saveDraft = () => onSave(transform(getValues()), false);
  const saveAndComplete = () => onSave(transform(getValues()), true);

  // Get valid box size names for capacity dropdowns
  const boxSizeNames = (currentBoxSizes || []).map((b) => b.name).filter((n) => n?.trim());

  return (
    <form className="space-y-8 max-w-4xl">
      {/* Products */}
      <div className="space-y-4">
        <h3 className="text-sm font-medium text-gray-700">{t("step6.products")}</h3>
        {products.fields.map((field, idx) => (
          <fieldset key={field.id} className="p-4 border rounded space-y-3">
            <div className="flex justify-between items-center">
              <legend className="text-xs font-medium text-gray-500">{t("step6.product", { index: idx + 1 })}</legend>
              <button type="button" onClick={() => products.remove(idx)} className="text-xs text-red-500 hover:text-red-700">{t("common:actions.remove")}</button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <input {...register(`products.${idx}.fruit_type`)} placeholder={t("step6.fruitType")} className="border rounded px-3 py-2 text-sm" />
              <input {...register(`products.${idx}.variety`)} placeholder={t("step6.variety")} className="border rounded px-3 py-2 text-sm" />
            </div>
            <input {...register(`products.${idx}.grades`)} placeholder={t("step6.grades")} className="w-full border rounded px-3 py-2 text-sm" />
            <input {...register(`products.${idx}.sizes`)} placeholder={t("step6.sizes")} className="w-full border rounded px-3 py-2 text-sm" />
          </fieldset>
        ))}
        <button type="button" onClick={() => products.append({ fruit_type: "", variety: "", grades: "", sizes: "" })} className="text-sm text-green-600">{t("step6.addProduct")}</button>
      </div>

      {/* Bin Types */}
      <div className="space-y-4">
        <h3 className="text-sm font-medium text-gray-700">{t("step6.binTypes")}</h3>
        <p className="text-xs text-gray-500">
          {t("step6.binTypesHelp")}
        </p>

        {binTypes.fields.length > 0 && (
          <div className="border rounded overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600 text-xs">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">{t("step6.binName")}</th>
                  <th className="text-right px-3 py-2 font-medium">{t("step6.defaultWeight")}</th>
                  <th className="text-right px-3 py-2 font-medium">{t("step6.tareWeight")}</th>
                  <th className="w-16"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {binTypes.fields.map((field, idx) => (
                  <tr key={field.id}>
                    <td className="px-3 py-2">
                      <input
                        {...register(`bin_types.${idx}.name`)}
                        placeholder={t("step6.binNamePlaceholder")}
                        className="w-full border rounded px-2 py-1.5 text-sm"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        {...register(`bin_types.${idx}.default_weight_kg`, { valueAsNumber: true })}
                        type="number"
                        step="0.1"
                        min={0}
                        placeholder={t("step6.fullBinWeight")}
                        className="w-full border rounded px-2 py-1.5 text-sm text-right"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        {...register(`bin_types.${idx}.tare_weight_kg`, { valueAsNumber: true })}
                        type="number"
                        step="0.1"
                        min={0}
                        className="w-full border rounded px-2 py-1.5 text-sm text-right"
                      />
                    </td>
                    <td className="px-3 py-2 text-center">
                      <button type="button" onClick={() => binTypes.remove(idx)} className="text-xs text-red-500 hover:text-red-700">
                        {t("common:actions.remove")}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {binTypes.fields.length === 0 && (
          <p className="text-xs text-gray-400 italic">{t("step6.noBinTypes")}</p>
        )}

        <button
          type="button"
          onClick={() => binTypes.append({ ...EMPTY_BIN })}
          className="text-sm text-green-600"
        >
          {t("step6.addBinType")}
        </button>
      </div>

      {/* Pack specs — presets */}
      <div className="space-y-4">
        <h3 className="text-sm font-medium text-gray-700">{t("step6.packSpecs")}</h3>

        <div className="bg-gray-50 rounded-lg p-4 border">
          <p className="text-xs text-gray-500 mb-2">{t("step6.quickAdd")}</p>
          <div className="flex flex-wrap gap-2">
            {COMMON_PACK_SPECS.map((preset) => {
              const alreadyAdded = addedNames.has(preset.name);
              return (
                <button
                  key={preset.name}
                  type="button"
                  onClick={() => !alreadyAdded && addPreset(preset)}
                  disabled={alreadyAdded}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                    alreadyAdded
                      ? "bg-green-50 border-green-200 text-green-600 cursor-default"
                      : "bg-white border-gray-300 text-gray-700 hover:border-green-400 hover:text-green-700"
                  }`}
                >
                  {alreadyAdded ? "\u2713 " : "+ "}
                  {preset.name} ({preset.weight_kg}kg, {preset.target_market})
                </button>
              );
            })}
          </div>
        </div>

        {/* Manual pack spec entries */}
        {packSpecs.fields.map((field, idx) => (
          <fieldset key={field.id} className="p-4 border rounded space-y-3">
            <div className="flex justify-between items-center">
              <legend className="text-xs font-medium text-gray-500">Spec {idx + 1}</legend>
              <button type="button" onClick={() => packSpecs.remove(idx)} className="text-xs text-red-500 hover:text-red-700">{t("common:actions.remove")}</button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <input {...register(`pack_specs.${idx}.name`)} placeholder={t("step6.specName")} className="border rounded px-3 py-2 text-sm" />
              <input {...register(`pack_specs.${idx}.pack_type`)} placeholder={t("step6.packType")} className="border rounded px-3 py-2 text-sm" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <input {...register(`pack_specs.${idx}.weight_kg`, { valueAsNumber: true })} placeholder={t("step6.weightKg")} type="number" className="border rounded px-3 py-2 text-sm" />
              <input {...register(`pack_specs.${idx}.cartons_per_layer`, { valueAsNumber: true })} placeholder={t("step6.cartonsPerLayer")} type="number" className="border rounded px-3 py-2 text-sm" />
              <input {...register(`pack_specs.${idx}.layers_per_pallet`, { valueAsNumber: true })} placeholder={t("step6.layersPerPallet")} type="number" className="border rounded px-3 py-2 text-sm" />
            </div>
            <input {...register(`pack_specs.${idx}.target_market`)} placeholder={t("step6.targetMarket")} className="w-full border rounded px-3 py-2 text-sm" />
          </fieldset>
        ))}
        <button type="button" onClick={() => packSpecs.append({ name: "", pack_type: "", weight_kg: null, cartons_per_layer: null, layers_per_pallet: null, target_market: "" })} className="text-sm text-green-600">{t("step6.addPackSpec")}</button>
      </div>

      {/* Box Types */}
      <div className="space-y-4">
        <h3 className="text-sm font-medium text-gray-700">{t("step6.boxTypes")}</h3>
        <p className="text-xs text-gray-500">
          {t("step6.boxTypesHelp")}
        </p>

        {boxSizes.fields.length > 0 && (
          <div className="border rounded overflow-hidden overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600 text-xs">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">{t("step6.boxName")}</th>
                  <th className="text-right px-3 py-2 font-medium">{t("step6.weightKg")}</th>
                  <th className="text-left px-3 py-2 font-medium">{t("step6.dimensions")}</th>
                  <th className="text-right px-3 py-2 font-medium">{t("step6.tare")}</th>
                  <th className="text-right px-3 py-2 font-medium">{t("step6.netTarget")}</th>
                  <th className="text-right px-3 py-2 font-medium">{t("step6.min")}</th>
                  <th className="text-right px-3 py-2 font-medium">{t("step6.max")}</th>
                  <th className="w-16"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {boxSizes.fields.map((field, idx) => (
                  <tr key={field.id}>
                    <td className="px-3 py-2">
                      <input
                        {...register(`box_sizes.${idx}.name`)}
                        placeholder={t("step6.boxNamePlaceholder")}
                        className="min-w-[140px] w-full border rounded px-2 py-1.5 text-sm"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        {...register(`box_sizes.${idx}.weight_kg`, { valueAsNumber: true })}
                        type="number"
                        step="0.1"
                        min={0.1}
                        className="min-w-[80px] w-full border rounded px-2 py-1.5 text-sm text-right"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        {...register(`box_sizes.${idx}.dimensions`)}
                        placeholder={t("step6.dimPlaceholder")}
                        className="min-w-[120px] w-full border rounded px-2 py-1.5 text-sm"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        {...register(`box_sizes.${idx}.tare_weight_kg`, { valueAsNumber: true })}
                        type="number"
                        step="0.01"
                        min={0}
                        placeholder="0"
                        className="min-w-[80px] w-full border rounded px-2 py-1.5 text-sm text-right"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        {...register(`box_sizes.${idx}.net_weight_target_kg`, { valueAsNumber: true })}
                        type="number"
                        step="0.1"
                        min={0}
                        placeholder="--"
                        className="min-w-[80px] w-full border rounded px-2 py-1.5 text-sm text-right"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        {...register(`box_sizes.${idx}.min_weight_kg`, { valueAsNumber: true })}
                        type="number"
                        step="0.1"
                        min={0}
                        placeholder="--"
                        className="min-w-[80px] w-full border rounded px-2 py-1.5 text-sm text-right"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        {...register(`box_sizes.${idx}.max_weight_kg`, { valueAsNumber: true })}
                        type="number"
                        step="0.1"
                        min={0}
                        placeholder="--"
                        className="min-w-[80px] w-full border rounded px-2 py-1.5 text-sm text-right"
                      />
                    </td>
                    <td className="px-3 py-2 text-center">
                      <button type="button" onClick={() => boxSizes.remove(idx)} className="text-xs text-red-500 hover:text-red-700">
                        {t("common:actions.remove")}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {boxSizes.fields.length === 0 && (
          <p className="text-xs text-gray-400 italic">{t("step6.noBoxTypes")}</p>
        )}

        <button
          type="button"
          onClick={() => boxSizes.append({ ...EMPTY_BOX })}
          className="text-sm text-green-600"
        >
          {t("step6.addBoxType")}
        </button>
      </div>

      {/* Pallet Structures */}
      <div className="space-y-4">
        <h3 className="text-sm font-medium text-gray-700">{t("step6.palletStructures")}</h3>
        <p className="text-xs text-gray-500">
          {t("step6.palletStructuresHelp")}
        </p>

        {palletTypes.fields.map((field, idx) => {
          const currentPallet = watch(`pallet_types.${idx}`);
          return (
            <fieldset key={field.id} className="p-4 border rounded space-y-3">
              <div className="flex justify-between items-center">
                <legend className="text-xs font-medium text-gray-500">{t("step6.palletType", { index: idx + 1 })}</legend>
                <button type="button" onClick={() => palletTypes.remove(idx)} className="text-xs text-red-500 hover:text-red-700">
                  {t("common:actions.remove")}
                </button>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <input
                  {...register(`pallet_types.${idx}.name`)}
                  placeholder={t("step6.palletTypePlaceholder")}
                  className="border rounded px-2 py-1.5 text-sm"
                />
                <input
                  {...register(`pallet_types.${idx}.capacity_boxes`, { valueAsNumber: true, min: 1 })}
                  type="number"
                  min={1}
                  placeholder={t("step6.defaultCapacity")}
                  className="border rounded px-2 py-1.5 text-sm text-right"
                />
                <input
                  {...register(`pallet_types.${idx}.notes`)}
                  placeholder={t("step6.notesOptional")}
                  className="border rounded px-2 py-1.5 text-sm"
                />
              </div>

              {/* Per-box-size capacity overrides */}
              {boxSizeNames.length > 0 && (
                <div className="mt-2 bg-gray-50 rounded p-3 space-y-2">
                  <p className="text-xs text-gray-500 font-medium">{t("step6.capacityPerBoxType")}</p>
                  <p className="text-xs text-gray-400">
                    {t("step6.capacityPerBoxHelp", { capacity: currentPallet?.capacity_boxes || 240 })}
                  </p>
                  <div className="space-y-1">
                    {boxSizeNames.map((bsName) => {
                      const caps = currentPallet?.box_capacities || [];
                      const existingIdx = caps.findIndex((c) => c.box_size_name === bsName);
                      return (
                        <div key={bsName} className="flex items-center gap-2">
                          <span className="text-xs text-gray-600 w-32 truncate">{bsName}</span>
                          <input
                            type="number"
                            min={1}
                            placeholder={String(currentPallet?.capacity_boxes || 240)}
                            className="border rounded px-2 py-1 text-xs text-right w-24"
                            value={existingIdx >= 0 ? caps[existingIdx].capacity || "" : ""}
                            onChange={(e) => {
                              const val = e.target.value ? parseInt(e.target.value, 10) : 0;
                              const newCaps = [...(currentPallet?.box_capacities || [])];
                              if (existingIdx >= 0) {
                                if (val > 0) {
                                  newCaps[existingIdx] = { box_size_name: bsName, capacity: val };
                                } else {
                                  newCaps.splice(existingIdx, 1);
                                }
                              } else if (val > 0) {
                                newCaps.push({ box_size_name: bsName, capacity: val });
                              }
                              setValue(`pallet_types.${idx}.box_capacities`, newCaps);
                            }}
                          />
                          <span className="text-xs text-gray-400">{t("common:units.boxes")}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </fieldset>
          );
        })}

        {palletTypes.fields.length === 0 && (
          <p className="text-xs text-gray-400 italic">{t("step6.noPalletTypes")}</p>
        )}

        <button
          type="button"
          onClick={() => palletTypes.append({ ...EMPTY_PALLET })}
          className="text-sm text-green-600"
        >
          {t("step6.addPalletType")}
        </button>
      </div>

      {/* Pallet Rules */}
      <div className="space-y-4">
        <h3 className="text-sm font-medium text-gray-700">{t("step6.palletRules")}</h3>
        <p className="text-xs text-gray-500">
          {t("step6.palletRulesHelp")}
        </p>
        <div className="space-y-3">
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              {...register("pallet_rules.allow_mixed_sizes")}
              className="rounded border-gray-300 text-green-600 focus:ring-green-500"
            />
            <div>
              <span className="text-sm text-gray-700">{t("step6.allowMixedSizes")}</span>
              <p className="text-xs text-gray-400">{t("step6.mixedSizesHelp")}</p>
            </div>
          </label>
          <label className="flex items-center gap-3 cursor-pointer">
            <input
              type="checkbox"
              {...register("pallet_rules.allow_mixed_box_types")}
              className="rounded border-gray-300 text-green-600 focus:ring-green-500"
            />
            <div>
              <span className="text-sm text-gray-700">{t("step6.allowMixedBoxTypes")}</span>
              <p className="text-xs text-gray-400">{t("step6.mixedBoxTypesHelp")}</p>
            </div>
          </label>
        </div>
      </div>

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
