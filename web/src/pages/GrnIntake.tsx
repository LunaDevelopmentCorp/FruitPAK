import React, { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { Link } from "react-router-dom";
import {
  submitGRN,
  listGrowers,
  listPackhouses,
  GRNPayload,
  GRNResponse,
  Grower,
  Packhouse,
} from "../api/batches";
import BatchQR from "../components/BatchQR";

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
  const [result, setResult] = useState<GRNResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldError[]>([]);
  const [loadingRef, setLoadingRef] = useState(true);
  const [toast, setToast] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<GRNPayload>();

  // Live net weight calculation
  const grossWeight = watch("gross_weight_kg");
  const tareWeight = watch("tare_weight_kg");
  const netWeight =
    grossWeight != null && Number(grossWeight) > 0
      ? Number(grossWeight) - (Number(tareWeight) || 0)
      : null;

  useEffect(() => {
    Promise.all([listGrowers(), listPackhouses()])
      .then(([g, p]) => {
        setGrowers(g);
        setPackhouses(p);
      })
      .catch(() => {
        setError("Failed to load growers/packhouses. Is the wizard complete?");
      })
      .finally(() => setLoadingRef(false));
  }, []);

  // Auto-dismiss toast
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  const getFieldError = (field: string): string | undefined =>
    fieldErrors.find((e) => e.field === field)?.message;

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
      arrival_temp_c: data.arrival_temp_c ? Number(data.arrival_temp_c) : undefined,
      brix_reading: data.brix_reading ? Number(data.brix_reading) : undefined,
      bin_count: binNum || undefined,
    };

    try {
      const res = await submitGRN(payload);
      setResult(res);
      setToast(`Batch ${res.batch.batch_code} created successfully`);
    } catch (err: unknown) {
      if (err && typeof err === "object" && "response" in err) {
        const axiosErr = err as {
          response?: { data?: { detail?: string | Array<{ loc?: string[]; msg?: string }> }; status?: number };
        };
        const detail = axiosErr.response?.data?.detail;

        // 422 with field-level errors
        if (axiosErr.response?.status === 422 && Array.isArray(detail)) {
          const mapped: FieldError[] = detail
            .filter((e) => e.loc && e.msg)
            .map((e) => ({
              field: e.loc![e.loc!.length - 1],
              message: e.msg!,
            }));
          setFieldErrors(mapped);
          setError("Please fix the highlighted fields below.");
        } else if (typeof detail === "string") {
          setError(detail);
        } else {
          setError("GRN submission failed");
        }
      } else {
        setError("Network error — is the server running?");
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
      <div className="max-w-2xl mx-auto px-6 py-8">
        <div className="flex items-center gap-2 text-gray-400 text-sm">
          <Spinner />
          Loading reference data...
        </div>
      </div>
    );
  }

  // Success screen
  if (result) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-8">
        {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}

        <div className="bg-green-50 border border-green-200 rounded-lg p-6">
          <div className="flex items-center gap-2 mb-4">
            <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h2 className="text-xl font-bold text-green-800">GRN Created</h2>
          </div>

          <div className="space-y-2 text-sm">
            <Row label="Batch Code" value={result.batch.batch_code} mono />
            <Row label="Fruit" value={result.batch.fruit_type} />
            <Row label="Variety" value={result.batch.variety || "—"} />
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
                  value={`${result.batch.net_weight_kg?.toLocaleString() ?? "—"} kg`}
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
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-6 py-8">
      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}

      <h1 className="text-2xl font-bold text-gray-800">GRN Intake</h1>
      <p className="text-sm text-gray-500 mt-1">
        Record a new Goods Received Note for incoming fruit.
      </p>

      {error && (
        <div className="mt-4 p-3 bg-red-50 text-red-700 rounded text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-5">
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

        {/* Fruit type + Variety */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Fruit Type *
            </label>
            <input
              {...register("fruit_type", { required: "Fruit type is required" })}
              className={errors.fruit_type || getFieldError("fruit_type") ? inputError : inputBase}
              placeholder="e.g. apple, pear, citrus"
            />
            <FieldMsg error={errors.fruit_type?.message || getFieldError("fruit_type")} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Variety
            </label>
            <input
              {...register("variety")}
              className={getFieldError("variety") ? inputError : inputBase}
              placeholder="e.g. Fuji, Packham"
            />
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
              <input
                {...register("bin_type")}
                className={getFieldError("bin_type") ? inputError : inputBase}
                placeholder="e.g. Plastic bin, Wooden crate"
              />
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

        {/* Quality + Date */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Quality Grade
            </label>
            <select
              {...register("quality_grade")}
              className={getFieldError("quality_grade") ? inputError : inputBase}
            >
              <option value="">Select grade</option>
              <option value="Class 1">Class 1</option>
              <option value="Class 2">Class 2</option>
              <option value="Class 3">Class 3</option>
              <option value="Industrial">Industrial</option>
            </select>
            <FieldMsg error={getFieldError("quality_grade")} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Harvest Date
            </label>
            <input
              type="date"
              {...register("harvest_date")}
              className={getFieldError("harvest_date") ? inputError : inputBase}
            />
            <FieldMsg error={getFieldError("harvest_date")} />
          </div>
        </div>

        {/* Optional quality fields */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Arrival Temp (&deg;C)
            </label>
            <input
              type="number"
              step="0.1"
              {...register("arrival_temp_c")}
              className={getFieldError("arrival_temp_c") ? inputError : inputBase}
            />
            <FieldMsg error={getFieldError("arrival_temp_c")} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Brix Reading
            </label>
            <input
              type="number"
              step="0.1"
              {...register("brix_reading")}
              className={getFieldError("brix_reading") ? inputError : inputBase}
            />
            <FieldMsg error={getFieldError("brix_reading")} />
          </div>
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
    </div>
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
