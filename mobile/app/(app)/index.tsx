import React from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";
import { useAuthStore } from "../../src/store/authStore";
import { useNetworkStatus } from "../../src/hooks/useNetworkStatus";

export default function HomeScreen() {
  const user = useAuthStore((s) => s.user);
  const router = useRouter();
  const { isConnected } = useNetworkStatus();

  return (
    <View style={styles.container}>
      {!isConnected && (
        <View style={styles.offlineBanner}>
          <Text style={styles.offlineText}>
            You are offline — some features may not work
          </Text>
        </View>
      )}

      <Text style={styles.welcome}>Welcome, {user?.full_name}</Text>
      <Text style={styles.sub}>
        Role: {user?.role} · Enterprise:{" "}
        {user?.enterprise_id ? "Active" : "Not set up"}
      </Text>

      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.primaryBtn}
          onPress={() => router.push("/(app)/grn-intake")}
          activeOpacity={0.8}
        >
          <Text style={styles.primaryBtnText}>New GRN Intake</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.secondaryBtn}
          onPress={() => router.push("/(app)/scan-qr")}
          activeOpacity={0.8}
        >
          <Text style={styles.secondaryBtnText}>Scan QR Code</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#f9fafb", padding: 20 },
  offlineBanner: {
    backgroundColor: "#fef3c7",
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  offlineText: { fontSize: 13, color: "#92400e", textAlign: "center" },
  welcome: { fontSize: 22, fontWeight: "bold", color: "#1f2937" },
  sub: { fontSize: 13, color: "#6b7280", marginTop: 4 },
  actions: { marginTop: 24, gap: 12 },
  primaryBtn: {
    backgroundColor: "#16a34a",
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: "center",
  },
  primaryBtnText: { color: "#fff", fontSize: 15, fontWeight: "600" },
  secondaryBtn: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#d1d5db",
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: "center" as const,
  },
  secondaryBtnText: { color: "#374151", fontSize: 15, fontWeight: "600" as const },
});
