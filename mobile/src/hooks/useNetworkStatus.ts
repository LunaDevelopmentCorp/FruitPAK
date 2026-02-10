import { useEffect, useState } from "react";
import * as Network from "expo-network";
import { AppState } from "react-native";

export function useNetworkStatus() {
  const [isConnected, setIsConnected] = useState(true);
  const [isLoading, setIsLoading] = useState(true);

  const check = async () => {
    try {
      const state = await Network.getNetworkStateAsync();
      setIsConnected(state.isConnected ?? true);
    } catch {
      // Assume connected if check fails (e.g. simulator)
      setIsConnected(true);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    check();

    const sub = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        check();
      }
    });

    return () => sub.remove();
  }, []);

  return { isConnected, isLoading };
}
