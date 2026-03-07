import { Fragment, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useForm } from "react-hook-form";
import {
  listPackSpecs,
  createPackSpec,
  updatePackSpec,
  deletePackSpec,
  PackSpec,
  PackSpecPayload,
} from "../api/config";
import { getErrorMessage } from "../api/client";
import { showToast } from "../store/toastStore";
import PageHeader from "../components/PageHeader";
import { useTableSort, sortRows, sortableThClass } from "../hooks/useTableSort";

const inputBase =
  "w-full border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500";

interface SpecFormData {
  name: string;
  pack_type: string;
  weight_kg: string;
  units_per_carton: string;
  cartons_per_layer: string;
  layers_per_pallet: string;
  target_market: string;
}

function toPayload(data: SpecFormData): PackSpecPayload {
  return {
    name: data.name,
    pack_type: data.pack_type || null,
    weight_kg: data.weight_kg ? parseFloat(data.weight_kg) : null,
    units_per_carton: data.units_per_carton ? parseInt(data.units_per_carton) : null,
    cartons_per_layer: data.cartons_per_layer ? parseInt(data.cartons_per_layer) : null,
    layers_per_pallet: data.layers_per_pallet ? parseInt(data.layers_per_pallet) : null,
    target_market: data.target_market || null,
  };
}

