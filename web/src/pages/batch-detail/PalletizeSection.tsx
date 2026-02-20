import React, { useState } from "react";
import { Link } from "react-router-dom";
import { getErrorMessage } from "../../api/client";
import {
  getPalletTypes,
  getPalletTypeCapacities,
  createPalletsFromLots,
  listPallets,
  allocateBoxesToPallet,
  BoxSizeConfig,
  PalletTypeConfig,
  PalletTypeCapacity,
  PalletSummary,
  LotAssignment,
} from "../../api/pallets";
import { showToast as globalToast } from "../../store/toastStore";
import { BatchSectionProps } from "./types";

interface Props extends BatchSectionProps {
  boxSizes: BoxSizeConfig[];
}

export default function PalletizeSection({ batch, batchId, onRefresh, boxSizes }: Props) {
  const lots = batch.lots || [];
  if (lots.length === 0) return null;

  // Pallet creation state
  const [creatingPallet, setCreatingPallet] = useState(false);
  const [palletTypes, setPalletTypes] = useState<PalletTypeConfig[]>([]);
  const [selectedPalletType, setSelectedPalletType] = useState("");
  const [palletCapacity, setPalletCapacity] = useState(240);
  const [palletBoxCapacities, setPalletBoxCapacities] = useState<PalletTypeCapacity | null>(null);
  const [lotAssignments, setLotAssignments] = useState<Record<string, number>>({});
  const [palletSaving, setPalletSaving] = useState(false);

  // Size & box type selection
  const [palletSize, setPalletSize] = useState("");
  const [palletBoxSizeId, setPalletBoxSizeId] = useState("");
  const [allowMixedSizes, setAllowMixedSizes] = useState(false);
  const [allowMixedBoxTypes, setAllowMixedBoxTypes] = useState(false);

  // Allocate to existing pallet
  const [allocatingToExisting, setAllocatingToExisting] = useState(false);
  const [openPallets, setOpenPallets] = useState<PalletSummary[]>([]);
  const [selectedPalletId, setSelectedPalletId] = useState("");
  const [allocateSaving, setAllocateSaving] = useState(false);

  return (
    <div className="bg-white rounded-lg border p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-700">Palletize</h3>
        {!creatingPallet && !allocatingToExisting && (
          <div className="flex gap-3">
            <button
              onClick={() => {
                setCreatingPallet(true);
                getPalletTypes().then(setPalletTypes).catch(() => {});
                const init: Record<string, number> = {};
                lots.forEach((l) => { init[l.id] = l.carton_count - (l.palletized_boxes ?? 0); });
                setLotAssignments(init);
              }}
              className="text-sm text-green-600 hover:text-green-700 font-medium"
            >
              + Create Pallet
            </button>
            <button
              onClick={() => {
                setAllocatingToExisting(true);
                listPallets({ status: "open" }).then(setOpenPallets).catch(() => {});
                const init: Record<string, number> = {};
                lots.forEach((l) => { init[l.id] = l.carton_count - (l.palletized_boxes ?? 0); });
                setLotAssignments(init);
              }}
              className="text-sm text-blue-600 hover:text-blue-700 font-medium"
            >
              + Add to Existing
            </button>
          </div>
        )}
      </div>

      {creatingPallet && (
        <CreatePalletForm
          batch={batch}
          batchId={batchId}
          boxSizes={boxSizes}
          palletTypes={palletTypes}
          selectedPalletType={selectedPalletType}
          setSelectedPalletType={setSelectedPalletType}
          palletCapacity={palletCapacity}
          setPalletCapacity={setPalletCapacity}
          palletBoxCapacities={palletBoxCapacities}
          setPalletBoxCapacities={setPalletBoxCapacities}
          palletSize={palletSize}
          setPalletSize={setPalletSize}
          palletBoxSizeId={palletBoxSizeId}
          setPalletBoxSizeId={setPalletBoxSizeId}
          lotAssignments={lotAssignments}
          setLotAssignments={setLotAssignments}
          allowMixedSizes={allowMixedSizes}
          setAllowMixedSizes={setAllowMixedSizes}
          allowMixedBoxTypes={allowMixedBoxTypes}
          setAllowMixedBoxTypes={setAllowMixedBoxTypes}
          palletSaving={palletSaving}
          onSave={async () => {
            if (!selectedPalletType) {
              globalToast("error", "Select a pallet type.");
              return;
            }
            if (!palletSize && !allowMixedSizes) {
              globalToast("error", "Select a pallet size.");
              return;
            }
            const visibleLotIds = new Set(
              lots
                .filter((l) => (!palletSize || l.size === palletSize) && (!palletBoxSizeId || l.box_size_id === palletBoxSizeId))
                .map((l) => l.id)
            );
            const assignments: LotAssignment[] = Object.entries(lotAssignments)
              .filter(([lot_id, count]) => count > 0 && visibleLotIds.has(lot_id))
              .map(([lot_id, box_count]) => {
                const lot = lots.find((l) => l.id === lot_id);
                return { lot_id, box_count, size: lot?.size || undefined };
              });
            if (assignments.length === 0) {
              globalToast("error", "Assign boxes from at least one lot.");
              return;
            }
            setPalletSaving(true);
            try {
              const pallets = await createPalletsFromLots({
                pallet_type_name: selectedPalletType,
                capacity_boxes: palletCapacity,
                lot_assignments: assignments,
                packhouse_id: batch.packhouse_id,
                size: palletSize || undefined,
                allow_mixed_sizes: allowMixedSizes,
                allow_mixed_box_types: allowMixedBoxTypes,
              });
              globalToast("success", `${pallets.length} pallet(s) created.`);
              setCreatingPallet(false);
              setSelectedPalletType("");
              setPalletSize("");
              setAllowMixedSizes(false);
              setAllowMixedBoxTypes(false);
              setLotAssignments({});
              await onRefresh();
            } catch (err: unknown) {
              globalToast("error", getErrorMessage(err, "Failed to create pallet."));
            } finally {
              setPalletSaving(false);
            }
          }}
          onCancel={() => {
            setCreatingPallet(false);
            setSelectedPalletType("");
            setPalletSize("");
            setPalletBoxSizeId("");
            setAllowMixedSizes(false);
            setLotAssignments({});
          }}
        />
      )}

      {allocatingToExisting && (
        <AllocateToExistingForm
          batch={batch}
          boxSizes={boxSizes}
          openPallets={openPallets}
          selectedPalletId={selectedPalletId}
          setSelectedPalletId={setSelectedPalletId}
          lotAssignments={lotAssignments}
          setLotAssignments={setLotAssignments}
          allocateSaving={allocateSaving}
          onSave={async () => {
            if (!selectedPalletId) {
              globalToast("error", "Select a pallet.");
              return;
            }
            const selPal = openPallets.find((p) => p.id === selectedPalletId);
            const assignments: LotAssignment[] = Object.entries(lotAssignments)
              .filter(([lot_id, count]) => {
                if (count <= 0) return false;
                const lot = lots.find((l) => l.id === lot_id);
                if (selPal?.size && lot && lot.size && lot.size !== selPal.size) return false;
                if (selPal?.box_size_id && lot && lot.box_size_id && lot.box_size_id !== selPal.box_size_id) return false;
                return true;
              })
              .map(([lot_id, box_count]) => {
                const lot = lots.find((l) => l.id === lot_id);
                return { lot_id, box_count, size: lot?.size || undefined };
              });
            if (assignments.length === 0) {
              globalToast("error", "Assign boxes from at least one lot.");
              return;
            }
            setAllocateSaving(true);
            try {
              const selectedPallet = openPallets.find((p) => p.id === selectedPalletId);
              await allocateBoxesToPallet(selectedPalletId, { lot_assignments: assignments });
              globalToast("success", `Boxes allocated to ${selectedPallet?.pallet_number || "pallet"}.`);
              setAllocatingToExisting(false);
              setSelectedPalletId("");
              setLotAssignments({});
              await onRefresh();
            } catch (err: unknown) {
              globalToast("error", getErrorMessage(err, "Failed to allocate boxes."));
            } finally {
              setAllocateSaving(false);
            }
          }}
          onCancel={() => {
            setAllocatingToExisting(false);
            setSelectedPalletId("");
            setLotAssignments({});
          }}
        />
      )}
    </div>
  );
}


