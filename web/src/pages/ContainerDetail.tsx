import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { getContainer, ContainerDetailType } from "../api/containers";

const STATUS_COLORS: Record<string, string> = {
  open: "bg-blue-50 text-blue-700",
  loading: "bg-yellow-50 text-yellow-700",
  sealed: "bg-green-50 text-green-700",
  dispatched: "bg-purple-50 text-purple-700",
  delivered: "bg-gray-100 text-gray-600",
};

export default function ContainerDetail() {
  const { containerId } = useParams<{ containerId: string }>();
  const [container, setContainer] = useState<ContainerDetailType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!containerId) return;
    setLoading(true);
    getContainer(containerId)
      .then(setContainer)
      .catch(() => setError("Failed to load container"))
      .finally(() => setLoading(false));
  }, [containerId]);

  if (loading) return <p className="p-6 text-gray-400 text-sm">Loading container...</p>;
  if (error) return <div className="p-6 text-red-600 text-sm">{error}</div>;
  if (!container) return <div className="p-6 text-gray-400 text-sm">Container not found.</div>;

  const fillPct = container.capacity_pallets > 0
    ? Math.round((container.pallet_count / container.capacity_pallets) * 100)
    : 0;

  return (
    <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Link to="/containers" className="text-sm text-gray-500 hover:text-gray-700">
            &larr; All Containers
          </Link>
          <h1 className="text-2xl font-bold text-gray-800 mt-1">{container.container_number}</h1>
        </div>
        <span className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${
          STATUS_COLORS[container.status] || "bg-gray-100 text-gray-600"
        }`}>
          {container.status}
        </span>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card label="Pallets" value={`${container.pallet_count} / ${container.capacity_pallets}`} />
        <Card label="Fill" value={`${fillPct}%`} />
        <Card label="Total Cartons" value={container.total_cartons.toLocaleString()} />
        <Card label="Weight" value={container.gross_weight_kg ? `${container.gross_weight_kg.toLocaleString()} kg` : "\u2014"} />
      </div>

      {/* Fill bar */}
      <div className="bg-white rounded-lg border p-4">
        <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
          <span>Capacity</span>
          <span>{container.pallet_count} / {container.capacity_pallets} pallets</span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className={`h-2 rounded-full transition-all ${
              fillPct >= 100 ? "bg-green-500" : fillPct >= 75 ? "bg-yellow-500" : "bg-blue-500"
            }`}
            style={{ width: `${Math.min(fillPct, 100)}%` }}
          />
        </div>
      </div>

      {/* Shipment info */}
      <div className="bg-white rounded-lg border p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Shipment Details</h3>
        <div className="grid grid-cols-2 gap-y-2 text-sm">
          <Row label="Type" value={container.container_type} />
          <Row label="Customer" value={container.customer_name || "\u2014"} />
          <Row label="Destination" value={container.destination || "\u2014"} />
          <Row label="Export Date" value={container.export_date ? new Date(container.export_date).toLocaleDateString() : "\u2014"} />
          <Row label="Seal Number" value={container.seal_number || "\u2014"} />
        </div>
      </div>

      {/* Pallets table */}
      <div className="bg-white rounded-lg border p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">
          Pallets ({container.pallets.length})
        </h3>
        {container.pallets.length > 0 ? (
          <table className="w-full text-sm">
            <thead className="text-gray-500 text-xs">
              <tr>
                <th className="text-left px-2 py-1.5 font-medium">Pallet #</th>
                <th className="text-left px-2 py-1.5 font-medium">Fruit</th>
                <th className="text-left px-2 py-1.5 font-medium">Grade</th>
                <th className="text-left px-2 py-1.5 font-medium">Size</th>
                <th className="text-right px-2 py-1.5 font-medium">Boxes</th>
                <th className="text-left px-2 py-1.5 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {container.pallets.map((p) => (
                <tr key={p.id} className="hover:bg-gray-50">
                  <td className="px-2 py-1.5">
                    <Link to={`/pallets/${p.id}`} className="font-mono text-xs text-green-700 hover:underline">
                      {p.pallet_number}
                    </Link>
                  </td>
                  <td className="px-2 py-1.5">{p.fruit_type || "\u2014"}</td>
                  <td className="px-2 py-1.5">{p.grade || "\u2014"}</td>
                  <td className="px-2 py-1.5">{p.size || "\u2014"}</td>
                  <td className="px-2 py-1.5 text-right font-medium">{p.current_boxes}</td>
                  <td className="px-2 py-1.5">
                    <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-green-50 text-green-700">
                      {p.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-gray-400 text-sm">No pallets loaded.</p>
        )}
      </div>

      {/* Traceability */}
      {container.traceability.length > 0 && (
        <div className="bg-white rounded-lg border p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">
            Full Traceability
          </h3>
          <div className="space-y-4">
            {container.traceability.map((tp) => (
              <div key={tp.pallet_number} className="border rounded p-3">
                <p className="text-xs font-semibold text-gray-600 mb-2">
                  Pallet {tp.pallet_number} ({tp.current_boxes} boxes)
                </p>

                {/* Lots */}
                {tp.lots.length > 0 && (
                  <div className="ml-4 mb-2">
                    <p className="text-xs text-gray-500 mb-1">Lots:</p>
                    <div className="space-y-1">
                      {tp.lots.map((lot, i) => (
                        <p key={i} className="text-xs text-gray-700">
                          <span className="font-mono text-green-700">{lot.lot_code}</span>
                          {" \u2014 "}
                          {lot.grade || "?"} / {lot.size || "?"} ({lot.box_count} boxes)
                        </p>
                      ))}
                    </div>
                  </div>
                )}

                {/* Batches → Growers */}
                {tp.batches.length > 0 && (
                  <div className="ml-4">
                    <p className="text-xs text-gray-500 mb-1">GRNs / Growers:</p>
                    <div className="space-y-1">
                      {tp.batches.map((b, i) => (
                        <p key={i} className="text-xs text-gray-700">
                          <span className="font-mono text-green-700">{b.batch_code}</span>
                          {" \u2190 "}
                          <span className="font-medium">{b.grower_name || "?"}</span>
                          {" \u00b7 "}
                          {b.fruit_type}
                          {b.intake_date && ` \u00b7 ${new Date(b.intake_date).toLocaleDateString()}`}
                        </p>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Notes */}
      {container.notes && (
        <div className="bg-white rounded-lg border p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Notes</h3>
          <p className="text-sm text-gray-600">{container.notes}</p>
        </div>
      )}

      {/* Meta */}
      <div className="text-xs text-gray-400">
        Created: {new Date(container.created_at).toLocaleString()} | Updated: {new Date(container.updated_at).toLocaleString()}
      </div>
    </div>
  );
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-white rounded-lg border p-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="text-lg font-semibold text-gray-800">{value}</p>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <>
      <span className="text-gray-500">{label}</span>
      <span className="text-gray-800">{value}</span>
    </>
  );
}
