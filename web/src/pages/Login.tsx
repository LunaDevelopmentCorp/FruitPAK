import React, { useState } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { login } from "../api/auth";
import { getErrorMessage } from "../api/client";
import { useAuthStore } from "../store/authStore";
import LanguageSelector from "../components/LanguageSelector";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const { t, i18n } = useTranslation("auth");
  const setAuth = useAuthStore((s) => s.setAuth);
  const navigate = useNavigate();
  const location = useLocation();

  const from = (location.state as { from?: { pathname: string } })?.from?.pathname;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await login({ email, password });
      console.log("[auth] Login success:", res.user.email, "enterprise:", res.user.enterprise_id, "onboarded:", res.user.is_onboarded);
      setAuth(res.access_token, res.refresh_token, res.user);

      // Sync UI language to user's saved preference
      if (res.user.preferred_language && res.user.preferred_language !== i18n.language) {
        i18n.changeLanguage(res.user.preferred_language);
      }

      // Route based on role and onboarding state
      if (res.user.role === "platform_admin") {
        console.log("[auth] Routing → /platform (platform admin)");
        navigate(from || "/platform");
      } else if (!res.user.enterprise_id) {
        console.log("[auth] Routing → /enterprise-setup (no enterprise)");
        navigate("/enterprise-setup");
      } else if (!res.user.is_onboarded) {
        console.log("[auth] Routing → /setup (not onboarded)");
        navigate("/setup");
      } else {
        console.log("[auth] Routing →", from || "/dashboard");
        navigate(from || "/dashboard");
      }
    } catch (err: unknown) {
      const axiosErr = err as { response?: { status?: number } };
      if (axiosErr.response?.status === 401) {
        setError(t("login.invalidCredentials"));
      } else {
        setError(getErrorMessage(err, t("login.loginFailed")));
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <LanguageSelector className="absolute top-4 right-4" />
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-green-700">{t("common:appName")}</h1>
          <p className="text-sm text-gray-500 mt-1">
            {t("common:tagline")}
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-white shadow rounded-lg p-6 space-y-4"
        >
          <h2 className="text-lg font-semibold text-gray-800">{t("login.title")}</h2>

          {error && (
            <div className="p-3 bg-red-50 text-red-700 rounded text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t("login.email")}
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
              className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
              placeholder={t("login.emailPlaceholder")}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t("login.password")}
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
              placeholder={t("login.passwordPlaceholder")}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-green-600 text-white py-2 rounded text-sm font-medium hover:bg-green-700 disabled:opacity-50"
          >
            {loading ? t("login.submitting") : t("login.submit")}
          </button>

          <p className="text-center text-sm text-gray-500">
            {t("login.noAccount")}{" "}
            <Link to="/register" className="text-green-600 hover:underline font-medium">
              {t("login.createAccount")}
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
