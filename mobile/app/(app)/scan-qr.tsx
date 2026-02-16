import React, { useState } from "react";
import {
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useRouter } from "expo-router";
import { CameraView, useCameraPermissions } from "expo-camera";

export default function ScanQRScreen() {
  const router = useRouter();
  const [permission, requestPermission] = useCameraPermissions();
  const [scanned, setScanned] = useState(false);

  const handleBarCodeScanned = ({ data }: { data: string }) => {
    if (scanned) return;
    setScanned(true);

    try {
      const parsed = JSON.parse(data);

      if (parsed.type === "pallet" && parsed.pallet_id) {
        Alert.alert(
          "Pallet Scanned",
          `${parsed.number}\n${parsed.fruit_type || ""} · ${parsed.grade || ""}\n${parsed.boxes ?? 0} boxes`,
          [
            { text: "Scan Again", onPress: () => setScanned(false) },
            { text: "OK", onPress: () => router.back() },
          ],
        );
      } else if (parsed.type === "container" && parsed.container_id) {
        Alert.alert(
          "Container Scanned",
          `${parsed.number}\n${parsed.customer || "—"} → ${parsed.destination || "—"}\n${parsed.total_cartons ?? 0} cartons`,
          [
            { text: "Scan Again", onPress: () => setScanned(false) },
            { text: "OK", onPress: () => router.back() },
          ],
        );
      } else if (parsed.batch_id || parsed.code) {
        Alert.alert(
          "Batch / GRN Scanned",
          `${parsed.code}\n${parsed.grower_name || "—"} · ${parsed.variety || "—"}`,
          [
            { text: "Scan Again", onPress: () => setScanned(false) },
            { text: "OK", onPress: () => router.back() },
          ],
        );
      } else {
        Alert.alert("Unknown QR", data.slice(0, 200), [
          { text: "Scan Again", onPress: () => setScanned(false) },
        ]);
      }
    } catch {
      Alert.alert("Invalid QR", "Could not parse QR code data.", [
        { text: "Scan Again", onPress: () => setScanned(false) },
      ]);
    }
  };

  if (!permission) {
    return (
      <View style={styles.center}>
        <Text style={styles.message}>Requesting camera permission...</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Text style={styles.message}>
          Camera permission is required to scan QR codes.
        </Text>
        <TouchableOpacity style={styles.btn} onPress={requestPermission}>
          <Text style={styles.btnText}>Grant Permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView
        style={StyleSheet.absoluteFillObject}
        barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
        onBarcodeScanned={scanned ? undefined : handleBarCodeScanned}
      />

      {/* Overlay */}
      <View style={styles.overlay}>
        <View style={styles.frame} />
        <Text style={styles.hint}>
          Point camera at a FruitPAK QR code
        </Text>
      </View>

      {scanned && (
        <TouchableOpacity
          style={styles.rescanBtn}
          onPress={() => setScanned(false)}
        >
          <Text style={styles.rescanText}>Tap to Scan Again</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#000" },
  center: {
    flex: 1,
    backgroundColor: "#f9fafb",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  message: {
    fontSize: 15,
    color: "#6b7280",
    textAlign: "center",
    marginBottom: 16,
  },
  btn: {
    backgroundColor: "#16a34a",
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  btnText: { color: "#fff", fontSize: 15, fontWeight: "600" },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: "center",
    alignItems: "center",
  },
  frame: {
    width: 250,
    height: 250,
    borderWidth: 2,
    borderColor: "#16a34a",
    borderRadius: 16,
  },
  hint: {
    marginTop: 20,
    fontSize: 14,
    color: "#fff",
    textAlign: "center",
    backgroundColor: "rgba(0,0,0,0.5)",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  rescanBtn: {
    position: "absolute",
    bottom: 60,
    alignSelf: "center",
    backgroundColor: "#16a34a",
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  rescanText: { color: "#fff", fontSize: 15, fontWeight: "600" },
});
