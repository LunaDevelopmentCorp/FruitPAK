import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { getErrorMessage } from "../api/client";
import { createEnterprise, reissueToken } from "../api/enterprise";
import { useAuthStore } from "../store/authStore";

export default function EnterpriseSetup() {
  const [name, setName] = useState("");
  const [country, setCountry] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const setAuth = useAuthStore((s) => s.setAuth);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !country.trim()) {
      setError("Company name and country are required.");
      return;
    }

    setError(null);
    setLoading(true);

    try {
      // 1. Create the enterprise (provisions tenant schema)
      await createEnterprise({ name: name.trim(), country: country.trim() });

      // 2. Reissue JWT with tenant_schema claim
      const res = await reissueToken();
      setAuth(res.access_token, res.refresh_token, res.user);

      // 3. Go to wizard
      navigate("/setup");
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Failed to create enterprise"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-green-700">FruitPAK</h1>
          <p className="text-sm text-gray-500 mt-1">
            Create your enterprise to get started
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-white shadow rounded-lg p-6 space-y-4"
        >
          <h2 className="text-lg font-semibold text-gray-800">
            Enterprise Details
          </h2>

          {error && (
            <div className="p-3 bg-red-50 text-red-700 rounded text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Company Name *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
              className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              placeholder="e.g. Cape Citrus Packers"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Country *
            </label>
            <input
              type="text"
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              required
              className="w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              placeholder="e.g. South Africa"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-green-600 text-white py-2 rounded text-sm font-medium hover:bg-green-700 disabled:opacity-50"
          >
            {loading ? "Creating..." : "Create Enterprise"}
          </button>
        </form>
      </div>
    </div>
  );
}
