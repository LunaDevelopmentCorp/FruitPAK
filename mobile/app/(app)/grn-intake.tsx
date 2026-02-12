import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useForm, Controller } from "react-hook-form";
import { useRouter } from "expo-router";
import {
  submitGRN,
  listGrowers,
  listPackhouses,
  GRNPayload,
  GRNResponse,
  Grower,
  Packhouse,
} from "../../src/api/batches";
import PickerModal from "../../src/components/PickerModal";
import { useNetworkStatus } from "../../src/hooks/useNetworkStatus";

export default function GrnIntakeScreen() {
  const router = useRouter();
  const { isConnected } = useNetworkStatus();

  const [growers, setGrowers] = useState<Grower[]>([]);
  const [packhouses, setPackhouses] = useState<Packhouse[]>([]);
  const [loadingRef, setLoadingRef] = useState(true);
  const [result, setResult] = useState<GRNResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const {
    control,
    handleSubmit,
    watch,
    reset,
    formState: { isSubmitting },
  } = useForm<GRNPayload>({
    defaultValues: {
      grower_id: "",
      packhouse_id: "",
      fruit_type: "",
      variety: "",
      bin_count: undefined,
      bin_type: "",
      gross_weight_kg: undefined,
      tare_weight_kg: undefined,
      harvest_date: "",
      delivery_notes: "",
    },
  });

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
      .catch(() => setError("Failed to load reference data"))
      .finally(() => setLoadingRef(false));
  }, []);

  const onSubmit = async (data: GRNPayload) => {
    setError(null);

    if (!data.grower_id) {
      setError("Please select a grower");
      return;
    }
    if (!data.packhouse_id) {
      setError("Please select a packhouse");
      return;
    }
    if (!data.fruit_type?.trim()) {
      setError("Fruit type is required");
      return;
    }

    const grossNum = data.gross_weight_kg ? Number(data.gross_weight_kg) : undefined;
    const binNum = data.bin_count ? Number(data.bin_count) : undefined;

    if (!grossNum && !binNum) {
      setError("Provide at least gross weight or bin count");
      return;
    }

    const payload: GRNPayload = {
      grower_id: data.grower_id,
      packhouse_id: data.packhouse_id,
      fruit_type: data.fruit_type.trim(),
      gross_weight_kg: grossNum || undefined,
      tare_weight_kg: data.tare_weight_kg ? Number(data.tare_weight_kg) : undefined,
      variety: data.variety?.trim() || undefined,
      bin_count: binNum || undefined,
      bin_type: data.bin_type?.trim() || undefined,
      harvest_date: data.harvest_date?.trim() || undefined,
      delivery_notes: data.delivery_notes?.trim() || undefined,
    };

    try {
      const res = await submitGRN(payload);
      setResult(res);
    } catch (err: unknown) {
      if (err && typeof err === "object" && "response" in err) {
        const axiosErr = err as {
          response?: {
            data?: { detail?: string | Array<{ msg?: string }> };
            status?: number;
          };
        };
        const detail = axiosErr.response?.data?.detail;
        if (typeof detail === "string") {
          setError(detail);
        } else if (Array.isArray(detail)) {
          setError(detail.map((e) => e.msg).join(", "));
        } else {
          setError("Submission failed");
        }
      } else {
        setError("Network error — is the server running?");
      }
    }
  };

  const handleNewIntake = () => {
    setResult(null);
    setError(null);
    reset();
  };

  if (loadingRef) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" color="#15803d" />
        <Text style={styles.loadingText}>Loading reference data...</Text>
      </View>
    );
  }

  // ── Success screen ──────────────────────────────────────────
  if (result) {
    const b = result.batch;
    return (
      <ScrollView style={styles.container} contentContainerStyle={styles.successContent}>
        <View style={styles.successCard}>
          <Text style={styles.successIcon}>✓</Text>
          <Text style={styles.successTitle}>GRN Created</Text>

          <View style={styles.summaryRows}>
            <SummaryRow label="Batch Code" value={b.batch_code} mono />
            <SummaryRow label="Fruit" value={b.fruit_type} />
            <SummaryRow label="Variety" value={b.variety || "—"} />
            {b.gross_weight_kg != null && (
              <>
                <SummaryRow
                  label="Gross"
                  value={`${b.gross_weight_kg.toLocaleString()} kg`}
                />
                <SummaryRow
                  label="Tare"
                  value={`${b.tare_weight_kg.toLocaleString()} kg`}
                />
                <SummaryRow
                  label="Net"
                  value={`${b.net_weight_kg?.toLocaleString() ?? "—"} kg`}
                  bold
                />
              </>
            )}
            <SummaryRow label="Status" value={b.status} />
            <SummaryRow
              label="Advance Payment"
              value={
                result.advance_payment_linked
                  ? `Linked (${result.advance_payment_ref})`
                  : "None"
              }
            />
          </View>

          <View style={styles.successActions}>
            <TouchableOpacity
              style={styles.primaryBtn}
              onPress={handleNewIntake}
              activeOpacity={0.8}
            >
              <Text style={styles.primaryBtnText}>New Intake</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.secondaryBtn}
              onPress={() => router.back()}
              activeOpacity={0.8}
            >
              <Text style={styles.secondaryBtnText}>Back to Home</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    );
  }

  // ── Form ────────────────────────────────────────────────────
  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      keyboardVerticalOffset={Platform.OS === "ios" ? 100 : 0}
    >
      <ScrollView
        contentContainerStyle={styles.formContent}
        keyboardShouldPersistTaps="handled"
      >
        {!isConnected && (
          <View style={styles.offlineBanner}>
            <Text style={styles.offlineText}>
              You are offline — submit will fail
            </Text>
          </View>
        )}

        {error && (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}

        {/* Grower */}
        <Text style={styles.label}>Grower *</Text>
        <Controller
          control={control}
          name="grower_id"
          render={({ field: { value, onChange } }) => (
            <PickerModal
              options={growers.map((g) => ({
                value: g.id,
                label: `${g.name}${g.grower_code ? ` (${g.grower_code})` : ""}`,
              }))}
              selectedValue={value}
              onSelect={onChange}
              placeholder="Select grower"
            />
          )}
        />

        {/* Packhouse */}
        <Text style={[styles.label, styles.mt16]}>Packhouse *</Text>
        <Controller
          control={control}
          name="packhouse_id"
          render={({ field: { value, onChange } }) => (
            <PickerModal
              options={packhouses.map((p) => ({
                value: p.id,
                label: p.name,
              }))}
              selectedValue={value}
              onSelect={onChange}
              placeholder="Select packhouse"
            />
          )}
        />

        {/* Fruit type + Variety */}
        <View style={[styles.row, styles.mt16]}>
          <View style={styles.halfField}>
            <Text style={styles.label}>Fruit Type *</Text>
            <Controller
              control={control}
              name="fruit_type"
              render={({ field: { value, onChange } }) => (
                <TextInput
                  style={styles.input}
                  value={value}
                  onChangeText={onChange}
                  placeholder="e.g. apple, pear"
                  placeholderTextColor="#9ca3af"
                />
              )}
            />
          </View>
          <View style={styles.halfField}>
            <Text style={styles.label}>Variety</Text>
            <Controller
              control={control}
              name="variety"
              render={({ field: { value, onChange } }) => (
                <TextInput
                  style={styles.input}
                  value={value}
                  onChangeText={onChange}
                  placeholder="e.g. Fuji"
                  placeholderTextColor="#9ca3af"
                />
              )}
            />
          </View>
        </View>

        {/* Receiving details section */}
        <View style={[styles.section, styles.mt16]}>
          <Text style={styles.sectionTitle}>Receiving Details</Text>
          <Text style={styles.sectionHint}>
            Enter weight, bin count, or both.
          </Text>

          <View style={[styles.row, styles.mt12]}>
            <View style={styles.halfField}>
              <Text style={styles.label}>Bin Count</Text>
              <Controller
                control={control}
                name="bin_count"
                render={({ field: { value, onChange } }) => (
                  <TextInput
                    style={styles.input}
                    value={value != null ? String(value) : ""}
                    onChangeText={(t) => onChange(t ? Number(t) : undefined)}
                    placeholder="e.g. 24"
                    placeholderTextColor="#9ca3af"
                    keyboardType="number-pad"
                  />
                )}
              />
            </View>
            <View style={styles.halfField}>
              <Text style={styles.label}>Bin Type</Text>
              <Controller
                control={control}
                name="bin_type"
                render={({ field: { value, onChange } }) => (
                  <TextInput
                    style={styles.input}
                    value={value}
                    onChangeText={onChange}
                    placeholder="e.g. Plastic bin"
                    placeholderTextColor="#9ca3af"
                  />
                )}
              />
            </View>
          </View>

          <View style={[styles.row, styles.mt12]}>
            <View style={styles.halfField}>
              <Text style={styles.label}>Gross Weight (kg)</Text>
              <Controller
                control={control}
                name="gross_weight_kg"
                render={({ field: { value, onChange } }) => (
                  <TextInput
                    style={styles.input}
                    value={value != null ? String(value) : ""}
                    onChangeText={(t) => onChange(t ? Number(t) : undefined)}
                    placeholder="e.g. 1250"
                    placeholderTextColor="#9ca3af"
                    keyboardType="decimal-pad"
                  />
                )}
              />
            </View>
            <View style={styles.halfField}>
              <Text style={styles.label}>Tare Weight (kg)</Text>
              <Controller
                control={control}
                name="tare_weight_kg"
                render={({ field: { value, onChange } }) => (
                  <TextInput
                    style={styles.input}
                    value={value != null ? String(value) : ""}
                    onChangeText={(t) => onChange(t ? Number(t) : undefined)}
                    placeholder="e.g. 50"
                    placeholderTextColor="#9ca3af"
                    keyboardType="decimal-pad"
                  />
                )}
              />
            </View>
          </View>

          {/* Live net weight */}
          {netWeight !== null && (
            <View
              style={[
                styles.netWeightBox,
                netWeight > 0 ? styles.netWeightPositive : styles.netWeightNegative,
              ]}
            >
              <Text
                style={
                  netWeight > 0
                    ? styles.netWeightTextPositive
                    : styles.netWeightTextNegative
                }
              >
                Net Weight:{" "}
                {netWeight.toLocaleString(undefined, {
                  maximumFractionDigits: 1,
                })}{" "}
                kg
                {netWeight <= 0 && " (tare exceeds gross)"}
              </Text>
            </View>
          )}
        </View>

        {/* Harvest date */}
        <Text style={[styles.label, styles.mt16]}>Harvest Date</Text>
        <Controller
          control={control}
          name="harvest_date"
          render={({ field: { value, onChange } }) => (
            <TextInput
              style={styles.input}
              value={value}
              onChangeText={onChange}
              placeholder="YYYY-MM-DD"
              placeholderTextColor="#9ca3af"
              keyboardType="numbers-and-punctuation"
            />
          )}
        />

        {/* Delivery notes */}
        <Text style={[styles.label, styles.mt16]}>Delivery Notes</Text>
        <Controller
          control={control}
          name="delivery_notes"
          render={({ field: { value, onChange } }) => (
            <TextInput
              style={[styles.input, styles.textarea]}
              value={value}
              onChangeText={onChange}
              placeholder="Any additional notes..."
              placeholderTextColor="#9ca3af"
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />
          )}
        />

        {/* Submit */}
        <TouchableOpacity
          style={[
            styles.submitBtn,
            (isSubmitting || !isConnected) && styles.submitBtnDisabled,
          ]}
          onPress={handleSubmit(onSubmit)}
          disabled={isSubmitting || !isConnected}
          activeOpacity={0.8}
        >
          {isSubmitting ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.submitBtnText}>Submit GRN</Text>
          )}
        </TouchableOpacity>

        <View style={styles.bottomSpacer} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function SummaryRow({
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
    <View style={summaryStyles.row}>
      <Text style={summaryStyles.label}>{label}</Text>
      <Text
        style={[
          summaryStyles.value,
          mono && summaryStyles.mono,
          bold && summaryStyles.bold,
        ]}
      >
        {value}
      </Text>
    </View>
  );
}

