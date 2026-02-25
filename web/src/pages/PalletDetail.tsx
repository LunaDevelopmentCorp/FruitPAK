import React, { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { QRCodeSVG } from "qrcode.react";
import {
  getPallet,
  deallocateFromPallet,
  updatePallet,
  deletePallet,
  getPalletTypes,
  getBoxSizes,
  PalletDetailType,
  PalletTypeConfig,
  BoxSizeConfig,
  PalletUpdatePayload,
} from "../api/pallets";
import { getErrorMessage } from "../api/client";
import { showToast as globalToast } from "../store/toastStore";
import PageHeader from "../components/PageHeader";
import StatusBadge from "../components/StatusBadge";

export default function PalletDetail() {
  const { t } = useTranslation("pallets");
  const { palletId } = useParams<{ palletId: string }>();
  const navigate = useNavigate();
  const [pallet, setPallet] = useState<PalletDetailType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [removingId, setRemovingId] = useState<string | null>(null);

  // Edit mode
  const [editing, setEditing] = useState(false);
  const [palletTypes, setPalletTypes] = useState<PalletTypeConfig[]>([]);
  const [boxSizes, setBoxSizes] = useState<BoxSizeConfig[]>([]);

  // Delete
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const {
    register,
    handleSubmit,
    reset,
    formState: { isSubmitting },
  } = useForm<PalletUpdatePayload>();

  const fetchPallet = () => {
    if (!palletId) return;
    setLoading(true);
    getPallet(palletId)
      .then((p) => {
        setPallet(p);
        reset({
          pallet_type_name: p.pallet_type_name || "",
          capacity_boxes: p.capacity_boxes,
          fruit_type: p.fruit_type || "",
          variety: p.variety || "",
          grade: p.grade || "",
          size: p.size || "",
          box_size_id: p.box_size_id || "",
          target_market: p.target_market || "",
          cold_store_room: p.cold_store_room || "",
          cold_store_position: p.cold_store_position || "",
          notes: p.notes || "",
          net_weight_kg: p.net_weight_kg ?? undefined,
          gross_weight_kg: p.gross_weight_kg ?? undefined,
        });
      })
      .catch(() => setError("Failed to load pallet"))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchPallet();
    getPalletTypes().then(setPalletTypes).catch(() => {});
    getBoxSizes().then(setBoxSizes).catch(() => {});
  }, [palletId]);

  const canModify = pallet && !["loaded", "exported"].includes(pallet.status);

  const onSubmit = async (data: PalletUpdatePayload) => {
    if (!palletId) return;
    setError(null);
    setSuccess(null);

    const payload: PalletUpdatePayload = {};
    if (data.pallet_type_name) payload.pallet_type_name = data.pallet_type_name;
    if (data.capacity_boxes) payload.capacity_boxes = Number(data.capacity_boxes);
    if (data.fruit_type !== undefined) payload.fruit_type = data.fruit_type || null;
    if (data.variety !== undefined) payload.variety = data.variety || null;
    if (data.grade !== undefined) payload.grade = data.grade || null;
    if (data.size !== undefined) payload.size = data.size || null;
    if (data.box_size_id !== undefined) payload.box_size_id = data.box_size_id || null;
    if (data.target_market !== undefined) payload.target_market = data.target_market || null;
    if (data.cold_store_room !== undefined) payload.cold_store_room = data.cold_store_room || null;
    if (data.cold_store_position !== undefined) payload.cold_store_position = data.cold_store_position || null;
    if (data.notes !== undefined) payload.notes = data.notes || null;
    if (data.net_weight_kg) payload.net_weight_kg = Number(data.net_weight_kg);
    if (data.gross_weight_kg) payload.gross_weight_kg = Number(data.gross_weight_kg);

    try {
      const updated = await updatePallet(palletId, payload);
      setPallet(updated);
      reset({
        pallet_type_name: updated.pallet_type_name || "",
        capacity_boxes: updated.capacity_boxes,
        fruit_type: updated.fruit_type || "",
        variety: updated.variety || "",
        grade: updated.grade || "",
        size: updated.size || "",
        box_size_id: updated.box_size_id || "",
        target_market: updated.target_market || "",
        cold_store_room: updated.cold_store_room || "",
        cold_store_position: updated.cold_store_position || "",
        notes: updated.notes || "",
        net_weight_kg: updated.net_weight_kg ?? undefined,
        gross_weight_kg: updated.gross_weight_kg ?? undefined,
      });
      setEditing(false);
      setSuccess("Pallet updated successfully");
    } catch (err: unknown) {
      setError(getErrorMessage(err, "Update failed"));
    }
  };

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

  if (loading) return <p className="p-6 text-gray-400 text-sm">{t("detail.loading")}</p>;
  if (error && !pallet) return <div className="p-6 text-red-600 text-sm">{error}</div>;
  if (!pallet) return <div className="p-6 text-gray-400 text-sm">{t("detail.notFound")}</div>;

  const fillPct = Math.round((pallet.current_boxes / pallet.capacity_boxes) * 100);

  return (
    <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
      {/* Header */}
      <PageHeader
        title={pallet.pallet_number}
        backTo="/pallets"
        backLabel={t("detail.backLabel")}
        action={
          <div className="flex items-center gap-3">
            <StatusBadge status={pallet.status} className="text-sm px-3 py-1" />
            {!editing && canModify && (
              <>
                <button
                  onClick={() => { setEditing(true); setSuccess(null); }}
                  className="bg-green-600 text-white px-4 py-2 rounded text-sm font-medium hover:bg-green-700"
                >
                  {t("common:actions.edit")}
                </button>
                {pallet.current_boxes === 0 && (
                  <button
                    onClick={() => setConfirmDelete(true)}
                    className="border border-red-300 text-red-600 px-4 py-2 rounded text-sm font-medium hover:bg-red-50"
                  >
                    {t("common:actions.delete")}
                  </button>
                )}
              </>
            )}
          </div>
        }
      />

      {/* Delete confirmation */}
      {confirmDelete && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-800 font-medium mb-2">
            {t("detail.deleteConfirm", { number: pallet.pallet_number })}
          </p>
          <p className="text-xs text-red-600 mb-3">
            {t("detail.deleteWarning")}
          </p>
          <div className="flex gap-2">
            <button
              onClick={async () => {
                setDeleting(true);
                try {
                  await deletePallet(palletId!);
                  globalToast("success", `Pallet ${pallet.pallet_number} deleted.`);
                  navigate("/pallets");
                } catch (err: unknown) {
                  globalToast("error", getErrorMessage(err, "Failed to delete pallet."));
                  setDeleting(false);
                  setConfirmDelete(false);
                }
              }}
              disabled={deleting}
              className="bg-red-600 text-white px-4 py-2 rounded text-sm font-medium hover:bg-red-700 disabled:opacity-50"
            >
              {deleting ? t("common:actions.deleting") : t("detail.yesDelete")}
            </button>
            <button
              onClick={() => setConfirmDelete(false)}
              className="border text-gray-600 px-4 py-2 rounded text-sm font-medium hover:bg-gray-50"
            >
              {t("common:actions.cancel")}
            </button>
          </div>
        </div>
      )}

      {error && (
        <div className="p-3 bg-red-50 text-red-700 rounded text-sm">{error}</div>
      )}
      {success && (
        <div className="p-3 bg-green-50 text-green-700 rounded text-sm">{success}</div>
      )}

      {editing ? (
        /* -- Edit form -- */
        <form onSubmit={handleSubmit(onSubmit)} className="bg-white border rounded-lg p-6 space-y-5">
          <div className="grid grid-cols-2 gap-4">
            <Field label={t("detail.palletType")}>
              {palletTypes.length > 0 ? (
                <select {...register("pallet_type_name")} className={inputClass}>
                  <option value="">Select</option>
                  {palletTypes.map((pt) => (
                    <option key={pt.id} value={pt.name}>{pt.name} ({pt.capacity_boxes} {t("common:units.boxes")})</option>
                  ))}
                </select>
              ) : (
                <input {...register("pallet_type_name")} className={inputClass} />
              )}
            </Field>
            <Field label={t("detail.capacityBoxes")}>
              <input type="number" {...register("capacity_boxes", { valueAsNumber: true })} min={1} className={inputClass} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label={t("detail.fruitType")}>
              <input {...register("fruit_type")} placeholder={t("detail.fruitTypePlaceholder")} className={inputClass} />
            </Field>
            <Field label={t("common:table.variety")}>
              <input {...register("variety")} placeholder={t("detail.varietyPlaceholder")} className={inputClass} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label={t("common:table.grade")}>
              <input {...register("grade")} placeholder={t("detail.gradePlaceholder")} className={inputClass} />
            </Field>
            <Field label={t("common:table.size")}>
              <input {...register("size")} placeholder={t("detail.sizePlaceholder")} className={inputClass} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label={t("list.headers.boxType")}>
              {boxSizes.length > 0 ? (
                <select {...register("box_size_id")} className={inputClass}>
                  <option value="">{t("detail.none")}</option>
                  {boxSizes.map((bs) => (
                    <option key={bs.id} value={bs.id}>{bs.name} ({bs.weight_kg} {t("common:units.kg")})</option>
                  ))}
                </select>
              ) : (
                <input {...register("box_size_id")} placeholder="Box size ID" className={inputClass} />
              )}
            </Field>
            <Field label={t("detail.targetMarket")}>
              <input {...register("target_market")} className={inputClass} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label={t("common:table.notes")}>
              <textarea {...register("notes")} rows={2} className={inputClass} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label={t("detail.coldStoreRoom")}>
              <input {...register("cold_store_room")} className={inputClass} />
            </Field>
            <Field label={t("detail.coldStorePosition")}>
              <input {...register("cold_store_position")} className={inputClass} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label={t("detail.netWeightKg")}>
              <input type="number" step="0.1" {...register("net_weight_kg", { valueAsNumber: true })} className={inputClass} />
            </Field>
            <Field label={t("detail.grossWeightKg")}>
              <input type="number" step="0.1" {...register("gross_weight_kg", { valueAsNumber: true })} className={inputClass} />
            </Field>
          </div>
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={isSubmitting}
              className="bg-green-600 text-white px-4 py-2 rounded text-sm font-medium hover:bg-green-700 disabled:opacity-50"
            >
              {isSubmitting ? t("common:actions.saving") : t("common:actions.saveChanges")}
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="border text-gray-600 px-4 py-2 rounded text-sm font-medium hover:bg-gray-50"
            >
              {t("common:actions.cancel")}
            </button>
          </div>
        </form>
      ) : (
        /* -- Read-only detail -- */
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card label={t("detail.boxes")} value={`${pallet.current_boxes} / ${pallet.capacity_boxes}`} />
            <Card label={t("detail.fill")} value={`${fillPct}%`} />
            <Card label={t("detail.weight")} value={pallet.net_weight_kg ? `${pallet.net_weight_kg} ${t("common:units.kg")}` : "\u2014"} />
            <Card label={t("detail.type")} value={pallet.pallet_type_name || "\u2014"} />
          </div>

          {/* Capacity bar */}
          <div className="bg-white rounded-lg border p-4">
            <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
              <span>{t("detail.capacity")}</span>
              <span>{pallet.current_boxes} / {pallet.capacity_boxes} {t("common:units.boxes")}</span>
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
            <h3 className="text-sm font-semibold text-gray-700 mb-3">{t("detail.fruitDetails")}</h3>
            <div className="grid grid-cols-2 gap-y-2 text-sm">
              <Row label={t("common:table.fruit")} value={pallet.fruit_type || "\u2014"} />
              <Row label={t("common:table.variety")} value={pallet.variety || "\u2014"} />
              <Row label={t("common:table.grade")} value={pallet.grade || "\u2014"} />
              <Row label={t("common:table.size")} value={pallet.size || "\u2014"} />
              <Row label={t("list.headers.boxType")} value={pallet.box_size_name || "\u2014"} />
              <Row label={t("detail.targetMarket")} value={pallet.target_market || "\u2014"} />
            </div>
          </div>

          {/* Cold storage */}
          {(pallet.cold_store_room || pallet.cold_store_position) && (
            <div className="bg-white rounded-lg border p-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-3">{t("detail.coldStorage")}</h3>
              <div className="grid grid-cols-2 gap-y-2 text-sm">
                <Row label={t("detail.room")} value={pallet.cold_store_room || "\u2014"} />
                <Row label={t("detail.position")} value={pallet.cold_store_position || "\u2014"} />
              </div>
            </div>
          )}

          {/* Notes */}
          {pallet.notes && (
            <div className="bg-white rounded-lg border p-4">
              <h3 className="text-sm font-semibold text-gray-700 mb-2">{t("common:table.notes")}</h3>
              <p className="text-sm text-gray-600">{pallet.notes}</p>
            </div>
          )}
        </>
      )}

      {/* Linked lots (always visible) */}
      <div className="bg-white rounded-lg border p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">
          {t("detail.linkedLots")} ({pallet.pallet_lots.length})
        </h3>
        {pallet.pallet_lots.length > 0 ? (
          <table className="w-full text-sm">
            <thead className="text-gray-500 text-xs">
              <tr>
                <th className="text-left px-2 py-1.5 font-medium">{t("detail.lotCode")}</th>
                <th className="text-left px-2 py-1.5 font-medium">{t("common:table.grade")}</th>
                <th className="text-left px-2 py-1.5 font-medium">{t("common:table.size")}</th>
                <th className="text-left px-2 py-1.5 font-medium">{t("list.headers.boxType")}</th>
                <th className="text-right px-2 py-1.5 font-medium">{t("list.headers.boxes")}</th>
                {canModify && <th className="px-2 py-1.5 font-medium" />}
              </tr>
            </thead>
            <tbody className="divide-y">
              {pallet.pallet_lots.map((pl) => (
                <tr key={pl.id} className="hover:bg-green-50/50 even:bg-gray-50/50">
                  <td className="px-2 py-1.5 font-mono text-xs text-green-700">
                    {pl.lot_code || pl.lot_id}
                  </td>
                  <td className="px-2 py-1.5">{pl.grade || "\u2014"}</td>
                  <td className="px-2 py-1.5">{pl.size || "\u2014"}</td>
                  <td className="px-2 py-1.5">{pl.box_size_name || "\u2014"}</td>
                  <td className="px-2 py-1.5 text-right font-medium">{pl.box_count}</td>
                  {canModify && (
                    <td className="px-2 py-1.5 text-right">
                      <button
                        onClick={() => handleRemoveLot(pl.id, pl.lot_code || pl.lot_id, pl.box_count)}
                        disabled={removingId === pl.id}
                        className="text-xs text-red-500 hover:text-red-700 font-medium disabled:opacity-50"
                      >
                        {removingId === pl.id ? t("detail.removing") : t("common:actions.remove")}
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-gray-400 text-sm">{t("detail.noLots")}</p>
        )}
      </div>

      {/* QR Code */}
      <div className="bg-white rounded-lg border p-4">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">{t("detail.qrCode")}</h3>
        <div className="flex flex-col items-center gap-2">
          <QRCodeSVG
            value={JSON.stringify({
              type: "pallet",
              pallet_id: pallet.id,
              number: pallet.pallet_number,
              fruit_type: pallet.fruit_type,
              grade: pallet.grade,
              boxes: pallet.current_boxes,
              lots: pallet.pallet_lots.map((pl) => pl.lot_code || pl.lot_id).slice(0, 10),
            })}
            size={160}
            fgColor="#15803d"
            level="M"
          />
          <span className="text-xs text-gray-500 font-mono">{pallet.pallet_number}</span>
        </div>
      </div>

      {/* Meta */}
      <div className="text-xs text-gray-400">
        Created: {new Date(pallet.created_at).toLocaleString()} | Updated: {new Date(pallet.updated_at).toLocaleString()}
      </div>
    </div>
  );
}

const inputClass =
  "w-full border rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
      {children}
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