function EditPanel({
  spec,
  onSave,
  onCancel,
  onDelete,
}: {
  spec: PackSpec;
  onSave: (updated: PackSpec) => void;
  onCancel: () => void;
  onDelete: (id: string) => void;
}) {
  const { t } = useTranslation("packSpecs");
  const {
    register,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<SpecFormData>({
    defaultValues: {
      name: spec.name,
      pack_type: spec.pack_type || "",
      weight_kg: spec.weight_kg?.toString() || "",
      units_per_carton: spec.units_per_carton?.toString() || "",
      cartons_per_layer: spec.cartons_per_layer?.toString() || "",
      layers_per_pallet: spec.layers_per_pallet?.toString() || "",
      target_market: spec.target_market || "",
    },
  });

  const onSubmit = async (data: SpecFormData) => {
    try {
      const updated = await updatePackSpec(spec.id, toPayload(data));
      onSave(updated);
      showToast("success", t("toast.updated"));
    } catch (err) {
      showToast("error", getErrorMessage(err, t("toast.updateFailed")));
    }
  };

  return (
    <tr>
      <td colSpan={8} className="px-4 py-4 bg-green-50/30 border-t border-b border-green-200">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                {t("headers.name")} *
              </label>
              <input {...register("name", { required: true })} className={inputBase} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                {t("headers.packType")}
              </label>
              <input {...register("pack_type")} className={inputBase} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                {t("headers.weight")}
              </label>
              <input {...register("weight_kg")} type="number" step="0.1" className={inputBase} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                {t("headers.unitsPerCarton")}
              </label>
              <input {...register("units_per_carton")} type="number" className={inputBase} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                {t("headers.cartonsPerLayer")}
              </label>
              <input {...register("cartons_per_layer")} type="number" className={inputBase} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                {t("headers.layersPerPallet")}
              </label>
              <input {...register("layers_per_pallet")} type="number" className={inputBase} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                {t("headers.targetMarket")}
              </label>
              <input {...register("target_market")} className={inputBase} />
            </div>
          </div>
          <div className="flex gap-2 items-center">
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-1.5 text-sm bg-green-600 text-white rounded font-medium hover:bg-green-700 disabled:opacity-50"
            >
              {isSubmitting ? t("common:actions.saving") : t("common:actions.saveChanges")}
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-1.5 text-sm border rounded font-medium hover:bg-gray-50"
            >
              {t("common:actions.cancel")}
            </button>
            <div className="flex-1" />
            <button
              type="button"
              onClick={() => {
                if (window.confirm(t("confirmDelete", { name: spec.name }))) {
                  onDelete(spec.id);
                }
              }}
              className="px-4 py-1.5 text-sm text-red-600 border border-red-200 rounded font-medium hover:bg-red-50"
            >
              {t("common:actions.delete")}
            </button>
          </div>
        </form>
      </td>
    </tr>
  );
}

export default function PackSpecs() {
  const { t } = useTranslation("packSpecs");
  const [specs, setSpecs] = useState<PackSpec[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [search, setSearch] = useState("");
  const { sortCol, sortDir, toggleSort, sortIndicator } = useTableSort();

  const fetchSpecs = async () => {
    setLoading(true);
    try {
      setSpecs(await listPackSpecs());
    } catch {
      showToast("error", t("loadFailed"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSpecs();
  }, []);

  const filtered = useMemo(() => {
    const rows = specs.filter((s) => {
      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        s.name.toLowerCase().includes(q) ||
        (s.pack_type || "").toLowerCase().includes(q) ||
        (s.target_market || "").toLowerCase().includes(q)
      );
    });
    return sortRows(rows, sortCol, sortDir, {
      name: (s) => s.name,
      pack_type: (s) => s.pack_type,
      weight_kg: (s) => s.weight_kg,
      cartons_per_layer: (s) => s.cartons_per_layer,
      layers_per_pallet: (s) => s.layers_per_pallet,
      target_market: (s) => s.target_market,
    });
  }, [specs, search, sortCol, sortDir]);

  const handleSave = (updated: PackSpec) => {
    setSpecs((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
    setEditingId(null);
  };

  const handleDelete = async (id: string) => {
    try {
      await deletePackSpec(id);
      setSpecs((prev) => prev.filter((s) => s.id !== id));
      setEditingId(null);
      showToast("success", t("toast.deleted"));
    } catch (err) {
      showToast("error", getErrorMessage(err, t("toast.deleteFailed")));
    }
  };

  const handleCreate = async (data: SpecFormData) => {
    try {
      const created = await createPackSpec(toPayload(data));
      setSpecs((prev) => [...prev, created]);
      setShowCreate(false);
      showToast("success", t("toast.created"));
    } catch (err) {
      showToast("error", getErrorMessage(err, t("toast.createFailed")));
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-4">
      <PageHeader
        title={t("title")}
        subtitle={t("subtitle")}
        action={
          <button
            onClick={() => setShowCreate(true)}
            className="bg-green-600 text-white text-sm px-4 py-2 rounded font-medium hover:bg-green-700"
          >
            {t("addSpec")}
          </button>
        }
      />

      {/* Create form */}
      {showCreate && (
        <CreateForm
          onSubmit={handleCreate}
          onCancel={() => setShowCreate(false)}
        />
      )}

      {/* Search */}
      {specs.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("searchPlaceholder")}
            className="border rounded-lg px-3 py-1.5 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-green-500"
          />
          <span className="text-xs text-gray-500">
            {t("showing", { count: filtered.length, total: specs.length })}
          </span>
        </div>
      )}

      {/* Table */}
      <div className="bg-white border rounded-lg overflow-x-auto">
        {loading ? (
          <p className="text-gray-400 text-sm p-4">{t("common:actions.loading")}</p>
        ) : specs.length === 0 ? (
          <p className="text-gray-400 text-sm p-4">{t("empty")}</p>
        ) : (
          <table className="w-full text-sm whitespace-nowrap">
            <thead className="bg-gray-50 text-gray-600 select-none">
              <tr>
                <th onClick={() => toggleSort("name")} className={`text-left px-4 py-2 font-medium ${sortableThClass}`}>{t("headers.name")}{sortIndicator("name")}</th>
                <th onClick={() => toggleSort("pack_type")} className={`text-left px-4 py-2 font-medium ${sortableThClass}`}>{t("headers.packType")}{sortIndicator("pack_type")}</th>
                <th onClick={() => toggleSort("weight_kg")} className={`text-right px-4 py-2 font-medium ${sortableThClass}`}>{t("headers.weight")}{sortIndicator("weight_kg")}</th>
                <th className="text-right px-4 py-2 font-medium">{t("headers.unitsPerCarton")}</th>
                <th onClick={() => toggleSort("cartons_per_layer")} className={`text-right px-4 py-2 font-medium ${sortableThClass}`}>{t("headers.cartonsPerLayer")}{sortIndicator("cartons_per_layer")}</th>
                <th onClick={() => toggleSort("layers_per_pallet")} className={`text-right px-4 py-2 font-medium ${sortableThClass}`}>{t("headers.layersPerPallet")}{sortIndicator("layers_per_pallet")}</th>
                <th className="text-right px-4 py-2 font-medium">{t("headers.boxesPerPallet")}</th>
                <th onClick={() => toggleSort("target_market")} className={`text-left px-4 py-2 font-medium ${sortableThClass}`}>{t("headers.targetMarket")}{sortIndicator("target_market")}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((spec) => (
                <Fragment key={spec.id}>
                  <tr
                    onClick={() => setEditingId(editingId === spec.id ? null : spec.id)}
                    className={`cursor-pointer ${
                      editingId === spec.id
                        ? "bg-green-50"
                        : "hover:bg-green-50/50 even:bg-gray-50/50"
                    }`}
                  >
                    <td className="px-4 py-2 font-medium">{spec.name}</td>
                    <td className="px-4 py-2 text-gray-500">{spec.pack_type || "\u2014"}</td>
                    <td className="px-4 py-2 text-right text-gray-500">
                      {spec.weight_kg != null ? `${spec.weight_kg} kg` : "\u2014"}
                    </td>
                    <td className="px-4 py-2 text-right text-gray-500">
                      {spec.units_per_carton ?? "\u2014"}
                    </td>
                    <td className="px-4 py-2 text-right text-gray-500">
                      {spec.cartons_per_layer ?? "\u2014"}
                    </td>
                    <td className="px-4 py-2 text-right text-gray-500">
                      {spec.layers_per_pallet ?? "\u2014"}
                    </td>
                    <td className="px-4 py-2 text-right text-gray-600 font-medium">
                      {spec.cartons_per_layer && spec.layers_per_pallet
                        ? spec.cartons_per_layer * spec.layers_per_pallet
                        : "\u2014"}
                    </td>
                    <td className="px-4 py-2 text-gray-500">{spec.target_market || "\u2014"}</td>
                  </tr>
                  {editingId === spec.id && (
                    <EditPanel
                      key={`edit-${spec.id}`}
                      spec={spec}
                      onSave={handleSave}
                      onCancel={() => setEditingId(null)}
                      onDelete={handleDelete}
                    />
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function CreateForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (data: SpecFormData) => Promise<void>;
  onCancel: () => void;
}) {
  const { t } = useTranslation("packSpecs");
  const {
    register,
    handleSubmit,
    formState: { isSubmitting },
  } = useForm<SpecFormData>({
    defaultValues: {
      name: "",
      pack_type: "",
      weight_kg: "",
      units_per_carton: "",
      cartons_per_layer: "",
      layers_per_pallet: "",
      target_market: "",
    },
  });

  return (
    <div className="bg-white border rounded-lg p-4">
      <h3 className="text-sm font-semibold text-gray-700 mb-3">{t("createTitle")}</h3>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-3">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              {t("headers.name")} *
            </label>
            <input {...register("name", { required: true })} className={inputBase} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              {t("headers.packType")}
            </label>
            <input {...register("pack_type")} className={inputBase} placeholder="e.g. carton, bulk bin" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              {t("headers.weight")}
            </label>
            <input {...register("weight_kg")} type="number" step="0.1" className={inputBase} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              {t("headers.unitsPerCarton")}
            </label>
            <input {...register("units_per_carton")} type="number" className={inputBase} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              {t("headers.cartonsPerLayer")}
            </label>
            <input {...register("cartons_per_layer")} type="number" className={inputBase} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              {t("headers.layersPerPallet")}
            </label>
            <input {...register("layers_per_pallet")} type="number" className={inputBase} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              {t("headers.targetMarket")}
            </label>
            <input {...register("target_market")} className={inputBase} placeholder="e.g. EU, UK, Local" />
          </div>
        </div>
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={isSubmitting}
            className="px-4 py-1.5 text-sm bg-green-600 text-white rounded font-medium hover:bg-green-700 disabled:opacity-50"
          >
            {isSubmitting ? t("common:actions.saving") : t("createBtn")}
          </button>
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-1.5 text-sm border rounded font-medium hover:bg-gray-50"
          >
            {t("common:actions.cancel")}
          </button>
        </div>
      </form>
    </div>
  );
}
