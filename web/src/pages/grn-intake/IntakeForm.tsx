import React, { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useForm } from "react-hook-form";
import { submitGRN } from "../../api/batches";
import { getErrorMessage } from "../../api/client";
import { showToast as globalToast } from "../../store/toastStore";
import { usePackhouseStore } from "../../store/packhouseStore";
import PageHeader from "../../components/PageHeader";
import { inputBase, inputError, FieldMsg, Spinner } from "./helpers";
import { IntakeFormProps, FieldError, GRNPayload, GrowerField } from "./types";

export default function IntakeForm({ referenceData, onSuccess, onRefreshRecent }: IntakeFormProps) {
  const { t } = useTranslation("grn");
  const currentPackhouseId = usePackhouseStore((s) => s.currentPackhouseId);
  const { growers, packhouses, fruitConfigs, binTypes, harvestTeams } = referenceData;

  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldError[]>([]);

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

  // Track selected grower for field auto-fill
  const selectedGrowerId = watch("grower_id");

  const selectedGrowerFields = useMemo<GrowerField[]>(() => {
    if (!selectedGrowerId) return [];
    const grower = growers.find((g) => g.id === selectedGrowerId);
    return grower?.fields?.filter((f) => f.code || f.name) ?? [];
  }, [selectedGrowerId, growers]);

  // Auto-fill field when grower has exactly one field
  useEffect(() => {
    if (selectedGrowerFields.length === 1) {
      const f = selectedGrowerFields[0];
      setValue("field_code", f.code || "");
      setValue("field_name", f.name || "");
    } else if (selectedGrowerFields.length === 0) {
      setValue("field_code", "");
      setValue("field_name", "");
    }
  }, [selectedGrowerFields, setValue]);

  // Auto-select packhouse from global picker
  useEffect(() => {
    if (currentPackhouseId && packhouses.length > 0) {
      const match = packhouses.find((p) => p.id === currentPackhouseId);
      if (match) setValue("packhouse_id", currentPackhouseId);
    }
  }, [currentPackhouseId, packhouses, setValue]);

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

  const getFieldError = (field: string): string | undefined =>
    fieldErrors.find((e) => e.field === field)?.message;

  const onSubmit = async (data: GRNPayload) => {
    setError(null);
    setFieldErrors([]);

    const grossNum = data.gross_weight_kg ? Number(data.gross_weight_kg) : undefined;
    const binNum = data.bin_count ? Number(data.bin_count) : undefined;

    // At least one of weight or bin count is required
    if (!grossNum && !binNum) {
      setError(t("form.weightOrBinRequired"));
      return;
    }

    const payload: GRNPayload = {
      ...data,
      gross_weight_kg: grossNum || undefined,
      tare_weight_kg: data.tare_weight_kg ? Number(data.tare_weight_kg) : undefined,
      bin_count: binNum || undefined,
      harvest_team_id: data.harvest_team_id || "",
      field_code: data.field_code || undefined,
      field_name: data.field_name || undefined,
    };

    try {
      const res = await submitGRN(payload);
      onSuccess(res);
      reset();
      onRefreshRecent();
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
        setError(t("form.fixFields"));
      } else {
        const msg = getErrorMessage(err, t("form.submissionFailed"));
        setError(msg);
        globalToast("error", msg);
      }
    }
  };

  // Whether we have config data (controls dropdown vs free-text fallback)
  const hasProductConfig = fruitConfigs.length > 0;
  const hasBinTypes = binTypes.length > 0;

  return (
    <>
      <PageHeader
        title={t("title")}
        subtitle={t("subtitle")}
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
              {t("form.grower")}
            </label>
            <select
              {...register("grower_id", { required: t("form.growerRequired") })}
              className={errors.grower_id || getFieldError("grower_id") ? inputError : inputBase}
            >
              <option value="">{t("form.selectGrower")}</option>
              {growers.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.grower_code ? `${g.grower_code} — ` : ""}{g.name}
                </option>
              ))}
            </select>
            <FieldMsg error={errors.grower_id?.message || getFieldError("grower_id")} />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t("form.packhouse")}
            </label>
            <select
              {...register("packhouse_id", { required: t("form.packhouseRequired") })}
              className={errors.packhouse_id || getFieldError("packhouse_id") ? inputError : inputBase}
            >
              <option value="">{t("form.selectPackhouse")}</option>
              {packhouses.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <FieldMsg error={errors.packhouse_id?.message || getFieldError("packhouse_id")} />
          </div>
        </div>

        {/* Field / Block */}
        {selectedGrowerFields.length > 1 ? (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t("form.field")}
            </label>
            <select
              className={inputBase}
              value={watch("field_code") || ""}
              onChange={(e) => {
                const code = e.target.value;
                if (!code) {
                  setValue("field_code", "");
                  setValue("field_name", "");
                  return;
                }
                const f = selectedGrowerFields.find((f) => f.code === code);
                setValue("field_code", f?.code || code);
                setValue("field_name", f?.name || "");
              }}
            >
              <option value="">{t("form.selectField")}</option>
              {selectedGrowerFields.map((f, i) => (
                <option key={i} value={f.code || f.name}>
                  {f.code ? `${f.code}` : ""}{f.code && f.name ? ` — ${f.name}` : f.name || ""}
                </option>
              ))}
            </select>
          </div>
        ) : selectedGrowerFields.length === 1 ? (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t("form.field")}
            </label>
            <p className="px-3 py-2 text-sm bg-gray-50 border rounded text-gray-700">
              {selectedGrowerFields[0].code || ""}{selectedGrowerFields[0].code && selectedGrowerFields[0].name ? ` — ${selectedGrowerFields[0].name}` : selectedGrowerFields[0].name || ""}
            </p>
            <input type="hidden" {...register("field_code")} />
            <input type="hidden" {...register("field_name")} />
          </div>
        ) : null}

        {/* Harvest Team */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {t("form.harvestTeam")}
          </label>
          <select
            {...register("harvest_team_id", { required: t("form.harvestTeamRequired") })}
            className={errors.harvest_team_id || getFieldError("harvest_team_id") ? inputError : inputBase}
          >
              <option value="">{t("form.selectHarvestTeam")}</option>
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
              {t("form.fruitType")}
            </label>
            {hasProductConfig ? (
              <select
                {...register("fruit_type", { required: t("form.fruitTypeRequired") })}
                className={errors.fruit_type || getFieldError("fruit_type") ? inputError : inputBase}
              >
                <option value="">{t("form.selectFruitType")}</option>
                {fruitTypes.map((ft) => (
                  <option key={ft} value={ft}>{ft}</option>
                ))}
              </select>
            ) : (
              <input
                {...register("fruit_type", { required: t("form.fruitTypeRequired") })}
                className={errors.fruit_type || getFieldError("fruit_type") ? inputError : inputBase}
                placeholder={t("form.fruitTypePlaceholder")}
              />
            )}
            <FieldMsg error={errors.fruit_type?.message || getFieldError("fruit_type")} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t("form.variety")}
            </label>
            {hasProductConfig && varieties.length > 0 ? (
              <select
                {...register("variety")}
                className={getFieldError("variety") ? inputError : inputBase}
              >
                <option value="">{t("form.selectVariety")}</option>
                {varieties.map((v) => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            ) : (
              <input
                {...register("variety")}
                className={getFieldError("variety") ? inputError : inputBase}
                placeholder={t("form.varietyPlaceholder")}
              />
            )}
            <FieldMsg error={getFieldError("variety")} />
          </div>
        </div>

        {/* Receiving -- weight and/or units */}
        <div className="bg-gray-50 border rounded-lg p-4 space-y-4">
          <div>
            <p className="text-sm font-medium text-gray-700">{t("form.receivingDetails")}</p>
            <p className="text-xs text-gray-500 mt-0.5">
              {t("form.receivingHelp")}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t("form.binCount")}
              </label>
              <input
                type="number"
                {...register("bin_count")}
                className={getFieldError("bin_count") ? inputError : inputBase}
                placeholder={t("form.binCountPlaceholder")}
              />
              <FieldMsg error={getFieldError("bin_count")} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t("form.binType")}
              </label>
              {hasBinTypes ? (
                <select
                  {...register("bin_type")}
                  onChange={handleBinTypeChange}
                  className={getFieldError("bin_type") ? inputError : inputBase}
                >
                  <option value="">{t("form.selectBinType")}</option>
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
                  placeholder={t("form.binTypePlaceholder")}
                />
              )}
              <FieldMsg error={getFieldError("bin_type")} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t("form.grossWeight")}
              </label>
              <input
                type="number"
                step="0.1"
                {...register("gross_weight_kg")}
                className={getFieldError("gross_weight_kg") ? inputError : inputBase}
                placeholder={t("form.grossWeightPlaceholder")}
              />
              <FieldMsg error={getFieldError("gross_weight_kg")} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t("form.tareWeight")}
              </label>
              <input
                type="number"
                step="0.1"
                {...register("tare_weight_kg")}
                className={getFieldError("tare_weight_kg") ? inputError : inputBase}
                placeholder={t("form.tareWeightPlaceholder")}
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
              {t("form.netWeight", { weight: netWeight.toLocaleString(undefined, { maximumFractionDigits: 1 }) })}
              {netWeight <= 0 && <span className="text-xs ml-1">{t("form.tareExceedsGross")}</span>}
            </div>
          )}
        </div>

        {/* Harvest Date */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {t("form.harvestDate")}
          </label>
          <input
            type="date"
            {...register("harvest_date")}
            defaultValue={new Date().toISOString().split("T")[0]}
            className={getFieldError("harvest_date") ? inputError : inputBase}
          />
          <FieldMsg error={getFieldError("harvest_date")} />
        </div>

        {/* Vehicle Identification */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t("form.vehicleReg")}
            </label>
            <input
              {...register("vehicle_reg")}
              className={getFieldError("vehicle_reg") ? inputError : inputBase}
              placeholder={t("form.vehicleRegPlaceholder")}
            />
            <FieldMsg error={getFieldError("vehicle_reg")} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t("form.driverName")}
            </label>
            <input
              {...register("driver_name")}
              className={getFieldError("driver_name") ? inputError : inputBase}
              placeholder={t("form.driverNamePlaceholder")}
            />
            <FieldMsg error={getFieldError("driver_name")} />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            {t("form.deliveryNotes")}
          </label>
          <textarea
            {...register("delivery_notes")}
            rows={2}
            className={getFieldError("delivery_notes") ? inputError : inputBase}
            placeholder={t("form.deliveryNotesPlaceholder")}
          />
          <FieldMsg error={getFieldError("delivery_notes")} />
        </div>

        <button
          type="submit"
          disabled={isSubmitting}
          className="flex items-center gap-2 bg-green-600 text-white px-6 py-2.5 rounded text-sm font-medium hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isSubmitting && <Spinner />}
          {isSubmitting ? t("common:actions.submitting") : t("form.submit")}
        </button>
      </form>
    </>
  );
}
