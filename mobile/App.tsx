import React from "react";
import { StyleSheet, Text, View } from "react-native";

export default function App() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>FruitPAK</Text>
      <Text style={styles.subtitle}>
        Fruit Inventory Packhouse Management & Export System
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#f9fafb" },
  title: { fontSize: 32, fontWeight: "bold", color: "#15803d" },
  subtitle: { marginTop: 8, fontSize: 14, color: "#6b7280" },
});
