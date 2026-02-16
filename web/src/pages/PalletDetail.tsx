import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { getPallet, deallocateFromPallet, PalletDetailType } from "../api/pallets";
import { showToast as globalToast } from "../store/toastStore";

const STATUS_COLORS: Record<string, string> = {
  open: "bg-blue-50 text-blue-700",
  closed: "bg-yellow-50 text-yellow-700",
  stored: "bg-green-50 text-green-700",
  allocated: "bg-purple-50 text-purple-700",
  loaded: "bg-orange-50 text-orange-700",
  exported: "bg-gray-100 text-gray-600",
};

export default function PalletDetail() {
  const { palletId } = useParams<{ palletId: string }>();
  const [pallet, setPallet] = useState<PalletDetailType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const fetchPallet = () => {
    if (!palletId) return;
    setLoading(true);
    getPallet(palletId)
      .then(setPallet)
      .catch(() => setError("Failed to load pallet"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchPallet();
  }, [palletId]);

  const canModify = pallet && !["loaded", "exported"].includes(pallet.status);

  const handleRemoveLot = async (palletLotId: string, lotCode: string, boxCount: number) => {
    if (!palletId) return;
    if (!confirm(`Remove ${boxCount} box(es) from lot ${lotCode}? They will return to available stock.`)) return;
    setRemovingId(palletLotId);
    try {
      const result = await deallocateFromPallet(palletId, palletLotId);
      globalToast("success", `${result.boxes_returned} box(es) returned to lot ${lotCode}.`);
      fetchPallet();
    } catch {
      globalToast("error", "Failed to remove allocation.");
    } finally {
      setRemovingId(null);
    }
  };

  if (loading) return <p className="p-6 text-gray-400 text-sm">Loading pallet...</p>;
  if (error) return <div className="p-6 text-red-600 text-sm">{error}</div>;
  if (!pallet) return <div className="p-6 text-gray-400 text-sm">Pallet not found.</div>;

  const fillPct = Math.round((pallet.current_boxes / pallet.capacity_boxes) * 100);

  return (
    <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Link to="/pallets" className="text-sm text-gray-500 hover:text-gray-700">
            &larr; All Pallets
          </Link>
          <h1 className="text-2xl font-bold text-gray-800 mt-1">{pallet.pallet_number}</h1>
        </div>
        <span className={`inline-block px-3 py-1 rounded-full text-sm font-medium ${
          STATUS_COLORS[pallet.status] || "bg-gray-100 text-gray-600"
        }`}>
          {pallet.status}
        </span>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card label="Boxes" value={`${pallet.current_boxes} / ${pallet.capacity_boxes}`} />
        <Card label="Fill" value={`${fillPct}%`} />
        <Card label="Weight" value={pallet.net_weight_kg ? `${pallet.net_weight_kg} kg` : "\u2014"} />
        <Card label="Type" value={pallet.pallet_type_name || "\u2014"} />
      </div>

      {/* Capacity bar */}
      <div className="bg-white rounded-lg border p-4">
        <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
          <span>Capacity</span>
          <span>{pallet.current_boxes} / {pallet.capacity_boxes} boxes</span>
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

      {/* Fruit info */}
      <div className="bg-white rounded-lg border p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Fruit Details</h3>
        <div className="grid grid-cols-2 gap-y-2 text-sm">
          <Row label="Fruit" value={pallet.fruit_type || "\u2014"} />
          <Row label="Variety" value={pallet.variety || "\u2014"} />
          <Row label="Grade" value={pallet.grade || "\u2014"} />
          <Row label="Size" value={pallet.size || "\u2014"} />
          <Row label="Target Market" value={pallet.target_market || "\u2014"} />
        </div>
      </div>

      {/* Cold storage */}
      {(pallet.cold_store_room || pallet.cold_store_position) && (
        <div className="bg-white rounded-lg border p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Cold Storage</h3>
          <div className="grid grid-cols-2 gap-y-2 text-sm">
            <Row label="Room" value={pallet.cold_store_room || "\u2014"} />
            <Row label="Position" value={pallet.cold_store_position || "\u2014"} />
          </div>
        </div>
      )}

      {/* Linked lots */}
      <div className="bg-white rounded-lg border p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">
          Linked Lots ({pallet.pallet_lots.length})
        </h3>
        {pallet.pallet_lots.length > 0 ? (
          <table className="w-full text-sm">
            <thead className="text-gray-500 text-xs">
              <tr>
                <th className="text-left px-2 py-1.5 font-medium">Lot Code</th>
                <th className="text-left px-2 py-1.5 font-medium">Grade</th>
                <th className="text-left px-2 py-1.5 font-medium">Size</th>
                <th className="text-right px-2 py-1.5 font-medium">Boxes</th>
                {canModify && <th className="px-2 py-1.5 font-medium" />}
              </tr>
            </thead>
            <tbody className="divide-y">
              {pallet.pallet_lots.map((pl) => (
                <tr key={pl.id} className="hover:bg-gray-50">
                  <td className="px-2 py-1.5 font-mono text-xs text-green-700">
                    {pl.lot_code || pl.lot_id}
                  </td>
                  <td className="px-2 py-1.5">{pl.grade || "\u2014"}</td>
                  <td className="px-2 py-1.5">{pl.size || "\u2014"}</td>
                  <td className="px-2 py-1.5 text-right font-medium">{pl.box_count}</td>
                  {canModify && (
                    <td className="px-2 py-1.5 text-right">
                      <button
                        onClick={() => handleRemoveLot(pl.id, pl.lot_code || pl.lot_id, pl.box_count)}
                        disabled={removingId === pl.id}
                        className="text-xs text-red-500 hover:text-red-700 font-medium disabled:opacity-50"
                      >
                        {removingId === pl.id ? "Removing..." : "Remove"}
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-gray-400 text-sm">No lots linked.</p>
        )}
      </div>

      {/* Notes */}
      {pallet.notes && (
        <div className="bg-white rounded-lg border p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Notes</h3>
          <p className="text-sm text-gray-600">{pallet.notes}</p>
        </div>
      )}

      {/* Meta */}
      <div className="text-xs text-gray-400">
        Created: {new Date(pallet.created_at).toLocaleString()} | Updated: {new Date(pallet.updated_at).toLocaleString()}
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
