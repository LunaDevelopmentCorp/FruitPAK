import { create } from "zustand";

export interface AuthUser {
  id: string;
  email: string;
  full_name: string;
  phone: string | null;
  role: string;
  is_active: boolean;
  enterprise_id: string | null;
  is_onboarded: boolean;
  permissions: string[];
  assigned_packhouses: string[] | null;
  preferred_language: string;
}

interface AuthState {
  token: string | null;
  refreshToken: string | null;
  user: AuthUser | null;
  setAuth: (token: string, refreshToken: string, user: AuthUser) => void;
  markOnboarded: () => void;
  logout: () => void;
  isAuthenticated: () => boolean;
  isOnboarded: () => boolean;
}

const _initToken = localStorage.getItem("access_token");
const _initUser = (() => {
  try {
    const u = localStorage.getItem("user");
    return u ? JSON.parse(u) : null;
  } catch {
    return null;
  }
})();
console.log("[auth] Store init:", _initToken ? "token found" : "no token", _initUser ? `user=${_initUser.email}` : "no user");

export const useAuthStore = create<AuthState>((set, get) => ({
  token: _initToken,
  refreshToken: localStorage.getItem("refresh_token"),
  user: _initUser,

  setAuth: (token, refreshToken, user) => {
    console.log("[auth] setAuth:", user.email, "onboarded:", user.is_onboarded, "enterprise:", user.enterprise_id);
    localStorage.setItem("access_token", token);
    localStorage.setItem("refresh_token", refreshToken);
    localStorage.setItem("user", JSON.stringify(user));
    set({ token, refreshToken, user });
  },

  markOnboarded: () => {
    const user = get().user;
    if (user) {
      const updated = { ...user, is_onboarded: true };
      localStorage.setItem("user", JSON.stringify(updated));
      set({ user: updated });
    }
  },

  logout: () => {
    console.log("[auth] logout called");
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    localStorage.removeItem("user");
    set({ token: null, refreshToken: null, user: null });
  },

  isAuthenticated: () => !!get().token,
  isOnboarded: () => !!get().user?.is_onboarded,
}));
