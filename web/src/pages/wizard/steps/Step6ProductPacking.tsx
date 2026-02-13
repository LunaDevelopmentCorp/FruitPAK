import { useFieldArray, useForm } from "react-hook-form";
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

interface BoxSizeForm {
  name: string;
  size_code: number | null;
  fruit_count: number | null;
  weight_kg: number;
}

interface PalletTypeForm {
  name: string;
  capacity_boxes: number;
  notes: string;
}

interface FormData {
  products: ProductForm[];
  pack_specs: PackSpecForm[];
  box_sizes: BoxSizeForm[];
  pallet_types: PalletTypeForm[];
}

const COMMON_PACK_SPECS: PackSpecForm[] = [
  { name: "4kg Open Top", pack_type: "carton", weight_kg: 4, cartons_per_layer: 15, layers_per_pallet: 8, target_market: "EU" },
  { name: "10kg Bulk Bin", pack_type: "bulk bin", weight_kg: 10, cartons_per_layer: 1, layers_per_pallet: 1, target_market: "Local" },
  { name: "2.5kg Flow Wrap", pack_type: "flow wrap", weight_kg: 2.5, cartons_per_layer: 20, layers_per_pallet: 8, target_market: "UK" },
  { name: "15kg Telescopic", pack_type: "telescopic", weight_kg: 15, cartons_per_layer: 10, layers_per_pallet: 6, target_market: "EU" },
  { name: "1kg Punnet Tray", pack_type: "punnet", weight_kg: 1, cartons_per_layer: 24, layers_per_pallet: 10, target_market: "EU" },
  { name: "5kg Net Bag", pack_type: "net bag", weight_kg: 5, cartons_per_layer: 18, layers_per_pallet: 8, target_market: "Local" },
];

// Standard fruit counts for common size codes
const STANDARD_FRUIT_COUNTS: Record<number, number> = {
  4: 4, 5: 5, 6: 6, 7: 7, 8: 8, 9: 9, 10: 10, 12: 12, 14: 14,
};

const SIZE_CODE_OPTIONS = [4, 5, 6, 7, 8, 9, 10, 12, 14];

const EMPTY_BOX: BoxSizeForm = { name: "", size_code: null, fruit_count: null, weight_kg: 4.0 };
const EMPTY_PALLET: PalletTypeForm = { name: "", capacity_boxes: 240, notes: "" };

