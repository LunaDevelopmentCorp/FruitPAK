import React from "react";
import { useFieldArray, useForm } from "react-hook-form";
import type { StepProps } from "../WizardShell";

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

interface FormData {
  products: ProductForm[];
  pack_specs: PackSpecForm[];
}

export default function Step6ProductPacking({ onSave, saving, draftData }: StepProps) {
  const { register, control, handleSubmit } = useForm<FormData>({
    defaultValues: (draftData as Partial<FormData>) ?? {
      products: [{ fruit_type: "", variety: "", grades: "", sizes: "" }],
      pack_specs: [{ name: "", pack_type: "", weight_kg: null, cartons_per_layer: null, layers_per_pallet: null, target_market: "" }],
    },
  });
  const products = useFieldArray({ control, name: "products" });
  const packSpecs = useFieldArray({ control, name: "pack_specs" });

  const transform = (data: FormData) => ({
    products: data.products.map((p) => ({
      ...p,
      grades: p.grades ? p.grades.split(",").map((s) => s.trim()) : [],
      sizes: p.sizes ? p.sizes.split(",").map((s) => s.trim()) : [],
    })),
    pack_specs: data.pack_specs,
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

      {/* Pack specs */}
      <div className="space-y-4">
        <h3 className="text-sm font-medium text-gray-700">Pack Specifications</h3>
        {packSpecs.fields.map((field, idx) => (
          <fieldset key={field.id} className="p-4 border rounded space-y-3">
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

      <div className="flex gap-3 pt-4 border-t">
        <button type="button" onClick={saveDraft} disabled={saving} className="px-4 py-2 border rounded text-sm">Save Draft</button>
        <button type="button" onClick={saveAndComplete} disabled={saving} className="px-4 py-2 bg-green-600 text-white rounded text-sm font-medium">Save & Continue</button>
      </div>
    </form>
  );
}
