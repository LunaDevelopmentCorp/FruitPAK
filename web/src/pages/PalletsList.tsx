import { useEffect, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { listPallets, allocateBoxesToPallet, getPalletTypes, getPalletTypeCapacities, getBoxSizes, createEmptyPallet, PalletSummary, PalletTypeConfig, BoxSizeConfig, LotAssignment } from "../api/pallets";
import { listLots, listPackhouses, LotSummary, Packhouse } from "../api/batches";
import { createContainerFromPallets } from "../api/containers";
import { listClients, ClientSummary } from "../api/clients";
import { showToast as globalToast } from "../store/toastStore";

const STATUS_COLORS: Record<string, string> = {
  open: "bg-blue-50 text-blue-700",
  closed: "bg-yellow-50 text-yellow-700",
  stored: "bg-green-50 text-green-700",
  allocated: "bg-purple-50 text-purple-700",
  loaded: "bg-orange-50 text-orange-700",
  exported: "bg-gray-100 text-gray-600",
};

const CONTAINER_TYPES = ["reefer_20ft", "reefer_40ft", "open_truck", "break_bulk"];

export default function PalletsList() {
  const navigate = useNavigate();
  const [pallets, setPallets] = useState<PalletSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("");
  const [search, setSearch] = useState("");

  // Allocate boxes to pallet
  const [allocatingPalletId, setAllocatingPalletId] = useState<string | null>(null);
  const [allocateLots, setAllocateLots] = useState<LotSummary[]>([]);
  const [allocateAssignments, setAllocateAssignments] = useState<Record<string, number>>({});
  const [allocateSaving, setAllocateSaving] = useState(false);
  const [allocateLoading, setAllocateLoading] = useState(false);

  // Container assignment
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showContainerForm, setShowContainerForm] = useState(false);
  const [containerType, setContainerType] = useState("reefer_20ft");
  const [capacityPallets, setCapacityPallets] = useState(20);
  const [clientId, setClientId] = useState("");
  const [clients, setClients] = useState<ClientSummary[]>([]);
  const [shippingContainerNumber, setShippingContainerNumber] = useState("");
  const [destination, setDestination] = useState("");
  const [sealNumber, setSealNumber] = useState("");
  const [containerSaving, setContainerSaving] = useState(false);

  // Create empty pallet
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [palletTypes, setPalletTypes] = useState<PalletTypeConfig[]>([]);
  const [packhouses, setPackhouses] = useState<Packhouse[]>([]);
  const [newPalletType, setNewPalletType] = useState("");
  const [newCapacity, setNewCapacity] = useState(240);
  const [newPackhouseId, setNewPackhouseId] = useState("");
  const [newSize, setNewSize] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [createSaving, setCreateSaving] = useState(false);
  const [availableLotSizes, setAvailableLotSizes] = useState<string[]>([]);
  const [boxSizes, setBoxSizes] = useState<BoxSizeConfig[]>([]);
  const [newBoxSizeId, setNewBoxSizeId] = useState("");
  const [availableBoxTypeIds, setAvailableBoxTypeIds] = useState<string[]>([]);

  const handleCreatePallet = async () => {
    if (!newPalletType) { globalToast("error", "Select a pallet type."); return; }
    if (!newPackhouseId) { globalToast("error", "Select a packhouse."); return; }
    setCreateSaving(true);
    try {
      const pallet = await createEmptyPallet({
        pallet_type_name: newPalletType,
        capacity_boxes: newCapacity,
        packhouse_id: newPackhouseId,
        size: newSize || undefined,
        box_size_id: newBoxSizeId || undefined,
        notes: newNotes || undefined,
      });
      globalToast("success", `Pallet ${pallet.pallet_number} created.`);
      setShowCreateForm(false);
      setNewPalletType(""); setNewCapacity(240); setNewBoxSizeId(""); setNewSize(""); setNewNotes("");
      fetchPallets();
    } catch {
      globalToast("error", "Failed to create pallet.");
    } finally {
      setCreateSaving(false);
    }
  };

  const fetchPallets = () => {
    setLoading(true);
    const params: Record<string, string> = {};
    if (statusFilter) params.status = statusFilter;
    listPallets(params)
      .then(setPallets)
      .catch(() => setError("Failed to load pallets"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchPallets();
  }, [statusFilter]);

  const filtered = pallets.filter((p) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      p.pallet_number.toLowerCase().includes(q) ||
      (p.fruit_type && p.fruit_type.toLowerCase().includes(q)) ||
      (p.grade && p.grade.toLowerCase().includes(q)) ||
      (p.size && p.size.toLowerCase().includes(q)) ||
      (p.box_size_name && p.box_size_name.toLowerCase().includes(q))
    );
  });

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const assignableSelected = filtered.filter(
    (p) => selectedIds.has(p.id) && !["loaded", "exported"].includes(p.status)
  );

  const handleCreateContainer = async () => {
    if (assignableSelected.length === 0) {
      globalToast("error", "Select at least one pallet to assign.");
      return;
    }
    if (!containerType) {
      globalToast("error", "Select a container type.");
      return;
    }
    setContainerSaving(true);
    try {
      const result = await createContainerFromPallets({
        container_type: containerType,
        capacity_pallets: capacityPallets,
        pallet_ids: assignableSelected.map((p) => p.id),
        client_id: clientId || undefined,
        shipping_container_number: shippingContainerNumber || undefined,
        destination: destination || undefined,
        seal_number: sealNumber || undefined,
      });
      globalToast("success", `Container ${result.container_number} created with ${assignableSelected.length} pallet(s).`);
      setShowContainerForm(false);
      setSelectedIds(new Set());
      setClientId("");
      setShippingContainerNumber("");
      setDestination("");
      setSealNumber("");
      fetchPallets();
    } catch {
      globalToast("error", "Failed to create container.");
    } finally {
      setContainerSaving(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Pallets</h1>
          <p className="text-sm text-gray-500 mt-1">
            {filtered.length} pallet{filtered.length !== 1 ? "s" : ""}
            {selectedIds.size > 0 && ` \u00b7 ${selectedIds.size} selected`}
          </p>
        </div>
        <div className="flex gap-2">
          {selectedIds.size > 0 && !showContainerForm && (
            <button
              onClick={() => {
                setShowContainerForm(true);
                listClients().then(setClients).catch(() => {});
              }}
              className="bg-green-600 text-white px-4 py-2 rounded text-sm font-medium hover:bg-green-700"
            >
              Assign to Container ({selectedIds.size})
            </button>
          )}
          <button
            onClick={() => {
              setShowCreateForm(true);
              getPalletTypes().then(setPalletTypes).catch(() => {});
              getBoxSizes().then(setBoxSizes).catch(() => {});
              // Load lot sizes and box types from available lots
              Promise.all([
                listLots({ status: "created" }),
                listLots({ status: "palletizing" }),
              ]).then(([created, palletizing]) => {
                const allLots = [...created, ...palletizing];
                const available = allLots.filter((l) => l.carton_count - (l.palletized_boxes ?? 0) > 0);
                const sizes = [...new Set(available.map((l) => l.size).filter(Boolean) as string[])];
                setAvailableLotSizes(sizes);
                const boxIds = [...new Set(available.map((l) => l.box_size_id).filter(Boolean) as string[])];
                setAvailableBoxTypeIds(boxIds);
              }).catch(() => {});
              listPackhouses().then((phs) => {
                setPackhouses(phs);
                if (phs.length === 1) setNewPackhouseId(phs[0].id);
              }).catch(() => {});
            }}
            className="bg-green-600 text-white px-4 py-2 rounded text-sm font-medium hover:bg-green-700"
          >
            + Create Pallet
          </button>
          <Link
            to="/containers"
            className="border text-gray-600 px-4 py-2 rounded text-sm font-medium hover:bg-gray-50"
          >
            View Containers
          </Link>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 text-red-700 rounded text-sm">{error}</div>
      )}

      {/* Create empty pallet form */}
      {showCreateForm && (
        <div className="mb-6 bg-white rounded-lg border p-4 space-y-4">
          <h3 className="text-sm font-semibold text-gray-700">Create Empty Pallet</h3>
          <p className="text-xs text-gray-500">
            Create a pallet shell — allocate boxes from lots afterwards.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Pallet Type *</label>
              <select
                value={newPalletType}
                onChange={async (e) => {
                  const name = e.target.value;
                  setNewPalletType(name);
                  const pt = palletTypes.find((t) => t.name === name);
                  if (pt) {
                    setNewCapacity(pt.capacity_boxes);
                    if (newBoxSizeId) {
                      try {
                        const caps = await getPalletTypeCapacities(pt.id);
                        const match = caps.box_capacities.find((bc) => bc.box_size_id === newBoxSizeId);
                        if (match) setNewCapacity(match.capacity);
                      } catch {}
                    }
                  }
                }}
                className="w-full border rounded px-2 py-1.5 text-sm"
              >
                <option value="">Select type</option>
                {palletTypes.map((pt) => (
                  <option key={pt.id} value={pt.name}>{pt.name} ({pt.capacity_boxes})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Box Type</label>
              <select
                value={newBoxSizeId}
                onChange={async (e) => {
                  const boxId = e.target.value;
                  setNewBoxSizeId(boxId);
                  if (newPalletType && boxId) {
                    const pt = palletTypes.find((t) => t.name === newPalletType);
                    if (pt) {
                      try {
                        const caps = await getPalletTypeCapacities(pt.id);
                        const match = caps.box_capacities.find((bc) => bc.box_size_id === boxId);
                        if (match) setNewCapacity(match.capacity);
                      } catch {}
                    }
                  }
                }}
                className="w-full border rounded px-2 py-1.5 text-sm"
              >
                <option value="">Select box type</option>
                {availableBoxTypeIds
                  .map((id) => boxSizes.find((bs) => bs.id === id))
                  .filter((bs): bs is BoxSizeConfig => !!bs)
                  .map((bs) => (
                    <option key={bs.id} value={bs.id}>{bs.name} ({bs.weight_kg} kg)</option>
                  ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Size</label>
              <select
                value={newSize}
                onChange={(e) => setNewSize(e.target.value)}
                className="w-full border rounded px-2 py-1.5 text-sm"
              >
                <option value="">Select size</option>
                {availableLotSizes.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Capacity (boxes)</label>
              <input
                type="number"
                value={newCapacity || ""}
                onChange={(e) => setNewCapacity(Number(e.target.value))}
                min={1}
                className="w-full border rounded px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Packhouse *</label>
              <select
                value={newPackhouseId}
                onChange={(e) => setNewPackhouseId(e.target.value)}
                className="w-full border rounded px-2 py-1.5 text-sm"
              >
                <option value="">Select packhouse</option>
                {packhouses.map((ph) => (
                  <option key={ph.id} value={ph.id}>{ph.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Notes</label>
              <input
                value={newNotes}
                onChange={(e) => setNewNotes(e.target.value)}
                placeholder="Optional"
                className="w-full border rounded px-2 py-1.5 text-sm"
              />
            </div>
          </div>
          <div className="flex gap-2 pt-2 border-t">
            <button
              onClick={handleCreatePallet}
              disabled={createSaving}
              className="bg-green-600 text-white px-3 py-1.5 rounded text-sm font-medium hover:bg-green-700 disabled:opacity-50"
            >
              {createSaving ? "Creating..." : "Create Pallet"}
            </button>
            <button
              onClick={() => { setShowCreateForm(false); setNewPalletType(""); setNewCapacity(240); setNewBoxSizeId(""); setNewSize(""); setNewNotes(""); }}
              className="border text-gray-600 px-3 py-1.5 rounded text-sm hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Allocate boxes form */}
      {allocatingPalletId && (() => {
        const pallet = pallets.find((p) => p.id === allocatingPalletId);
        if (!pallet) return null;
        const remaining = pallet.capacity_boxes - pallet.current_boxes;
        const totalAssigning = Object.values(allocateAssignments).reduce((a, b) => a + b, 0);
        return (
          <div className="mb-6 bg-white rounded-lg border p-4 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-700">
                Allocate Boxes to {pallet.pallet_number}
              </h3>
              <span className="text-xs text-gray-500">
                {pallet.current_boxes} / {pallet.capacity_boxes} boxes ({remaining} remaining)
              </span>
            </div>

            {allocateLoading ? (
              <p className="text-gray-400 text-sm">Loading available lots...</p>
            ) : allocateLots.length === 0 ? (
              <p className="text-gray-400 text-sm">No lots with unallocated boxes found.</p>
            ) : (
              <>
                {pallet.size && (
                  <p className="text-xs text-blue-600 mb-1">
                    Pallet size: <span className="font-medium">{pallet.size}</span> — showing matching lots only.
                  </p>
                )}
                {pallet.box_size_name && (
                  <p className="text-xs text-blue-600 mb-1">
                    Box type: <span className="font-medium">{pallet.box_size_name}</span> — showing matching lots only.
                  </p>
                )}
                <div className="border rounded overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-100 text-gray-600 text-xs">
                      <tr>
                        <th className="text-left px-2 py-1.5 font-medium">Lot Code</th>
                        <th className="text-left px-2 py-1.5 font-medium">Grade</th>
                        <th className="text-left px-2 py-1.5 font-medium">Size</th>
                        <th className="text-left px-2 py-1.5 font-medium">Box Type</th>
                        <th className="text-right px-2 py-1.5 font-medium">Available</th>
                        <th className="text-right px-2 py-1.5 font-medium">Assign</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {allocateLots
                        .filter((lot) => !pallet.size || lot.size === pallet.size)
                        .filter((lot) => !pallet.box_size_id || !lot.box_size_id || lot.box_size_id === pallet.box_size_id)
                        .map((lot) => {
                        const available = lot.carton_count - (lot.palletized_boxes ?? 0);
                        const assigned = allocateAssignments[lot.id] ?? 0;
                        return (
                          <tr key={lot.id}>
                            <td className="px-2 py-1.5 font-mono text-xs text-green-700">{lot.lot_code}</td>
                            <td className="px-2 py-1.5">{lot.grade || "—"}</td>
                            <td className="px-2 py-1.5">{lot.size || "—"}</td>
                            <td className="px-2 py-1.5 text-xs text-gray-600">{boxSizes.find((bs) => bs.id === lot.box_size_id)?.name || "\u2014"}</td>
                            <td className="px-2 py-1.5 text-right text-gray-500">{available}</td>
                            <td className="px-2 py-1.5 text-right">
                              <input
                                type="number"
                                value={assigned || ""}
                                onChange={(e) => setAllocateAssignments({
                                  ...allocateAssignments,
                                  [lot.id]: Math.max(0, Math.min(available, Number(e.target.value))),
                                })}
                                min={0}
                                max={available}
                                className="w-20 border rounded px-2 py-1 text-sm text-right"
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <p className="text-xs text-gray-500">
                  Assigning: <span className="font-medium">{totalAssigning}</span> boxes
                  {totalAssigning > remaining && (
                    <span className="text-red-600 ml-2">
                      Exceeds remaining capacity ({remaining})
                    </span>
                  )}
                </p>
              </>
            )}

            <div className="flex gap-2 pt-2 border-t">
              <button
                onClick={async () => {
                  const assignments: LotAssignment[] = Object.entries(allocateAssignments)
                    .filter(([, count]) => count > 0)
                    .map(([lot_id, box_count]) => {
                      const lot = allocateLots.find((l) => l.id === lot_id);
                      return { lot_id, box_count, size: lot?.size || undefined };
                    });
                  if (assignments.length === 0) {
                    globalToast("error", "Assign boxes from at least one lot.");
                    return;
                  }
                  if (totalAssigning > remaining) {
                    globalToast("error", "Total exceeds remaining pallet capacity.");
                    return;
                  }
                  setAllocateSaving(true);
                  try {
                    await allocateBoxesToPallet(allocatingPalletId, { lot_assignments: assignments });
                    globalToast("success", `${totalAssigning} box(es) allocated to ${pallet.pallet_number}.`);
                    setAllocatingPalletId(null);
                    setAllocateAssignments({});
                    setAllocateLots([]);
                    fetchPallets();
                  } catch {
                    globalToast("error", "Failed to allocate boxes.");
                  } finally {
                    setAllocateSaving(false);
                  }
                }}
                disabled={allocateSaving || totalAssigning === 0 || totalAssigning > remaining}
                className="bg-green-600 text-white px-3 py-1.5 rounded text-sm font-medium hover:bg-green-700 disabled:opacity-50"
              >
                {allocateSaving ? "Allocating..." : "Allocate Boxes"}
              </button>
              <button
                onClick={() => { setAllocatingPalletId(null); setAllocateAssignments({}); setAllocateLots([]); }}
                className="border text-gray-600 px-3 py-1.5 rounded text-sm hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>
          </div>
        );
      })()}

      {/* Container creation form */}
      {showContainerForm && (
        <div className="mb-6 bg-white rounded-lg border p-4 space-y-4">
          <h3 className="text-sm font-semibold text-gray-700">Create Container</h3>
          <p className="text-xs text-gray-500">
            Assigning {assignableSelected.length} pallet(s) with{" "}
            {assignableSelected.reduce((a, p) => a + p.current_boxes, 0)} total boxes.
          </p>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Container Type *</label>
              <select
                value={containerType}
                onChange={(e) => setContainerType(e.target.value)}
                className="w-full border rounded px-2 py-1.5 text-sm"
              >
                {CONTAINER_TYPES.map((t) => (
                  <option key={t} value={t}>{t.replace(/_/g, " ")}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Capacity (pallets)</label>
              <input
                type="number"
                value={capacityPallets || ""}
                onChange={(e) => setCapacityPallets(Number(e.target.value))}
                min={1}
                className="w-full border rounded px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Client</label>
              <select
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                className="w-full border rounded px-2 py-1.5 text-sm"
              >
                <option value="">Select client</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Shipping Container #</label>
              <input
                value={shippingContainerNumber}
                onChange={(e) => setShippingContainerNumber(e.target.value)}
                placeholder="e.g. MSKU1234567"
                className="w-full border rounded px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Destination</label>
              <input
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                placeholder="e.g. Rotterdam, NL"
                className="w-full border rounded px-2 py-1.5 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Seal Number</label>
              <input
                value={sealNumber}
                onChange={(e) => setSealNumber(e.target.value)}
                placeholder="Optional"
                className="w-full border rounded px-2 py-1.5 text-sm"
              />
            </div>
          </div>
          <div className="flex gap-2 pt-2 border-t">
            <button
              onClick={handleCreateContainer}
              disabled={containerSaving}
              className="bg-green-600 text-white px-3 py-1.5 rounded text-sm font-medium hover:bg-green-700 disabled:opacity-50"
            >
              {containerSaving ? "Creating..." : "Create Container"}
            </button>
            <button
              onClick={() => setShowContainerForm(false)}
              className="border text-gray-600 px-3 py-1.5 rounded text-sm hover:bg-gray-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="border rounded px-3 py-2 text-sm"
        >
          <option value="">All statuses</option>
          {["open", "closed", "stored", "allocated", "loaded", "exported"].map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>

        <input
          type="text"
          placeholder="Search number, fruit, grade..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border rounded px-3 py-2 text-sm w-56 focus:outline-none focus:ring-2 focus:ring-green-500"
        />

        {selectedIds.size > 0 && (
          <button
            onClick={() => setSelectedIds(new Set())}
            className="text-xs text-gray-500 hover:text-gray-700 underline"
          >
            Clear selection
          </button>
        )}
      </div>

      {loading ? (
        <p className="text-gray-400 text-sm">Loading pallets...</p>
      ) : filtered.length === 0 ? (
        <p className="text-gray-400 text-sm">No pallets found.</p>
      ) : (
        <div className="bg-white rounded-lg border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600">
              <tr>
                <th className="w-10 px-2 py-2">
                  <input
                    type="checkbox"
                    checked={filtered.every((p) => selectedIds.has(p.id))}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedIds(new Set(filtered.map((p) => p.id)));
                      } else {
                        setSelectedIds(new Set());
                      }
                    }}
                    className="rounded"
                  />
                </th>
                <th className="text-left px-4 py-2 font-medium">Pallet #</th>
                <th className="text-left px-4 py-2 font-medium">Type</th>
                <th className="text-left px-4 py-2 font-medium">Fruit</th>
                <th className="text-left px-4 py-2 font-medium">Grade</th>
                <th className="text-left px-4 py-2 font-medium">Size</th>
                <th className="text-left px-4 py-2 font-medium">Box Type</th>
                <th className="text-right px-4 py-2 font-medium">Boxes</th>
                <th className="text-left px-4 py-2 font-medium">Notes</th>
                <th className="text-left px-4 py-2 font-medium">Status</th>
                <th className="text-left px-4 py-2 font-medium">Date</th>
                <th className="px-4 py-2 font-medium" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {filtered.map((p) => {
                const isLoaded = ["loaded", "exported"].includes(p.status);
                return (
                  <tr
                    key={p.id}
                    className={`hover:bg-gray-50 ${selectedIds.has(p.id) ? "bg-green-50" : ""}`}
                  >
                    <td className="px-2 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(p.id)}
                        disabled={isLoaded}
                        onChange={() => toggleSelect(p.id)}
                        className="rounded"
                        onClick={(e) => e.stopPropagation()}
                      />
                    </td>
                    <td
                      className="px-4 py-2 font-mono text-xs text-green-700 cursor-pointer"
                      onClick={() => navigate(`/pallets/${p.id}`)}
                    >
                      {p.pallet_number}
                    </td>
                    <td className="px-4 py-2">{p.pallet_type_name || "\u2014"}</td>
                    <td className="px-4 py-2">{p.fruit_type || "\u2014"}</td>
                    <td className="px-4 py-2">{p.grade || "\u2014"}</td>
                    <td className="px-4 py-2">{p.size || "\u2014"}</td>
                    <td className="px-4 py-2 text-xs text-gray-600">{p.box_size_name || "\u2014"}</td>
                    <td className="px-4 py-2 text-right font-medium">{p.current_boxes}</td>
                    <td className="px-4 py-2 text-xs text-gray-500 max-w-[12rem] truncate" title={p.notes || ""}>
                      {p.notes || "\u2014"}
                    </td>
                    <td className="px-4 py-2">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                        STATUS_COLORS[p.status] || "bg-gray-100 text-gray-600"
                      }`}>
                        {p.status}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-gray-500">
                      {new Date(p.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-2 text-right">
                      {p.status === "open" && p.current_boxes < p.capacity_boxes && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setAllocatingPalletId(p.id);
                            setAllocateAssignments({});
                            setAllocateLoading(true);
                            getBoxSizes().then(setBoxSizes).catch(() => {});
                            // Fetch lots with unallocated boxes (created + palletizing)
                            Promise.all([
                              listLots({ status: "created" }),
                              listLots({ status: "palletizing" }),
                            ])
                              .then(([created, palletizing]) => {
                                const all = [...created, ...palletizing];
                                const available = all.filter(
                                  (l) => l.carton_count - (l.palletized_boxes ?? 0) > 0
                                );
                                setAllocateLots(available);
                              })
                              .catch(() => setAllocateLots([]))
                              .finally(() => setAllocateLoading(false));
                          }}
                          className="text-xs bg-green-50 text-green-700 border border-green-200 px-2.5 py-0.5 rounded font-medium hover:bg-green-100"
                        >
                          + Allocate
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
