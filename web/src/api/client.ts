import axios, { AxiosError, InternalAxiosRequestConfig } from "axios";
import { showToast } from "../store/toastStore";

/** Clear all auth state from localStorage (Zustand store re-reads on page reload). */
function clearAuthStorage() {
  console.log("[api] Clearing auth storage");
  localStorage.removeItem("access_token");
  localStorage.removeItem("refresh_token");
  localStorage.removeItem("user");
}

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || "/api",
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem("access_token");
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  console.log("[api] Request:", config.method?.toUpperCase(), config.url, token ? "(token attached)" : "(no token)");
  return config;
});

// Auto-refresh: queue failed requests while refreshing, then retry
let isRefreshing = false;
let failedQueue: Array<{
  resolve: (token: string) => void;
  reject: (err: unknown) => void;
}> = [];

function processQueue(error: unknown, token: string | null) {
  failedQueue.forEach((p) => {
    if (token) p.resolve(token);
    else p.reject(error);
  });
  failedQueue = [];
}

api.interceptors.response.use(
  (response) => {
    console.log("[api] Response:", response.status, response.config.url);
    return response;
  },
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };
    const status = error.response?.status;

    console.warn("[api] Error:", status, originalRequest.url, (error.response?.data as Record<string, unknown>)?.detail || "");

    // On 401, try to refresh the token before giving up
    if (status === 401 && !originalRequest._retry && window.location.pathname !== "/login") {
      const refreshToken = localStorage.getItem("refresh_token");

      if (!refreshToken) {
        // No refresh token — redirect to login
        clearAuthStorage();
        window.location.href = "/login";
        return Promise.reject(error);
      }

      if (isRefreshing) {
        // Another refresh is in progress — queue this request
        return new Promise((resolve, reject) => {
          failedQueue.push({
            resolve: (token: string) => {
              originalRequest.headers.Authorization = `Bearer ${token}`;
              resolve(api(originalRequest));
            },
            reject,
          });
        });
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const { data } = await axios.post(
          `${api.defaults.baseURL}/auth/refresh`,
          { refresh_token: refreshToken },
        );
        const newAccessToken = data.access_token;
        const newRefreshToken = data.refresh_token;

        localStorage.setItem("access_token", newAccessToken);
        if (newRefreshToken) localStorage.setItem("refresh_token", newRefreshToken);

        processQueue(null, newAccessToken);

        originalRequest.headers.Authorization = `Bearer ${newAccessToken}`;
        return api(originalRequest);
      } catch (refreshError) {
        processQueue(refreshError, null);
        clearAuthStorage();
        window.location.href = "/login";
        return Promise.reject(refreshError);
      } finally {
        isRefreshing = false;
      }
    }

    // 403 Forbidden — NOT an auth failure; user is authenticated but not authorized
    // for this specific action. Don't nuke auth — let the calling code handle it.
    if (status === 403) {
      console.warn("[api] 403 Forbidden:", (error.response?.data as Record<string, unknown>)?.detail || "Access denied");
      return Promise.reject(error);
    }

    // 5xx server errors
    if (status && status >= 500) {
      showToast("error", "Server error — please try again later.");
      return Promise.reject(error);
    }

    // Network error (no response)
    if (!error.response) {
      showToast("error", "No connection — check your internet.");
      return Promise.reject(error);
    }

    return Promise.reject(error);
  }
);

export default api;
