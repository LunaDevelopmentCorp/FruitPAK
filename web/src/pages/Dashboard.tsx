import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuthStore } from "../store/authStore";
import { listBatches, BatchOut } from "../api/batches";

export default function Dashboard() {
  const user = useAuthStore((s) => s.user);
  const [batches, setBatches] = useState<BatchOut[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listBatches()
      .then(setBatches)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const received = batches.filter((b) => b.status === "received").length;
  const inProcess = batches.filter((b) => b.status === "processing").length;

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <h1 className="text-2xl font-bold text-gray-800">
        Welcome, {user?.full_name}
      </h1>
      <p className="text-sm text-gray-500 mt-1">
        Role: {user?.role} &middot; Enterprise: {user?.enterprise_id ? "Active" : "Not set up"}
      </p>

      {/* Quick stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6">
        <StatCard label="Total Batches" value={batches.length} />
        <StatCard label="Received" value={received} />
        <StatCard label="Processing" value={inProcess} />
      </div>

      {/* Quick links */}
      <div className="mt-8 flex gap-3">
        <Link
          to="/grn-intake"
          className="bg-green-600 text-white px-4 py-2 rounded text-sm font-medium hover:bg-green-700"
        >
          New GRN Intake
        </Link>
        <Link
          to="/payments"
          className="bg-white border text-gray-700 px-4 py-2 rounded text-sm font-medium hover:bg-gray-50"
        >
          Record Payment
        </Link>
        <Link
          to="/reconciliation"
          className="bg-white border text-gray-700 px-4 py-2 rounded text-sm font-medium hover:bg-gray-50"
        >
          Reconciliation
        </Link>
        <Link
          to="/setup"
          className="bg-white border text-gray-700 px-4 py-2 rounded text-sm font-medium hover:bg-gray-50"
        >
          Setup Wizard
        </Link>
      </div>

      {/* Recent batches */}
      {loading ? (
        <p className="mt-8 text-gray-400 text-sm">Loading batches...</p>
      ) : batches.length > 0 ? (
        <div className="mt-8">
          <h2 className="text-lg font-semibold text-gray-800 mb-3">
            Recent Batches
          </h2>
          <div className="bg-white rounded-lg border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="text-left px-4 py-2 font-medium">Code</th>
                  <th className="text-left px-4 py-2 font-medium">Fruit</th>
                  <th className="text-left px-4 py-2 font-medium">Variety</th>
                  <th className="text-right px-4 py-2 font-medium">Net (kg)</th>
                  <th className="text-left px-4 py-2 font-medium">Status</th>
                  <th className="text-left px-4 py-2 font-medium">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {batches.slice(0, 10).map((b) => (
                  <tr key={b.id} className="hover:bg-gray-50 cursor-pointer">
                    <td className="px-4 py-2 font-mono text-xs">
                      <Link to={`/batches/${b.id}`} className="text-green-700 hover:underline">
                        {b.batch_code}
                      </Link>
                    </td>
                    <td className="px-4 py-2">{b.fruit_type}</td>
                    <td className="px-4 py-2">{b.variety || "—"}</td>
                    <td className="px-4 py-2 text-right">
                      {b.net_weight_kg?.toLocaleString() ?? "—"}
                    </td>
                    <td className="px-4 py-2">
                      <span
                        className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                          b.status === "received"
                            ? "bg-blue-50 text-blue-700"
                            : b.status === "processing"
                            ? "bg-yellow-50 text-yellow-700"
                            : "bg-gray-100 text-gray-600"
                        }`}
                      >
                        {b.status}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-gray-500">
                      {b.created_at ? new Date(b.created_at).toLocaleDateString() : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <p className="mt-8 text-gray-400 text-sm">
          No batches yet. Start by creating a GRN intake.
        </p>
      )}
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-white rounded-lg border p-4">
      <p className="text-sm text-gray-500">{label}</p>
      <p className="text-2xl font-bold text-gray-800 mt-1">{value}</p>
    </div>
  );
}