const summaryStyles = StyleSheet.create({
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  label: { fontSize: 13, color: "#6b7280" },
  value: { fontSize: 13, color: "#1f2937" },
  mono: { fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace" },
  bold: { fontWeight: "700", color: "#15803d" },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f9fafb" },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  loadingText: { marginTop: 8, fontSize: 13, color: "#9ca3af" },
  formContent: { padding: 20 },
  successContent: { padding: 20 },
  offlineBanner: {
    backgroundColor: "#fef3c7",
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  offlineText: { fontSize: 13, color: "#92400e", textAlign: "center" },
  errorBox: {
    backgroundColor: "#fef2f2",
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  errorText: { fontSize: 13, color: "#b91c1c" },
  label: {
    fontSize: 13,
    fontWeight: "500",
    color: "#374151",
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 6,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: "#1f2937",
    backgroundColor: "#fff",
  },
  textarea: { minHeight: 72 },
  row: { flexDirection: "row", gap: 12 },
  halfField: { flex: 1 },
  mt12: { marginTop: 12 },
  mt16: { marginTop: 16 },
  section: {
    backgroundColor: "#f3f4f6",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e5e7eb",
    padding: 16,
  },
  sectionTitle: { fontSize: 14, fontWeight: "600", color: "#374151" },
  sectionHint: { fontSize: 12, color: "#6b7280", marginTop: 2 },
  netWeightBox: { borderRadius: 8, padding: 12, marginTop: 12 },
  netWeightPositive: {
    backgroundColor: "#f0fdf4",
    borderWidth: 1,
    borderColor: "#bbf7d0",
  },
  netWeightNegative: {
    backgroundColor: "#fef2f2",
    borderWidth: 1,
    borderColor: "#fecaca",
  },
  netWeightTextPositive: { fontSize: 13, fontWeight: "600", color: "#15803d" },
  netWeightTextNegative: { fontSize: 13, fontWeight: "600", color: "#b91c1c" },
  submitBtn: {
    backgroundColor: "#16a34a",
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 20,
  },
  submitBtnDisabled: { opacity: 0.6 },
  submitBtnText: { color: "#fff", fontSize: 15, fontWeight: "600" },
  bottomSpacer: { height: 40 },
  successCard: {
    backgroundColor: "#f0fdf4",
    borderWidth: 1,
    borderColor: "#bbf7d0",
    borderRadius: 12,
    padding: 24,
  },
  successIcon: {
    fontSize: 32,
    color: "#16a34a",
    textAlign: "center",
    marginBottom: 8,
  },
  successTitle: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#15803d",
    textAlign: "center",
    marginBottom: 16,
  },
  summaryRows: { marginBottom: 20 },
  successActions: { gap: 12 },
  primaryBtn: {
    backgroundColor: "#16a34a",
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: "center",
  },
  primaryBtnText: { color: "#fff", fontSize: 15, fontWeight: "600" },
  secondaryBtn: {
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: "center",
    backgroundColor: "#fff",
  },
  secondaryBtnText: { color: "#374151", fontSize: 15, fontWeight: "500" },
});
