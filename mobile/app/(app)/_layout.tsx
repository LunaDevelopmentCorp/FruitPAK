import React from "react";
import { StyleSheet, Text, TouchableOpacity } from "react-native";
import { Stack, useRouter } from "expo-router";
import { useAuthStore } from "../../src/store/authStore";

export default function AppLayout() {
  const logout = useAuthStore((s) => s.logout);
  const router = useRouter();

  const handleLogout = async () => {
    await logout();
    router.replace("/login");
  };

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: "#fff" },
        headerTitleStyle: styles.headerTitle,
        headerTintColor: "#15803d",
        headerRight: () => (
          <TouchableOpacity onPress={handleLogout} style={styles.logoutBtn}>
            <Text style={styles.logoutText}>Logout</Text>
          </TouchableOpacity>
        ),
      }}
    >
      <Stack.Screen name="index" options={{ title: "FruitPAK" }} />
      <Stack.Screen name="grn-intake" options={{ title: "GRN Intake" }} />
      <Stack.Screen name="scan-qr" options={{ title: "Scan QR" }} />
    </Stack>
  );
}

const styles = StyleSheet.create({
  headerTitle: { fontWeight: "700", color: "#15803d" },
  logoutBtn: { marginRight: 4 },
  logoutText: { fontSize: 13, color: "#6b7280" },
});
