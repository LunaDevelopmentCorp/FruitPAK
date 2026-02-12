import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";

export interface AuthUser {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
  role: string;
  is_active: boolean;
  enterprise_id: string | null;
  permissions: string[];
  assigned_packhouses: string[] | null;
}

interface AuthState {
  token: string | null;
  refreshToken: string | null;
  user: AuthUser | null;
  hydrated: boolean;
  setAuth: (token: string, refreshToken: string, user: AuthUser) => Promise<void>;
  logout: () => Promise<void>;
  hydrate: () => Promise<void>;
  isAuthenticated: () => boolean;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  token: null,
  refreshToken: null,
  user: null,
  hydrated: false,

  setAuth: async (token, refreshToken, user) => {
    await AsyncStorage.setItem("access_token", token);
    await AsyncStorage.setItem("refresh_token", refreshToken);
    await AsyncStorage.setItem("user", JSON.stringify(user));
    set({ token, refreshToken, user });
  },

  logout: async () => {
    await AsyncStorage.multiRemove(["access_token", "refresh_token", "user"]);
    set({ token: null, refreshToken: null, user: null });
  },

  hydrate: async () => {
    try {
      const [token, refreshToken, userJson] = await AsyncStorage.multiGet([
        "access_token",
        "refresh_token",
        "user",
      ]);
      const user = userJson[1] ? JSON.parse(userJson[1]) : null;
      set({
        token: token[1],
        refreshToken: refreshToken[1],
        user,
        hydrated: true,
      });
    } catch {
      set({ hydrated: true });
    }
  },

  isAuthenticated: () => !!get().token,
}));