// ── Create Pallet Form ──────────────────────────────────────

interface CreatePalletFormProps {
  batch: BatchSectionProps["batch"];
  batchId: string;
  boxSizes: BoxSizeConfig[];
  palletTypes: PalletTypeConfig[];
  selectedPalletType: string;
  setSelectedPalletType: (v: string) => void;
  palletCapacity: number;
  setPalletCapacity: (v: number) => void;
  palletBoxCapacities: PalletTypeCapacity | null;
  setPalletBoxCapacities: (v: PalletTypeCapacity | null) => void;
  palletSize: string;
  setPalletSize: (v: string) => void;
  palletBoxSizeId: string;
  setPalletBoxSizeId: (v: string) => void;
  lotAssignments: Record<string, number>;
  setLotAssignments: (v: Record<string, number>) => void;
  allowMixedSizes: boolean;
  setAllowMixedSizes: (v: boolean) => void;
  allowMixedBoxTypes: boolean;
  setAllowMixedBoxTypes: (v: boolean) => void;
  palletSaving: boolean;
  onSave: () => void;
  onCancel: () => void;
}

function CreatePalletForm({
  batch, boxSizes, palletTypes,
  selectedPalletType, setSelectedPalletType,
  palletCapacity, setPalletCapacity,
  palletBoxCapacities, setPalletBoxCapacities,
  palletSize, setPalletSize,
  palletBoxSizeId, setPalletBoxSizeId,
  lotAssignments, setLotAssignments,
  allowMixedSizes, setAllowMixedSizes,
  allowMixedBoxTypes, setAllowMixedBoxTypes,
  palletSaving, onSave, onCancel,
}: CreatePalletFormProps) {
  const lots = batch.lots || [];
  const availLots = lots.filter((l) => l.carton_count - (l.palletized_boxes ?? 0) > 0);
  const lotSizes = [...new Set(availLots.map((l) => l.size).filter(Boolean))] as string[];
  const lotBoxTypes = [...new Set(availLots.map((l) => l.box_size_id).filter(Boolean))] as string[];
  const boxTypeOptions = lotBoxTypes
    .map((id) => boxSizes.find((bs) => bs.id === id))
    .filter((bs): bs is BoxSizeConfig => !!bs);

  // Filtered lots for assignment table
  const filteredLots = lots.filter(
    (l) => (!palletSize || l.size === palletSize) && (!palletBoxSizeId || l.box_size_id === palletBoxSizeId)
  );

  // Summary calculations
  const totalAssigned = filteredLots.reduce((sum, l) => sum + (lotAssignments[l.id] ?? 0), 0);
  const sizes = new Set(
    filteredLots.filter((l) => (lotAssignments[l.id] ?? 0) > 0).map((l) => l.size).filter(Boolean)
  );
  const mixedSizes = sizes.size > 1;
  const boxTypeIds = new Set(
    filteredLots.filter((l) => (lotAssignments[l.id] ?? 0) > 0).map((l) => l.box_size_id).filter(Boolean)
  );
  const mixedBoxTypes = boxTypeIds.size > 1;
  const boxTypeNames = [...boxTypeIds].map((id) => boxSizes.find((b) => b.id === id)?.name || id);

  return (
    <div className="p-4 bg-gray-50 rounded-lg border space-y-4">
      {/* Pallet type selection */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Pallet Type *</label>
          {palletTypes.length > 0 ? (
            <select
              value={selectedPalletType}
              onChange={async (e) => {
                const name = e.target.value;
                setSelectedPalletType(name);
                const pt = palletTypes.find((t) => t.name === name);
                if (pt) {
                  setPalletCapacity(pt.capacity_boxes);
                  try {
                    const caps = await getPalletTypeCapacities(pt.id);
                    setPalletBoxCapacities(caps);
                    if (caps.box_capacities.length > 0 && batch?.lots) {
                      const assignedLots = batch.lots.filter((l) => (lotAssignments[l.id] ?? 0) > 0);
                      const lotBoxIds = [...new Set(assignedLots.map((l) => l.box_size_id).filter(Boolean))];
                      if (lotBoxIds.length === 1) {
                        const match = caps.box_capacities.find((bc) => bc.box_size_id === lotBoxIds[0]);
                        if (match) setPalletCapacity(match.capacity);
                      }
                    }
                  } catch {
                    setPalletBoxCapacities(null);
                  }
                } else {
                  setPalletBoxCapacities(null);
                }
              }}
              className="w-full border rounded px-2 py-1.5 text-sm"
            >
              <option value="">Select pallet type</option>
              {palletTypes.map((pt) => (
                <option key={pt.id} value={pt.name}>
                  {pt.name} ({pt.capacity_boxes} boxes)
                </option>
              ))}
            </select>
          ) : (
            <input
              value={selectedPalletType}
              onChange={(e) => setSelectedPalletType(e.target.value)}
              placeholder="e.g. Standard 240"
              className="w-full border rounded px-2 py-1.5 text-sm"
            />
          )}
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Capacity (boxes)</label>
          <input
            type="number"
            value={palletCapacity || ""}
            onChange={(e) => setPalletCapacity(Number(e.target.value))}
            min={1}
            className="w-full border rounded px-2 py-1.5 text-sm"
          />
          {palletBoxCapacities && palletBoxCapacities.box_capacities.length > 0 && (
            <p className="text-xs text-blue-600 mt-1">
              Per-box capacities: {palletBoxCapacities.box_capacities.map(
                (bc) => `${bc.box_size_name}: ${bc.capacity}`
              ).join(", ")}
            </p>
          )}
        </div>
      </div>

      {/* Size & box type selection */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Pallet Size *</label>
          {lotSizes.length > 0 ? (
            <select
              value={palletSize}
              onChange={(e) => setPalletSize(e.target.value)}
              className="w-full border rounded px-2 py-1.5 text-sm"
            >
              <option value="">Select size</option>
              {lotSizes.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          ) : (
            <p className="text-xs text-yellow-600">No lot sizes found — set sizes on lots first.</p>
          )}
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Box Type</label>
          {boxTypeOptions.length > 0 ? (
            <select
              value={palletBoxSizeId}
              onChange={async (e) => {
                const boxId = e.target.value;
                setPalletBoxSizeId(boxId);
                if (selectedPalletType && boxId) {
                  const pt = palletTypes.find((t) => t.name === selectedPalletType);
                  if (pt) {
                    try {
                      const caps = await getPalletTypeCapacities(pt.id);
                      const match = caps.box_capacities.find((bc) => bc.box_size_id === boxId);
                      if (match) setPalletCapacity(match.capacity);
                    } catch {}
                  }
                }
              }}
              className="w-full border rounded px-2 py-1.5 text-sm"
            >
              <option value="">Select box type</option>
              {boxTypeOptions.map((bs) => (
                <option key={bs.id} value={bs.id}>{bs.name} ({bs.weight_kg} kg)</option>
              ))}
            </select>
          ) : (
            <p className="text-xs text-yellow-600">No lot box types found — set box types on lots first.</p>
          )}
        </div>
        <p className="col-span-2 text-xs text-gray-400">
          Only lots matching the selected size and box type will be shown below.
        </p>
      </div>

      {/* Lot assignment table */}
      <div>
        <label className="block text-xs text-gray-500 mb-1">Assign boxes from lots</label>
        <div className="border rounded overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-100 text-gray-600 text-xs">
              <tr>
                <th className="text-left px-2 py-1.5 font-medium">Lot</th>
                <th className="text-left px-2 py-1.5 font-medium">Grade</th>
                <th className="text-left px-2 py-1.5 font-medium">Size</th>
                <th className="text-right px-2 py-1.5 font-medium">Available</th>
                <th className="text-right px-2 py-1.5 font-medium">Assign</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {filteredLots.map((lot) => {
                const assigned = lotAssignments[lot.id] ?? 0;
                const available = lot.carton_count - (lot.palletized_boxes ?? 0);
                return (
                  <tr key={lot.id}>
                    <td className="px-2 py-1.5 font-mono text-xs text-green-700">{lot.lot_code}</td>
                    <td className="px-2 py-1.5">{lot.grade || "—"}</td>
                    <td className="px-2 py-1.5">{lot.size || "—"}</td>
                    <td className="px-2 py-1.5 text-right text-gray-500">{available}</td>
                    <td className="px-2 py-1.5 text-right">
                      <input
                        type="number"
                        value={assigned || ""}
                        onChange={(e) => {
                          const newAssignments = {
                            ...lotAssignments,
                            [lot.id]: Math.max(0, Math.min(available, Number(e.target.value))),
                          };
                          setLotAssignments(newAssignments);
                          if (palletBoxCapacities && palletBoxCapacities.box_capacities.length > 0 && batch) {
                            const assignedLots = batch.lots.filter((l) => (newAssignments[l.id] ?? 0) > 0);
                            const bIds = [...new Set(assignedLots.map((l) => l.box_size_id).filter(Boolean))];
                            if (bIds.length === 1) {
                              const match = palletBoxCapacities.box_capacities.find((bc) => bc.box_size_id === bIds[0]);
                              if (match) setPalletCapacity(match.capacity);
                            }
                          }
                        }}
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
        {(palletSize || palletBoxSizeId) && filteredLots.length === 0 && (
          <p className="text-xs text-yellow-600 mt-1">No lots match the selected size/box type filter.</p>
        )}
        <div className="mt-2 space-y-1">
          <p className="text-xs text-gray-500">
            Total: <span className="font-medium">{totalAssigned}</span> boxes
            {palletCapacity > 0 && ` / ${palletCapacity} capacity`}
            {totalAssigned > palletCapacity && (
              <span className="text-yellow-600 ml-2">
                (overflow: {Math.ceil(totalAssigned / palletCapacity)} pallets will be created)
              </span>
            )}
          </p>
          {mixedSizes && (
            <label className="flex items-center gap-2 text-xs text-yellow-600 font-medium">
              <input
                type="checkbox"
                checked={allowMixedSizes}
                onChange={(e) => setAllowMixedSizes(e.target.checked)}
                className="rounded"
              />
              Allow mixed sizes on pallet ({[...sizes].join(", ")})
            </label>
          )}
          {mixedBoxTypes && (
            <label className="flex items-center gap-2 text-xs text-yellow-600 font-medium">
              <input
                type="checkbox"
                checked={allowMixedBoxTypes}
                onChange={(e) => setAllowMixedBoxTypes(e.target.checked)}
                className="rounded"
              />
              Allow mixed box types on pallet ({boxTypeNames.join(", ")})
            </label>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex gap-2 pt-2 border-t">
        <button
          onClick={onSave}
          disabled={palletSaving}
          className="bg-green-600 text-white px-3 py-1.5 rounded text-sm font-medium hover:bg-green-700 disabled:opacity-50"
        >
          {palletSaving ? "Creating..." : "Create Pallet"}
        </button>
        <button
          onClick={onCancel}
          className="border text-gray-600 px-3 py-1.5 rounded text-sm hover:bg-gray-50"
        >
          Cancel
        </button>
        <Link to="/pallets" className="ml-auto text-xs text-gray-500 hover:text-gray-700 self-center">
          View all pallets &rarr;
        </Link>
      </div>
    </div>
  );
}


// ── Allocate to Existing Pallet Form ────────────────────────

interface AllocateFormProps {
  batch: BatchSectionProps["batch"];
  boxSizes: BoxSizeConfig[];
  openPallets: PalletSummary[];
  selectedPalletId: string;
  setSelectedPalletId: (v: string) => void;
  lotAssignments: Record<string, number>;
  setLotAssignments: (v: Record<string, number>) => void;
  allocateSaving: boolean;
  onSave: () => void;
  onCancel: () => void;
}

function AllocateToExistingForm({
  batch, openPallets,
  selectedPalletId, setSelectedPalletId,
  lotAssignments, setLotAssignments,
  allocateSaving, onSave, onCancel,
}: AllocateFormProps) {
  const lots = batch.lots || [];
  const selectedPallet = openPallets.find((p) => p.id === selectedPalletId);
  const palletFilterSize = selectedPallet?.size;
  const palletFilterBoxSizeId = selectedPallet?.box_size_id;

  const assignedLotSizes = [...new Set(
    lots.filter((l) => (lotAssignments[l.id] ?? 0) > 0).map((l) => l.size).filter(Boolean)
  )];
  const assignedLotBoxTypeIds = [...new Set(
    lots.filter((l) => (lotAssignments[l.id] ?? 0) > 0).map((l) => l.box_size_id).filter(Boolean)
  )];
  const compatiblePallets = openPallets.filter((p) =>
    (!p.size || assignedLotSizes.length === 0 || assignedLotSizes.includes(p.size)) &&
    (!p.box_size_id || assignedLotBoxTypeIds.length === 0 || assignedLotBoxTypeIds.includes(p.box_size_id))
  );

  const filteredLots = lots.filter(
    (l) => (!palletFilterSize || l.size === palletFilterSize) && (!palletFilterBoxSizeId || l.box_size_id === palletFilterBoxSizeId)
  );
  const totalAssigned = filteredLots.reduce((sum, l) => sum + (lotAssignments[l.id] ?? 0), 0);
  const remaining = selectedPallet ? selectedPallet.capacity_boxes - selectedPallet.current_boxes : 0;

  return (
    <div className="p-4 bg-blue-50 rounded-lg border border-blue-200 space-y-4">
      <div>
        <label className="block text-xs text-gray-500 mb-1">Select Open Pallet *</label>
        {openPallets.length > 0 ? (
          <>
            <select
              value={selectedPalletId}
              onChange={(e) => {
                const pid = e.target.value;
                setSelectedPalletId(pid);
                const pal = openPallets.find((p) => p.id === pid);
                if (pal?.size || pal?.box_size_id) {
                  const updated: Record<string, number> = {};
                  for (const lot of lots) {
                    const avail = lot.carton_count - (lot.palletized_boxes ?? 0);
                    const sizeMatch = !pal.size || lot.size === pal.size;
                    const boxTypeMatch = !pal.box_size_id || lot.box_size_id === pal.box_size_id;
                    updated[lot.id] = (sizeMatch && boxTypeMatch) ? (lotAssignments[lot.id] ?? avail) : 0;
                  }
                  setLotAssignments(updated);
                }
              }}
              className="w-full border rounded px-2 py-1.5 text-sm"
            >
              <option value="">Select a pallet</option>
              {compatiblePallets.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.pallet_number} — {p.pallet_type_name || "Unknown type"} ({p.current_boxes}/{p.capacity_boxes} boxes)
                  {p.grade ? ` \u00B7 ${p.grade}` : ""}
                  {p.size ? ` \u00B7 Size: ${p.size}` : " \u00B7 No size set"}
                  {p.box_size_name ? ` \u00B7 Box: ${p.box_size_name}` : ""}
                </option>
              ))}
            </select>
            {(palletFilterSize || palletFilterBoxSizeId) && (
              <p className="text-xs text-blue-600 mt-1">
                {palletFilterSize && <>Pallet size: <span className="font-medium">{palletFilterSize}</span></>}
                {palletFilterSize && palletFilterBoxSizeId && " \u00B7 "}
                {palletFilterBoxSizeId && <>Box type: <span className="font-medium">{selectedPallet?.box_size_name || palletFilterBoxSizeId}</span></>}
                {" — only matching lots should be assigned."}
              </p>
            )}
          </>
        ) : (
          <p className="text-sm text-gray-500">No open pallets found. Create a new pallet instead.</p>
        )}
      </div>

      {openPallets.length > 0 && (
        <div>
          <label className="block text-xs text-gray-500 mb-1">Assign boxes from lots</label>
          <div className="border rounded overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-100 text-gray-600 text-xs">
                <tr>
                  <th className="text-left px-2 py-1.5 font-medium">Lot</th>
                  <th className="text-left px-2 py-1.5 font-medium">Grade</th>
                  <th className="text-left px-2 py-1.5 font-medium">Size</th>
                  <th className="text-right px-2 py-1.5 font-medium">Available</th>
                  <th className="text-right px-2 py-1.5 font-medium">Assign</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredLots.map((lot) => {
                  const assigned = lotAssignments[lot.id] ?? 0;
                  const available = lot.carton_count - (lot.palletized_boxes ?? 0);
                  return (
                    <tr key={lot.id}>
                      <td className="px-2 py-1.5 font-mono text-xs text-green-700">{lot.lot_code}</td>
                      <td className="px-2 py-1.5">{lot.grade || "—"}</td>
                      <td className="px-2 py-1.5">{lot.size || "—"}</td>
                      <td className="px-2 py-1.5 text-right text-gray-500">{available}</td>
                      <td className="px-2 py-1.5 text-right">
                        <input
                          type="number"
                          value={assigned || ""}
                          onChange={(e) => setLotAssignments({
                            ...lotAssignments,
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
          <div className="mt-2">
            <p className="text-xs text-gray-500">
              Total: <span className="font-medium">{totalAssigned}</span> boxes
              {selectedPallet && ` \u00B7 Pallet has ${remaining} spaces remaining`}
              {selectedPallet && totalAssigned > remaining && (
                <span className="text-yellow-600 ml-2">(exceeds remaining capacity)</span>
              )}
            </p>
          </div>
        </div>
      )}

      <div className="flex gap-2 pt-2 border-t">
        <button
          onClick={onSave}
          disabled={allocateSaving}
          className="bg-blue-600 text-white px-3 py-1.5 rounded text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
        >
          {allocateSaving ? "Allocating..." : "Allocate to Pallet"}
        </button>
        <button
          onClick={onCancel}
          className="border text-gray-600 px-3 py-1.5 rounded text-sm hover:bg-gray-50"
        >
          Cancel
        </button>
        <Link to="/pallets" className="ml-auto text-xs text-gray-500 hover:text-gray-700 self-center">
          View all pallets &rarr;
        </Link>
      </div>
    </div>
  );
}