export default function Step6ProductPacking({ onSave, saving, draftData }: StepProps) {
  const { register, control, handleSubmit, watch, setValue } = useForm<FormData>({
    defaultValues: (draftData as Partial<FormData>) ?? {
      products: [{ fruit_type: "", variety: "", grades: "", sizes: "" }],
      pack_specs: [{ name: "", pack_type: "", weight_kg: null, cartons_per_layer: null, layers_per_pallet: null, target_market: "" }],
      box_sizes: [],
      pallet_types: [],
    },
  });
  const products = useFieldArray({ control, name: "products" });
  const packSpecs = useFieldArray({ control, name: "pack_specs" });
  const boxSizes = useFieldArray({ control, name: "box_sizes" });
  const palletTypes = useFieldArray({ control, name: "pallet_types" });

  const currentSpecs = watch("pack_specs");
  const addedNames = new Set(currentSpecs?.map((s) => s.name) ?? []);

  const addPreset = (preset: PackSpecForm) => {
    const firstEmptyIdx = currentSpecs?.findIndex((s) => !s.name?.trim());
    if (firstEmptyIdx !== undefined && firstEmptyIdx >= 0) {
      packSpecs.remove(firstEmptyIdx);
    }
    packSpecs.append({ ...preset });
  };

  const transform = (data: FormData) => ({
    products: data.products.map((p) => ({
      ...p,
      grades: p.grades ? p.grades.split(",").map((s) => s.trim()) : [],
      sizes: p.sizes ? p.sizes.split(",").map((s) => s.trim()) : [],
    })),
    pack_specs: data.pack_specs,
    box_sizes: data.box_sizes.filter((b) => b.name?.trim()),
    pallet_types: data.pallet_types.filter((p) => p.name?.trim()),
  });

  const saveDraft = handleSubmit((data) => onSave(transform(data), false));
  const saveAndComplete = handleSubmit((data) => onSave(transform(data), true));

  return (
    <form className="space-y-8 max-w-2xl">
      {/* Products */}
      <div className="space-y-4">
        <h3 className="text-sm font-medium text-gray-700">Products / Fruit types</h3>
        {products.fields.map((field, idx) => (
          <fieldset key={field.id} className="p-4 border rounded space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <input {...register(`products.${idx}.fruit_type`, { required: true })} placeholder="Fruit type *" className="border rounded px-3 py-2 text-sm" />
              <input {...register(`products.${idx}.variety`)} placeholder="Variety" className="border rounded px-3 py-2 text-sm" />
            </div>
            <input {...register(`products.${idx}.grades`)} placeholder="Grades (comma separated)" className="w-full border rounded px-3 py-2 text-sm" />
            <input {...register(`products.${idx}.sizes`)} placeholder="Sizes (comma separated)" className="w-full border rounded px-3 py-2 text-sm" />
          </fieldset>
        ))}
        <button type="button" onClick={() => products.append({ fruit_type: "", variety: "", grades: "", sizes: "" })} className="text-sm text-green-600">+ Add product</button>
      </div>

      {/* Pack specs — presets */}
      <div className="space-y-4">
        <h3 className="text-sm font-medium text-gray-700">Pack Specifications</h3>

        <div className="bg-gray-50 rounded-lg p-4 border">
          <p className="text-xs text-gray-500 mb-2">Quick add common specs:</p>
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
              {packSpecs.fields.length > 1 && (
                <button type="button" onClick={() => packSpecs.remove(idx)} className="text-xs text-red-500">Remove</button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <input {...register(`pack_specs.${idx}.name`, { required: true })} placeholder="Spec name *" className="border rounded px-3 py-2 text-sm" />
              <input {...register(`pack_specs.${idx}.pack_type`)} placeholder="Pack type" className="border rounded px-3 py-2 text-sm" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <input {...register(`pack_specs.${idx}.weight_kg`, { valueAsNumber: true })} placeholder="Weight (kg)" type="number" className="border rounded px-3 py-2 text-sm" />
              <input {...register(`pack_specs.${idx}.cartons_per_layer`, { valueAsNumber: true })} placeholder="Cartons/layer" type="number" className="border rounded px-3 py-2 text-sm" />
              <input {...register(`pack_specs.${idx}.layers_per_pallet`, { valueAsNumber: true })} placeholder="Layers/pallet" type="number" className="border rounded px-3 py-2 text-sm" />
            </div>
            <input {...register(`pack_specs.${idx}.target_market`)} placeholder="Target market" className="w-full border rounded px-3 py-2 text-sm" />
          </fieldset>
        ))}
        <button type="button" onClick={() => packSpecs.append({ name: "", pack_type: "", weight_kg: null, cartons_per_layer: null, layers_per_pallet: null, target_market: "" })} className="text-sm text-green-600">+ Add pack spec</button>
      </div>

      {/* Box Types & Sizes */}
      <div className="space-y-4">
        <h3 className="text-sm font-medium text-gray-700">Box Types & Sizes</h3>
        <p className="text-xs text-gray-500">
          Define box sizes used on your pack lines. Size code refers to standard fruit count categories.
        </p>

        {boxSizes.fields.length > 0 && (
          <div className="border rounded overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600 text-xs">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">Box Name *</th>
                  <th className="text-left px-3 py-2 font-medium">Size Code</th>
                  <th className="text-right px-3 py-2 font-medium">Fruit Count</th>
                  <th className="text-right px-3 py-2 font-medium">Weight (kg)</th>
                  <th className="w-16"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {boxSizes.fields.map((field, idx) => (
                  <tr key={field.id}>
                    <td className="px-3 py-2">
                      <input
                        {...register(`box_sizes.${idx}.name`, { required: true })}
                        placeholder="e.g. 4kg Open Top"
                        className="w-full border rounded px-2 py-1.5 text-sm"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <select
                        {...register(`box_sizes.${idx}.size_code`, { valueAsNumber: true })}
                        onChange={(e) => {
                          const code = e.target.value ? Number(e.target.value) : null;
                          setValue(`box_sizes.${idx}.size_code`, code);
                          // Auto-fill fruit count from standard table
                          if (code && STANDARD_FRUIT_COUNTS[code]) {
                            setValue(`box_sizes.${idx}.fruit_count`, STANDARD_FRUIT_COUNTS[code]);
                          }
                        }}
                        className="w-full border rounded px-2 py-1.5 text-sm"
                      >
                        <option value="">—</option>
                        {SIZE_CODE_OPTIONS.map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <input
                        {...register(`box_sizes.${idx}.fruit_count`, { valueAsNumber: true })}
                        type="number"
                        min={1}
                        className="w-full border rounded px-2 py-1.5 text-sm text-right"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        {...register(`box_sizes.${idx}.weight_kg`, { valueAsNumber: true, required: true })}
                        type="number"
                        step="0.1"
                        min={0.1}
                        className="w-full border rounded px-2 py-1.5 text-sm text-right"
                      />
                    </td>
                    <td className="px-3 py-2 text-center">
                      <button type="button" onClick={() => boxSizes.remove(idx)} className="text-xs text-red-500 hover:text-red-700">
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {boxSizes.fields.length === 0 && (
          <p className="text-xs text-gray-400 italic">No box sizes defined yet.</p>
        )}

        <button
          type="button"
          onClick={() => boxSizes.append({ ...EMPTY_BOX })}
          className="text-sm text-green-600"
        >
          + Add Box Size
        </button>
      </div>

      {/* Pallet Structures */}
      <div className="space-y-4">
        <h3 className="text-sm font-medium text-gray-700">Pallet Structures</h3>
        <p className="text-xs text-gray-500">
          Define pallet types and their box capacity. Common standards: 240 boxes (full) or 160 boxes (half).
        </p>

        {palletTypes.fields.length > 0 && (
          <div className="border rounded overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600 text-xs">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">Pallet Name *</th>
                  <th className="text-right px-3 py-2 font-medium">Capacity (boxes)</th>
                  <th className="text-left px-3 py-2 font-medium">Notes</th>
                  <th className="w-16"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {palletTypes.fields.map((field, idx) => (
                  <tr key={field.id}>
                    <td className="px-3 py-2">
                      <input
                        {...register(`pallet_types.${idx}.name`, { required: true })}
                        placeholder="e.g. Standard 240"
                        className="w-full border rounded px-2 py-1.5 text-sm"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        {...register(`pallet_types.${idx}.capacity_boxes`, { valueAsNumber: true, required: true, min: 1 })}
                        type="number"
                        min={1}
                        className="w-full border rounded px-2 py-1.5 text-sm text-right"
                      />
                    </td>
                    <td className="px-3 py-2">
                      <input
                        {...register(`pallet_types.${idx}.notes`)}
                        placeholder="Optional"
                        className="w-full border rounded px-2 py-1.5 text-sm"
                      />
                    </td>
                    <td className="px-3 py-2 text-center">
                      <button type="button" onClick={() => palletTypes.remove(idx)} className="text-xs text-red-500 hover:text-red-700">
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {palletTypes.fields.length === 0 && (
          <p className="text-xs text-gray-400 italic">No pallet types defined yet.</p>
        )}

        <button
          type="button"
          onClick={() => palletTypes.append({ ...EMPTY_PALLET })}
          className="text-sm text-green-600"
        >
          + Add Pallet Type
        </button>
      </div>

      <div className="flex gap-3 pt-4 border-t">
        <button type="button" onClick={saveDraft} disabled={saving} className="px-4 py-2 border rounded text-sm">
          {saving && <Spinner />} Save Draft
        </button>
        <button type="button" onClick={saveAndComplete} disabled={saving} className="px-4 py-2 bg-green-600 text-white rounded text-sm font-medium">
          {saving && <Spinner />} Save & Continue
        </button>
      </div>
    </form>
  );
}
