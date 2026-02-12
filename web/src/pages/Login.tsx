import React, { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { login } from "../api/auth";
import { useAuthStore } from "../store/authStore";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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

      // Route based on onboarding state
      if (!res.user.enterprise_id) {
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
      if (err && typeof err === "object" && "response" in err) {
        const axiosErr = err as { response?: { data?: { detail?: string }; status?: number } };
        if (axiosErr.response?.status === 401) {
          setError("Invalid email or password");
        } else {
          setError(axiosErr.response?.data?.detail || "Login failed");
        }
      } else {
        setError("Network error — is the server running?");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-green-700">FruitPAK</h1>
          <p className="text-sm text-gray-500 mt-1">
            Packhouse Management System
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-white shadow rounded-lg p-6 space-y-4"
        >
          <h2 className="text-lg font-semibold text-gray-800">Sign in</h2>

          {error && (
            <div className="p-3 bg-red-50 text-red-700 rounded text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoFocus
              className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
              placeholder="admin@testfarm.com"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 focus:border-transparent"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-green-600 text-white py-2 rounded text-sm font-medium hover:bg-green-700 disabled:opacity-50"
          >
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
