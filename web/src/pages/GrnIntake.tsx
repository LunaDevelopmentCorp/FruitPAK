import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { Link } from "react-router-dom";
import {
  submitGRN,
  listBatches,
  updateBatch,
  listGrowers,
  listPackhouses,
  GRNPayload,
  GRNResponse,
  BatchSummary,
  BatchUpdatePayload,
  Grower,
  Packhouse,
} from "../api/batches";
import { getBinTypes, BinTypeConfig } from "../api/pallets";
import { getFruitTypeConfigs, FruitTypeConfig } from "../api/config";
import { listHarvestTeams, HarvestTeamItem } from "../api/payments";
import BatchQR from "../components/BatchQR";
import { getErrorMessage } from "../api/client";
import { showToast as globalToast } from "../store/toastStore";
import PageHeader from "../components/PageHeader";

const inputBase =
  "w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500";
const inputError =
  "w-full border border-red-400 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400";

interface FieldError {
  field: string;
  message: string;
}

export default function GrnIntake() {
  const [growers, setGrowers] = useState<Grower[]>([]);
  const [packhouses, setPackhouses] = useState<Packhouse[]>([]);
  const [fruitConfigs, setFruitConfigs] = useState<FruitTypeConfig[]>([]);
  const [binTypes, setBinTypes] = useState<BinTypeConfig[]>([]);
  const [harvestTeams, setHarvestTeams] = useState<HarvestTeamItem[]>([]);
  const [result, setResult] = useState<GRNResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldError[]>([]);
  const [loadingRef, setLoadingRef] = useState(true);
  const [toast, setToast] = useState<string | null>(null);

  // Recent GRNs list + inline edit
  const [recentBatches, setRecentBatches] = useState<BatchSummary[]>([]);
  const [loadingRecent, setLoadingRecent] = useState(false);
  const [editingBatchId, setEditingBatchId] = useState<string | null>(null);
  const [grnDate, setGrnDate] = useState(new Date().toISOString().split("T")[0]);

  const {
    register,
    handleSubmit,
    watch,
    reset,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<GRNPayload>();

  // Live net weight calculation
  const grossWeight = watch("gross_weight_kg");
  const tareWeight = watch("tare_weight_kg");
  const netWeight =
    grossWeight != null && Number(grossWeight) > 0
      ? Number(grossWeight) - (Number(tareWeight) || 0)
      : null;

  // Track selected fruit type for cascading dropdowns
  const selectedFruitType = watch("fruit_type");

  useEffect(() => {
    Promise.all([
      listGrowers(),
      listPackhouses(),
      getFruitTypeConfigs().catch(() => []),
      getBinTypes().catch(() => []),
      listHarvestTeams().catch(() => []),
    ])
      .then(([g, p, fc, bt, ht]) => {
        setGrowers(g);
        setPackhouses(p);
        setFruitConfigs(fc);
        setBinTypes(bt);
        setHarvestTeams(ht);
      })
      .catch(() => {
        setError("Failed to load reference data. Is the wizard complete?");
      })
      .finally(() => setLoadingRef(false));
  }, []);

  // Auto-dismiss toast
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  // Derive unique fruit types from aggregated configs
  const fruitTypes = useMemo(() => {
    return fruitConfigs.map((fc) => fc.fruit_type);
  }, [fruitConfigs]);

  // Derive varieties for the selected fruit type
  const varieties = useMemo(() => {
    if (!selectedFruitType) return [];
    const config = fruitConfigs.find((fc) => fc.fruit_type === selectedFruitType);
    return config?.varieties ?? [];
  }, [fruitConfigs, selectedFruitType]);


  // Fetch GRNs for selected date
  const fetchRecentBatches = useCallback(async (dateStr: string) => {
    setLoadingRecent(true);
    try {
      const resp = await listBatches({ date_from: dateStr, date_to: dateStr, limit: "50" });
      setRecentBatches(resp.items);
    } catch {
      // Silent fail — table is supplementary
    } finally {
      setLoadingRecent(false);
    }
  }, []);

  useEffect(() => {
    if (!loadingRef) fetchRecentBatches(grnDate);
  }, [loadingRef, fetchRecentBatches, grnDate]);

  const getFieldError = (field: string): string | undefined =>
    fieldErrors.find((e) => e.field === field)?.message;

  // When bin type changes, auto-fill weights from config
  const handleBinTypeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const binName = e.target.value;
    setValue("bin_type", binName);
    const bt = binTypes.find((b) => b.name === binName);
    if (!bt) return;
    const count = Number(watch("bin_count")) || 0;
    if (bt.tare_weight_kg > 0) {
      setValue("tare_weight_kg", count > 0 ? bt.tare_weight_kg * count : bt.tare_weight_kg);
    }
    if (bt.default_weight_kg > 0 && count > 0) {
      setValue("gross_weight_kg", bt.default_weight_kg * count);
    }
  };

  // When bin count changes, recalculate weights if a default-weight bin type is selected
  const selectedBinType = watch("bin_type");
  const binCount = watch("bin_count");
  React.useEffect(() => {
    const count = Number(binCount) || 0;
    if (count <= 0 || !selectedBinType) return;
    const bt = binTypes.find((b) => b.name === selectedBinType);
    if (!bt) return;
    if (bt.default_weight_kg > 0) {
      setValue("gross_weight_kg", bt.default_weight_kg * count);
    }
    if (bt.tare_weight_kg > 0) {
      setValue("tare_weight_kg", bt.tare_weight_kg * count);
    }
  }, [binCount, selectedBinType, binTypes, setValue]);

  const onSubmit = async (data: GRNPayload) => {
    setError(null);
    setFieldErrors([]);
    setResult(null);

    const grossNum = data.gross_weight_kg ? Number(data.gross_weight_kg) : undefined;
    const binNum = data.bin_count ? Number(data.bin_count) : undefined;

    // At least one of weight or bin count is required
    if (!grossNum && !binNum) {
      setError("Provide at least gross weight or bin count.");
      return;
    }

    const payload: GRNPayload = {
      ...data,
      gross_weight_kg: grossNum || undefined,
      tare_weight_kg: data.tare_weight_kg ? Number(data.tare_weight_kg) : undefined,
      bin_count: binNum || undefined,
      harvest_team_id: data.harvest_team_id || undefined,
    };

    try {
      const res = await submitGRN(payload);
      setResult(res);
      setToast(`Batch ${res.batch.batch_code} created successfully`);
      fetchRecentBatches(grnDate);
    } catch (err: unknown) {
      // 422 with field-level errors needs special handling
      const axiosErr = err as {
        response?: { data?: { detail?: string | Array<{ loc?: string[]; msg?: string }> }; status?: number };
      };
      const detail = axiosErr.response?.data?.detail;

      if (axiosErr.response?.status === 422 && Array.isArray(detail)) {
        const mapped: FieldError[] = detail
          .filter((e) => e.loc && e.msg)
          .map((e) => ({
            field: e.loc![e.loc!.length - 1],
            message: e.msg!,
          }));
        setFieldErrors(mapped);
        setError("Please fix the highlighted fields below.");
      } else {
        const msg = getErrorMessage(err, "GRN submission failed");
        setError(msg);
        globalToast("error", msg);
      }
    }
  };

  const handleNewIntake = () => {
    setResult(null);
    setError(null);
    setFieldErrors([]);
    reset();
  };

  if (loadingRef) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="flex items-center gap-2 text-gray-400 text-sm">
          <Spinner />
          Loading reference data...
        </div>
      </div>
    );
  }

  // Whether we have config data (controls dropdown vs free-text fallback)
  const hasProductConfig = fruitConfigs.length > 0;
  const hasBinTypes = binTypes.length > 0;

  return (
    <div className="max-w-4xl mx-auto px-6 py-8">
      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}

      {result ? (
        /* ── Success screen ─────────────────────────────── */
        <div className="bg-green-50 border border-green-200 rounded-lg p-6 max-w-2xl">
          <div className="flex items-center gap-2 mb-4">
            <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h2 className="text-xl font-bold text-green-800">GRN Created</h2>
          </div>

          <div className="space-y-2 text-sm">
            <Row label="Batch Code" value={result.batch.batch_code} mono />
            <Row label="Fruit" value={result.batch.fruit_type} />
            <Row label="Variety" value={result.batch.variety || "\u2014"} />
            {result.batch.gross_weight_kg != null ? (
              <>
                <Row
                  label="Gross Weight"
                  value={`${result.batch.gross_weight_kg.toLocaleString()} kg`}
                />
                <Row
                  label="Tare Weight"
                  value={`${result.batch.tare_weight_kg.toLocaleString()} kg`}
                />
                <Row
                  label="Net Weight"
                  value={`${result.batch.net_weight_kg?.toLocaleString() ?? "\u2014"} kg`}
                  bold
                />
              </>
            ) : (
              <Row label="Weight" value="Pending (add via edit)" />
            )}
            <Row label="Status" value={result.batch.status} />
            <Row
              label="Advance Payment"
              value={result.advance_payment_linked ? `Linked (${result.advance_payment_ref})` : "None"}
            />
          </div>

          <div className="mt-6 pt-4 border-t border-green-200">
            <BatchQR batch={result.batch} size={140} />
          </div>

          <div className="mt-6 flex gap-3">
            <button
              onClick={handleNewIntake}
              className="bg-green-600 text-white px-4 py-2 rounded text-sm font-medium hover:bg-green-700"
            >
              New Intake
            </button>
            <Link
              to={`/batches/${result.batch.id}`}
              className="border border-gray-300 text-gray-700 px-4 py-2 rounded text-sm font-medium hover:bg-gray-50"
            >
              View / Edit Batch
            </Link>
          </div>
        </div>
      ) : (
        /* ── New GRN form ───────────────────────────────── */
        <>
          <PageHeader
            title="GRN Intake"
            subtitle="Record a new Goods Received Note for incoming fruit."
          />

          {error && (
            <div className="mt-4 p-3 bg-red-50 text-red-700 rounded text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="bg-white border rounded-lg p-6 space-y-5 max-w-2xl shadow-sm">
        {/* Grower + Packhouse */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Grower *
            </label>
            <select
              {...register("grower_id", { required: "Grower is required" })}
              className={errors.grower_id || getFieldError("grower_id") ? inputError : inputBase}
            >
              <option value="">Select grower</option>
              {growers.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}{g.grower_code ? ` (${g.grower_code})` : ""}
                </option>
              ))}
            </select>
            <FieldMsg error={errors.grower_id?.message || getFieldError("grower_id")} />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Packhouse *
            </label>
            <select
              {...register("packhouse_id", { required: "Packhouse is required" })}
              className={errors.packhouse_id || getFieldError("packhouse_id") ? inputError : inputBase}
            >
              <option value="">Select packhouse</option>
              {packhouses.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <FieldMsg error={errors.packhouse_id?.message || getFieldError("packhouse_id")} />
          </div>
        </div>

        {/* Harvest Team */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Harvest Team *
          </label>
          <select
            {...register("harvest_team_id", { required: "Harvest team is required" })}
            className={errors.harvest_team_id || getFieldError("harvest_team_id") ? inputError : inputBase}
          >
              <option value="">Select harvest team</option>
              {harvestTeams.map((ht) => (
                <option key={ht.id} value={ht.id}>
                  {ht.name}{ht.team_leader ? ` (${ht.team_leader})` : ""}
                </option>
              ))}
            </select>
          <FieldMsg error={errors.harvest_team_id?.message || getFieldError("harvest_team_id")} />
        </div>

        {/* Fruit type + Variety */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Fruit Type *
            </label>
            {hasProductConfig ? (
              <select
                {...register("fruit_type", { required: "Fruit type is required" })}
                className={errors.fruit_type || getFieldError("fruit_type") ? inputError : inputBase}
              >
                <option value="">Select fruit type</option>
                {fruitTypes.map((ft) => (
                  <option key={ft} value={ft}>{ft}</option>
                ))}
              </select>
            ) : (
              <input
                {...register("fruit_type", { required: "Fruit type is required" })}
                className={errors.fruit_type || getFieldError("fruit_type") ? inputError : inputBase}
                placeholder="e.g. apple, pear, citrus"
              />
            )}
            <FieldMsg error={errors.fruit_type?.message || getFieldError("fruit_type")} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Variety
            </label>
            {hasProductConfig && varieties.length > 0 ? (
              <select
                {...register("variety")}
                className={getFieldError("variety") ? inputError : inputBase}
              >
                <option value="">Select variety</option>
                {varieties.map((v) => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            ) : (
              <input
                {...register("variety")}
                className={getFieldError("variety") ? inputError : inputBase}
                placeholder="e.g. Fuji, Packham"
              />
            )}
            <FieldMsg error={getFieldError("variety")} />
          </div>
        </div>

        {/* Receiving — weight and/or units */}
        <div className="bg-gray-50 border rounded-lg p-4 space-y-4">
          <div>
            <p className="text-sm font-medium text-gray-700">Receiving Details</p>
            <p className="text-xs text-gray-500 mt-0.5">
              Enter weight, bin count, or both. Weight can be added later if not measured at intake.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Bin Count
              </label>
              <input
                type="number"
                {...register("bin_count")}
                className={getFieldError("bin_count") ? inputError : inputBase}
                placeholder="e.g. 24"
              />
              <FieldMsg error={getFieldError("bin_count")} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Bin Type
              </label>
              {hasBinTypes ? (
                <select
                  {...register("bin_type")}
                  onChange={handleBinTypeChange}
                  className={getFieldError("bin_type") ? inputError : inputBase}
                >
                  <option value="">Select bin type</option>
                  {binTypes.map((bt) => {
                    const hints = [];
                    if (bt.default_weight_kg > 0) hints.push(`${bt.default_weight_kg} kg`);
                    if (bt.tare_weight_kg > 0) hints.push(`${bt.tare_weight_kg} kg tare`);
                    return (
                      <option key={bt.id} value={bt.name}>
                        {bt.name}{hints.length > 0 ? ` (${hints.join(", ")})` : ""}
                      </option>
                    );
                  })}
                </select>
              ) : (
                <input
                  {...register("bin_type")}
                  className={getFieldError("bin_type") ? inputError : inputBase}
                  placeholder="e.g. Plastic bin, Wooden crate"
                />
              )}
              <FieldMsg error={getFieldError("bin_type")} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Gross Weight (kg)
              </label>
              <input
                type="number"
                step="0.1"
                {...register("gross_weight_kg")}
                className={getFieldError("gross_weight_kg") ? inputError : inputBase}
                placeholder="e.g. 1250"
              />
              <FieldMsg error={getFieldError("gross_weight_kg")} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Tare Weight (kg)
              </label>
              <input
                type="number"
                step="0.1"
                {...register("tare_weight_kg")}
                className={getFieldError("tare_weight_kg") ? inputError : inputBase}
                placeholder="e.g. 50"
              />
              <FieldMsg error={getFieldError("tare_weight_kg")} />
            </div>
          </div>

          {/* Live net weight display */}
          {netWeight !== null && (
            <div
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium ${
                netWeight > 0
                  ? "bg-green-50 text-green-800 border border-green-200"
                  : "bg-red-50 text-red-700 border border-red-200"
              }`}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" />
              </svg>
              Net Weight: {netWeight.toLocaleString(undefined, { maximumFractionDigits: 1 })} kg
              {netWeight <= 0 && <span className="text-xs ml-1">(tare exceeds gross)</span>}
            </div>
          )}
        </div>

        {/* Harvest Date */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Harvest Date
          </label>
          <input
            type="date"
            {...register("harvest_date")}
            defaultValue={new Date().toISOString().split("T")[0]}
            className={getFieldError("harvest_date") ? inputError : inputBase}
          />
          <FieldMsg error={getFieldError("harvest_date")} />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Delivery Notes
          </label>
          <textarea
            {...register("delivery_notes")}
            rows={2}
            className={getFieldError("delivery_notes") ? inputError : inputBase}
            placeholder="Any additional notes about the delivery..."
          />
          <FieldMsg error={getFieldError("delivery_notes")} />
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="flex items-center gap-2 bg-green-600 text-white px-6 py-2.5 rounded text-sm font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSubmitting && <Spinner />}
          {isSubmitting ? "Submitting..." : "Submit GRN"}
        </button>
          </form>
        </>
      )}

      {/* ── GRNs for date ───────────────────────────────── */}
      <div className="mt-10 border-t pt-8">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-800">
              GRNs for {grnDate === new Date().toISOString().split("T")[0] ? "Today" : grnDate}
            </h2>
            <p className="text-sm text-gray-500">
              Click a row to edit intake details.
            </p>
          </div>
          <input
            type="date"
            value={grnDate}
            onChange={(e) => {
              setGrnDate(e.target.value);
              setEditingBatchId(null);
            }}
            className="border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          />
        </div>

        {loadingRecent ? (
          <div className="flex items-center gap-2 text-gray-400 text-sm">
            <Spinner /> Loading...
          </div>
        ) : recentBatches.length === 0 ? (
          <p className="text-gray-400 text-sm">No GRNs recorded for this date.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-gray-500 text-xs border-b">
                <tr>
                  <th className="text-left px-2 py-2 font-medium">Batch Code</th>
                  <th className="text-left px-2 py-2 font-medium">Grower</th>
                  <th className="text-left px-2 py-2 font-medium">Fruit / Variety</th>
                  <th className="text-right px-2 py-2 font-medium">Bins</th>
                  <th className="text-right px-2 py-2 font-medium">Gross (kg)</th>
                  <th className="text-right px-2 py-2 font-medium">Net (kg)</th>
                  <th className="text-left px-2 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {recentBatches.map((b) => (
                  <React.Fragment key={b.id}>
                    <tr
                      onClick={() => setEditingBatchId(editingBatchId === b.id ? null : b.id)}
                      className={`cursor-pointer hover:bg-green-50/50 even:bg-gray-50/50 ${editingBatchId === b.id ? "bg-amber-50" : ""}`}
                    >
                      <td className="px-2 py-2 font-mono text-xs text-green-700">{b.batch_code}</td>
                      <td className="px-2 py-2">{b.grower_name || b.grower_id}</td>
                      <td className="px-2 py-2">
                        {b.fruit_type}{b.variety ? ` / ${b.variety}` : ""}
                      </td>
                      <td className="px-2 py-2 text-right">{b.bin_count ?? "—"}</td>
                      <td className="px-2 py-2 text-right">
                        {b.gross_weight_kg != null ? b.gross_weight_kg.toLocaleString() : "—"}
                      </td>
                      <td className="px-2 py-2 text-right font-medium">
                        {b.net_weight_kg != null ? b.net_weight_kg.toLocaleString() : "—"}
                      </td>
                      <td className="px-2 py-2">
                        <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700">
                          {b.status}
                        </span>
                      </td>
                    </tr>
                    {editingBatchId === b.id && (
                      <tr>
                        <td colSpan={7} className="p-0">
                          <InlineEditPanel
                            batch={b}
                            binTypes={binTypes}
                            onSave={() => {
                              setEditingBatchId(null);
                              fetchRecentBatches(grnDate);
                            }}
                            onCancel={() => setEditingBatchId(null)}
                          />
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Inline edit panel for a recent GRN ──────────────────── */

function InlineEditPanel({
  batch,
  binTypes,
  onSave,
  onCancel,
}: {
  batch: BatchSummary;
  binTypes: BinTypeConfig[];
  onSave: () => void;
  onCancel: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const { register, handleSubmit, watch, setValue } = useForm<BatchUpdatePayload>({
    defaultValues: {
      variety: batch.variety || "",
      bin_type: batch.bin_type || "",
      bin_count: batch.bin_count ?? undefined,
      gross_weight_kg: batch.gross_weight_kg ?? undefined,
      tare_weight_kg: batch.tare_weight_kg,
      harvest_date: batch.harvest_date?.split("T")[0] || "",
      notes: batch.notes || "",
    },
  });

  // Weight recalculation when bin count or bin type changes
  const watchedBinCount = watch("bin_count");
  const watchedBinType = watch("bin_type");
  const grossWeight = watch("gross_weight_kg");
  const tareWeight = watch("tare_weight_kg");
  const netWeight =
    grossWeight != null && Number(grossWeight) > 0
      ? Number(grossWeight) - (Number(tareWeight) || 0)
      : null;

  useEffect(() => {
    if (!watchedBinType || !watchedBinCount) return;
    const bt = binTypes.find((b) => b.name === watchedBinType);
    if (!bt) return;
    const count = Number(watchedBinCount) || 0;
    if (count <= 0) return;
    if (bt.default_weight_kg > 0) {
      setValue("gross_weight_kg", bt.default_weight_kg * count);
    }
    if (bt.tare_weight_kg > 0) {
      setValue("tare_weight_kg", bt.tare_weight_kg * count);
    }
  }, [watchedBinCount, watchedBinType, binTypes, setValue]);

  const onEditSubmit = async (data: BatchUpdatePayload) => {
    setSaving(true);
    setEditError(null);
    try {
      const payload: BatchUpdatePayload = {};
      if (data.variety) payload.variety = data.variety;
      if (data.harvest_date) payload.harvest_date = data.harvest_date;
      if (data.gross_weight_kg) payload.gross_weight_kg = Number(data.gross_weight_kg);
      if (data.tare_weight_kg !== undefined) payload.tare_weight_kg = Number(data.tare_weight_kg);
      if (data.bin_count) payload.bin_count = Number(data.bin_count);
      if (data.bin_type) payload.bin_type = data.bin_type;
      if (data.notes !== undefined) payload.notes = data.notes;

      await updateBatch(batch.id, payload);
      globalToast("success", `Batch ${batch.batch_code} updated.`);
      onSave();
    } catch (err: unknown) {
      setEditError(getErrorMessage(err, "Update failed"));
    } finally {
      setSaving(false);
    }
  };

  const inputCls = "w-full border rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400";

  return (
    <form onSubmit={handleSubmit(onEditSubmit)} className="bg-amber-50 border border-amber-200 rounded-b-lg p-4 space-y-3">
      {editError && (
        <div className="p-2 bg-red-50 text-red-700 rounded text-xs">{editError}</div>
      )}

      <div className="grid grid-cols-4 gap-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Variety</label>
          <input {...register("variety")} className={inputCls} />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Bin Type</label>
          <select {...register("bin_type")} className={inputCls}>
            <option value="">— Select —</option>
            {binTypes.map((bt) => (
              <option key={bt.id} value={bt.name}>
                {bt.name}{bt.default_weight_kg > 0 ? ` (${bt.default_weight_kg} kg)` : ""}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Bin Count</label>
          <input type="number" {...register("bin_count", { valueAsNumber: true })} className={inputCls} />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Harvest Date</label>
          <input type="date" {...register("harvest_date")} className={inputCls} />
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Gross Weight (kg)</label>
          <input type="number" step="0.1" {...register("gross_weight_kg", { valueAsNumber: true })} className={inputCls} />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Tare Weight (kg)</label>
          <input type="number" step="0.1" {...register("tare_weight_kg", { valueAsNumber: true })} className={inputCls} />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Net Weight</label>
          <p className="px-2 py-1.5 text-sm text-gray-600 bg-amber-100 rounded">
            {netWeight != null ? `${netWeight.toLocaleString(undefined, { maximumFractionDigits: 1 })} kg` : "—"}
          </p>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Notes</label>
          <input {...register("notes")} className={inputCls} placeholder="Optional" />
        </div>
      </div>

      {watchedBinType && binTypes.find((b) => b.name === watchedBinType) && (
        <p className="text-xs text-gray-500">
          Weights auto-calculate from bin type when bin count changes.
        </p>
      )}

      <div className="flex gap-2 pt-1">
        <button
          type="submit"
          disabled={saving}
          className="bg-amber-600 text-white px-4 py-1.5 rounded text-sm font-medium hover:bg-amber-700 disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save Changes"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="border text-gray-600 px-4 py-1.5 rounded text-sm hover:bg-gray-50"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

/* ── Small helper components ─────────────────────────────── */

function FieldMsg({ error }: { error?: string }) {
  if (!error) return null;
  return <p className="mt-1 text-xs text-red-600">{error}</p>;
}

function Spinner() {
  return (
    <svg
      className="animate-spin h-4 w-4"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}

function Toast({ message, onDismiss }: { message: string; onDismiss: () => void }) {
  return (
    <div className="fixed top-4 right-4 z-50 flex items-center gap-3 bg-green-700 text-white px-4 py-3 rounded-lg shadow-lg text-sm animate-[slideIn_0.3s_ease-out]">
      <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
      {message}
      <button onClick={onDismiss} className="ml-2 hover:text-green-200">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

function Row({
  label,
  value,
  mono,
  bold,
}: {
  label: string;
  value: string;
  mono?: boolean;
  bold?: boolean;
}) {
  return (
    <div className="flex justify-between">
      <span className="text-gray-600">{label}</span>
      <span
        className={`${mono ? "font-mono" : ""} ${bold ? "font-bold text-green-800" : "text-gray-800"}`}
      >
        {value}
      </span>
    </div>
  );
}
