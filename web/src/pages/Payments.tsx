import React, { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { Link } from "react-router-dom";
import { listGrowers, listBatches, Grower, BatchSummary } from "../api/batches";
import { getErrorMessage } from "../api/client";
import {
  submitGrowerPayment,
  listGrowerPayments,
  GrowerPaymentPayload,
  GrowerPaymentOut,
} from "../api/payments";

const inputBase =
  "w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500";
const inputError =
  "w-full border border-red-400 rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-400";

interface FieldError {
  field: string;
  message: string;
}

export default function Payments() {
  const [growers, setGrowers] = useState<Grower[]>([]);
  const [batches, setBatches] = useState<BatchSummary[]>([]);
  const [recentPayments, setRecentPayments] = useState<GrowerPaymentOut[]>([]);
  const [result, setResult] = useState<GrowerPaymentOut | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldError[]>([]);
  const [loadingRef, setLoadingRef] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [selectedBatchIds, setSelectedBatchIds] = useState<string[]>([]);

  const {
    register,
    handleSubmit,
    watch,
    reset,
    formState: { errors, isSubmitting },
  } = useForm<GrowerPaymentPayload>({
    defaultValues: {
      currency: "ZAR",
      payment_type: "final",
      payment_date: new Date().toISOString().split("T")[0],
      batch_ids: [],
    },
  });

  const selectedGrowerId = watch("grower_id");

  // Filter batches for selected grower
  const growerBatches = batches.filter(
    (b) => b.grower_id === selectedGrowerId && b.status !== "rejected"
  );

  // Compute selected batch kg total
  const selectedKg = growerBatches
    .filter((b) => selectedBatchIds.includes(b.id))
    .reduce((sum, b) => sum + ((b.net_weight_kg ?? b.gross_weight_kg) || 0), 0);

  // Load reference data
  useEffect(() => {
    Promise.all([listGrowers(), listBatches(), listGrowerPayments()])
      .then(([g, b, p]) => {
        setGrowers(g);
        setBatches(b);
        setRecentPayments(p);
      })
      .catch(() => {
        setError("Failed to load data. Is the wizard complete?");
      })
      .finally(() => setLoadingRef(false));
  }, []);

  // Reset batch selection when grower changes
  useEffect(() => {
    setSelectedBatchIds([]);
  }, [selectedGrowerId]);

  // Auto-dismiss toast
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  const getFieldError = (field: string): string | undefined =>
    fieldErrors.find((e) => e.field === field)?.message;

  const toggleBatch = (batchId: string) => {
    setSelectedBatchIds((prev) =>
      prev.includes(batchId)
        ? prev.filter((id) => id !== batchId)
        : [...prev, batchId]
    );
  };

  const selectAllBatches = () => {
    setSelectedBatchIds(growerBatches.map((b) => b.id));
  };

  const onSubmit = async (data: GrowerPaymentPayload) => {
    setError(null);
    setFieldErrors([]);
    setResult(null);

    const amount = Number(data.amount);
    if (!amount || amount <= 0) {
      setError("Amount must be a positive number.");
      return;
    }

    const payload: GrowerPaymentPayload = {
      ...data,
      amount,
      batch_ids: selectedBatchIds,
    };

    try {
      const res = await submitGrowerPayment(payload);
      setResult(res);
      setToast(`Payment ${res.payment_ref} recorded — alerts updated`);
      // Refresh recent payments
      listGrowerPayments().then(setRecentPayments).catch(() => {});
    } catch (err: unknown) {
      // 422 with field-level errors needs special handling
      const axiosErr = err as {
        response?: {
          data?: { detail?: string | Array<{ loc?: string[]; msg?: string }> };
          status?: number;
        };
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
        setError(getErrorMessage(err, "Payment submission failed"));
      }
    }
  };

  const handleNewPayment = () => {
    setResult(null);
    setError(null);
    setFieldErrors([]);
    setSelectedBatchIds([]);
    reset({
      currency: "ZAR",
      payment_type: "final",
      payment_date: new Date().toISOString().split("T")[0],
      batch_ids: [],
    });
  };

  if (loadingRef) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-8">
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
      <div className="max-w-3xl mx-auto px-6 py-8">
        {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}

        <div className="bg-green-50 border border-green-200 rounded-lg p-6">
          <div className="flex items-center gap-2 mb-4">
            <svg className="w-6 h-6 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <h2 className="text-xl font-bold text-green-800">Payment Recorded</h2>
          </div>

          <div className="space-y-2 text-sm">
            <Row label="Reference" value={result.payment_ref} mono />
            <Row label="Grower" value={result.grower_name || result.grower_id} />
            <Row label="Amount" value={`${result.currency} ${result.gross_amount.toLocaleString()}`} bold />
            <Row label="Type" value={result.payment_type} />
            <Row label="Batches Covered" value={`${result.batch_ids.length}`} />
            {result.total_kg != null && (
              <Row label="Total kg" value={`${result.total_kg.toLocaleString()} kg`} />
            )}
            <Row label="Status" value={result.status} />
            <Row label="Date" value={result.paid_date || "—"} />
          </div>

          <div className="mt-6 flex gap-3">
            <button
              onClick={handleNewPayment}
              className="bg-green-600 text-white px-4 py-2 rounded text-sm font-medium hover:bg-green-700"
            >
              Record Another
            </button>
            <Link
              to="/reconciliation"
              className="border border-gray-300 text-gray-700 px-4 py-2 rounded text-sm font-medium hover:bg-gray-50"
            >
              View Reconciliation
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-8">
      {toast && <Toast message={toast} onDismiss={() => setToast(null)} />}

      <h1 className="text-2xl font-bold text-gray-800">Record Grower Payment</h1>
      <p className="text-sm text-gray-500 mt-1">
        Record a payment to a grower for delivered fruit. Reconciliation alerts update automatically.
      </p>

      {error && (
        <div className="mt-4 p-3 bg-red-50 text-red-700 rounded text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit(onSubmit)} className="mt-6 space-y-5">
        {/* Grower */}
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

        {/* Amount + Currency + Type */}
        <div className="grid grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Amount *
            </label>
            <input
              type="number"
              step="0.01"
              {...register("amount", { required: "Amount is required", valueAsNumber: true })}
              className={errors.amount || getFieldError("amount") ? inputError : inputBase}
              placeholder="e.g. 25000"
            />
            <FieldMsg error={errors.amount?.message || getFieldError("amount")} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Currency
            </label>
            <select
              {...register("currency")}
              className={inputBase}
            >
              <option value="ZAR">ZAR</option>
              <option value="USD">USD</option>
              <option value="EUR">EUR</option>
              <option value="GBP">GBP</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Payment Type
            </label>
            <select
              {...register("payment_type")}
              className={inputBase}
            >
              <option value="final">Final</option>
              <option value="advance">Advance</option>
            </select>
          </div>
        </div>

        {/* Payment Date */}
        <div className="w-1/2">
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Payment Date *
          </label>
          <input
            type="date"
            {...register("payment_date", { required: "Payment date is required" })}
            className={errors.payment_date || getFieldError("payment_date") ? inputError : inputBase}
          />
          <FieldMsg error={errors.payment_date?.message || getFieldError("payment_date")} />
        </div>

        {/* Batch selection */}
        {selectedGrowerId && (
          <div className="bg-gray-50 border rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-sm font-medium text-gray-700">Link to Batches</p>
                <p className="text-xs text-gray-500">
                  Select GRN batches this payment covers. Leave empty to auto-cover all.
                </p>
              </div>
              {growerBatches.length > 0 && (
                <button
                  type="button"
                  onClick={selectAllBatches}
                  className="text-xs text-green-600 hover:text-green-700 font-medium"
                >
                  Select All
                </button>
              )}
            </div>

            {growerBatches.length === 0 ? (
              <p className="text-sm text-gray-400">No batches found for this grower.</p>
            ) : (
              <>
                <div className="space-y-1 max-h-48 overflow-y-auto">
                  {growerBatches.map((b) => (
                    <label
                      key={b.id}
                      className={`flex items-center gap-3 px-3 py-2 rounded cursor-pointer text-sm hover:bg-gray-100 ${
                        selectedBatchIds.includes(b.id) ? "bg-green-50" : ""
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedBatchIds.includes(b.id)}
                        onChange={() => toggleBatch(b.id)}
                        className="rounded text-green-600"
                      />
                      <span className="font-mono text-xs text-gray-600">{b.batch_code}</span>
                      <span className="text-gray-700">{b.fruit_type}</span>
                      <span className="ml-auto text-gray-500">
                        {((b.net_weight_kg ?? b.gross_weight_kg) || 0).toLocaleString()} kg
                      </span>
                      <span
                        className={`px-1.5 py-0.5 rounded text-xs ${
                          b.status === "received"
                            ? "bg-blue-50 text-blue-700"
                            : b.status === "complete"
                            ? "bg-green-50 text-green-700"
                            : "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {b.status}
                      </span>
                    </label>
                  ))}
                </div>

                {selectedBatchIds.length > 0 && (
                  <div className="mt-3 flex items-center gap-2 px-3 py-2 bg-green-50 border border-green-200 rounded text-sm text-green-800">
                    <span className="font-medium">
                      {selectedBatchIds.length} batch{selectedBatchIds.length > 1 ? "es" : ""} selected
                    </span>
                    <span>&middot;</span>
                    <span>{selectedKg.toLocaleString()} kg total</span>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Notes */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Notes
          </label>
          <textarea
            {...register("notes")}
            rows={2}
            className={inputBase}
            placeholder="Optional notes about this payment..."
          />
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="flex items-center gap-2 bg-green-600 text-white px-6 py-2.5 rounded text-sm font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSubmitting && <Spinner />}
          {isSubmitting ? "Recording..." : "Record Payment"}
        </button>
      </form>

      {/* Recent payments */}
      {recentPayments.length > 0 && (
        <div className="mt-10">
          <h2 className="text-lg font-semibold text-gray-800 mb-3">Recent Payments</h2>
          <div className="bg-white rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">Ref</th>
                  <th className="text-left px-4 py-2 font-medium">Grower</th>
                  <th className="text-right px-4 py-2 font-medium">Amount</th>
                  <th className="text-left px-4 py-2 font-medium">Type</th>
                  <th className="text-left px-4 py-2 font-medium">Status</th>
                  <th className="text-left px-4 py-2 font-medium">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {recentPayments.slice(0, 10).map((p) => (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2 font-mono text-xs text-green-700">
                      {p.payment_ref}
                    </td>
                    <td className="px-4 py-2">{p.grower_name || "—"}</td>
                    <td className="px-4 py-2 text-right font-medium">
                      {p.currency} {p.gross_amount.toLocaleString()}
                    </td>
                    <td className="px-4 py-2">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                        p.payment_type === "advance"
                          ? "bg-yellow-50 text-yellow-700"
                          : "bg-green-50 text-green-700"
                      }`}>
                        {p.payment_type}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                        p.status === "paid"
                          ? "bg-green-50 text-green-700"
                          : p.status === "pending"
                          ? "bg-yellow-50 text-yellow-700"
                          : "bg-gray-100 text-gray-600"
                      }`}>
                        {p.status}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-gray-500">
                      {p.paid_date || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
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
    <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
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

function Row({ label, value, mono, bold }: { label: string; value: string; mono?: boolean; bold?: boolean }) {
  return (
    <div className="flex justify-between">
      <span className="text-gray-600">{label}</span>
      <span className={`${mono ? "font-mono" : ""} ${bold ? "font-bold text-green-800" : "text-gray-800"}`}>
        {value}
      </span>
    </div>
  );
}
