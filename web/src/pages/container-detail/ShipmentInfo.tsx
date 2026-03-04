import { useState } from "react";
import { useTranslation } from "react-i18next";
import { updateContainer, UpdateContainerPayload } from "../../api/containers";
import { ShippingLineOut } from "../../api/shippingLines";
import { getErrorMessage } from "../../api/client";
import { showToast } from "../../store/toastStore";
import { LockBanner } from "../../components/LockIndicator";
import { ContainerSectionProps, CONTAINER_TYPES } from "./types";
import { Row } from "./helpers";

export default function ShipmentInfo({
  container,
  containerId,
  onRefresh,
  shippingLines,
}: ContainerSectionProps & { shippingLines: ShippingLineOut[] }) {
  const { t } = useTranslation("containers");
  const { t: tc } = useTranslation("common");

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editForm, setEditForm] = useState({
    container_type: "",
    capacity_pallets: 20,
    shipping_container_number: "",
    customer_name: "",
    destination: "",
    export_date: "",
    seal_number: "",
    shipping_line_id: "",
    vessel_name: "",
    voyage_number: "",
    eta: "",
    notes: "",
  });

  const startEditing = () => {
    setEditForm({
      container_type: container.container_type,
      capacity_pallets: container.capacity_pallets,
      shipping_container_number: container.shipping_container_number || "",
      customer_name: container.customer_name || "",
      destination: container.destination || "",
      export_date: container.export_date
        ? new Date(container.export_date).toISOString().slice(0, 10)
        : "",
      seal_number: container.seal_number || "",
      shipping_line_id: container.shipping_line_id || "",
      vessel_name: container.vessel_name || "",
      voyage_number: container.voyage_number || "",
      eta: container.eta
        ? new Date(container.eta).toISOString().slice(0, 10)
        : "",
      notes: container.notes || "",
    });
    setEditing(true);
  };

  const cancelEditing = () => setEditing(false);

  const handleSaveEdit = async () => {
    if (!containerId) return;
    setSaving(true);
    try {
      const payload: UpdateContainerPayload = {
        container_type: editForm.container_type,
        capacity_pallets: editForm.capacity_pallets,
        shipping_container_number: editForm.shipping_container_number || null,
        customer_name: editForm.customer_name || null,
        destination: editForm.destination || null,
        export_date: editForm.export_date || null,
        seal_number: editForm.seal_number || null,
        shipping_line_id: editForm.shipping_line_id || null,
        vessel_name: editForm.vessel_name || null,
        voyage_number: editForm.voyage_number || null,
        eta: editForm.eta || null,
        notes: editForm.notes || null,
      };
      await updateContainer(containerId, payload);
      showToast("success", "Container updated");
      setEditing(false);
      onRefresh();
    } catch (err) {
      showToast("error", getErrorMessage(err, "Failed to update container"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white rounded-lg border p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-700">
          {t("detail.shipmentDetails")}
        </h3>
        {!editing && (
          <button
            onClick={startEditing}
            className="px-3 py-1 text-xs font-medium rounded-md border border-gray-300 text-gray-600 hover:bg-gray-50 transition-colors"
          >
            {tc("actions.edit")}
          </button>
        )}
      </div>

      {editing ? (
        <div className="space-y-3">
          {(container.locked_fields?.length ?? 0) > 0 && (
            <LockBanner message={tc("locks.containerExport")} />
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">
                {t("detail.containerType")}
              </label>
              <select
                value={editForm.container_type}
                onChange={(e) =>
                  setEditForm((f) => ({ ...f, container_type: e.target.value }))
                }
                disabled={container.locked_fields?.includes("container_type")}
                className="w-full border rounded px-3 py-2 text-sm disabled:bg-gray-100 disabled:cursor-not-allowed"
              >
                {CONTAINER_TYPES.map((ct) => (
                  <option key={ct} value={ct}>
                    {ct}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">
                {t("detail.capacityPallets")}
              </label>
              <input
                type="number"
                min={1}
                value={editForm.capacity_pallets}
                onChange={(e) =>
                  setEditForm((f) => ({
                    ...f,
                    capacity_pallets: Number(e.target.value) || 1,
                  }))
                }
                disabled={container.locked_fields?.includes("capacity_pallets")}
                className="w-full border rounded px-3 py-2 text-sm disabled:bg-gray-100 disabled:cursor-not-allowed"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">
                {t("detail.shippingNumber")}
              </label>
              <input
                value={editForm.shipping_container_number}
                onChange={(e) =>
                  setEditForm((f) => ({
                    ...f,
                    shipping_container_number: e.target.value,
                  }))
                }
                disabled={container.locked_fields?.includes(
                  "shipping_container_number",
                )}
                className="w-full border rounded px-3 py-2 text-sm disabled:bg-gray-100 disabled:cursor-not-allowed"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">
                {t("detail.customer")}
              </label>
              <input
                value={editForm.customer_name}
                onChange={(e) =>
                  setEditForm((f) => ({ ...f, customer_name: e.target.value }))
                }
                disabled={container.locked_fields?.includes("customer_name")}
                className="w-full border rounded px-3 py-2 text-sm disabled:bg-gray-100 disabled:cursor-not-allowed"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">
                {t("detail.destination")}
              </label>
              <input
                value={editForm.destination}
                onChange={(e) =>
                  setEditForm((f) => ({ ...f, destination: e.target.value }))
                }
                disabled={container.locked_fields?.includes("destination")}
                className="w-full border rounded px-3 py-2 text-sm disabled:bg-gray-100 disabled:cursor-not-allowed"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">
                {t("detail.exportDate")}
              </label>
              <input
                type="date"
                value={editForm.export_date}
                onChange={(e) =>
                  setEditForm((f) => ({ ...f, export_date: e.target.value }))
                }
                disabled={container.locked_fields?.includes("export_date")}
                className="w-full border rounded px-3 py-2 text-sm disabled:bg-gray-100 disabled:cursor-not-allowed"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">
                {t("container.shippingLine")}
              </label>
              <select
                value={editForm.shipping_line_id}
                onChange={(e) =>
                  setEditForm((f) => ({ ...f, shipping_line_id: e.target.value }))
                }
                disabled={container.locked_fields?.includes("shipping_line_id")}
                className="w-full border rounded px-3 py-2 text-sm disabled:bg-gray-100 disabled:cursor-not-allowed"
              >
                <option value="">{t("create.noShippingLine")}</option>
                {shippingLines.map((sl) => (
                  <option key={sl.id} value={sl.id}>
                    {sl.name} ({sl.code})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">
                {t("container.vesselName")}
              </label>
              <input
                value={editForm.vessel_name}
                onChange={(e) =>
                  setEditForm((f) => ({ ...f, vessel_name: e.target.value }))
                }
                disabled={container.locked_fields?.includes("vessel_name")}
                className="w-full border rounded px-3 py-2 text-sm disabled:bg-gray-100 disabled:cursor-not-allowed"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1">
                {t("container.voyageNumber")}
              </label>
              <input
                value={editForm.voyage_number}
                onChange={(e) =>
                  setEditForm((f) => ({ ...f, voyage_number: e.target.value }))
                }
                disabled={container.locked_fields?.includes("voyage_number")}
                className="w-full border rounded px-3 py-2 text-sm disabled:bg-gray-100 disabled:cursor-not-allowed"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">
                {t("container.etaLabel")}
              </label>
              <input
                type="date"
                value={editForm.eta}
                onChange={(e) =>
                  setEditForm((f) => ({ ...f, eta: e.target.value }))
                }
                disabled={container.locked_fields?.includes("eta")}
                className="w-full border rounded px-3 py-2 text-sm disabled:bg-gray-100 disabled:cursor-not-allowed"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">
              {t("detail.sealNumber")}
            </label>
            <input
              value={editForm.seal_number}
              onChange={(e) =>
                setEditForm((f) => ({ ...f, seal_number: e.target.value }))
              }
              disabled={container.locked_fields?.includes("seal_number")}
              className="w-full border rounded px-3 py-2 text-sm disabled:bg-gray-100 disabled:cursor-not-allowed"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">
              {t("detail.notes")}
            </label>
            <textarea
              value={editForm.notes}
              onChange={(e) =>
                setEditForm((f) => ({ ...f, notes: e.target.value }))
              }
              rows={2}
              className="w-full border rounded px-3 py-2 text-sm"
            />
          </div>
          <div className="flex gap-2 pt-2">
            <button
              onClick={handleSaveEdit}
              disabled={saving}
              className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 disabled:opacity-50 transition-colors"
            >
              {saving ? tc("actions.saving") : tc("actions.save")}
            </button>
            <button
              onClick={cancelEditing}
              disabled={saving}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
            >
              {tc("actions.cancel")}
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-y-2 text-sm">
          <Row label={tc("table.type")} value={container.container_type} />
          <Row
            label={t("detail.shippingNumber")}
            value={container.shipping_container_number || "\u2014"}
          />
          <Row
            label={t("detail.customer")}
            value={container.customer_name || "\u2014"}
          />
          <Row
            label={t("detail.destination")}
            value={container.destination || "\u2014"}
          />
          <Row
            label={t("detail.exportDate")}
            value={
              container.export_date
                ? new Date(container.export_date).toLocaleDateString()
                : "\u2014"
            }
          />
          <Row
            label={t("detail.sealNumber")}
            value={container.seal_number || "\u2014"}
          />
          <Row
            label={t("detail.transporter")}
            value={container.transporter_name || "\u2014"}
          />
          <Row
            label={t("detail.shippingAgent")}
            value={container.shipping_agent_name || "\u2014"}
          />
          <Row
            label={t("container.shippingLine")}
            value={container.shipping_line_name || "\u2014"}
          />
          <Row
            label={t("container.vesselName")}
            value={container.vessel_name || "\u2014"}
          />
          <Row
            label={t("container.voyageNumber")}
            value={container.voyage_number || "\u2014"}
          />
          <Row
            label={t("container.etaLabel")}
            value={
              container.eta
                ? new Date(container.eta).toLocaleDateString()
                : "\u2014"
            }
          />
        </div>
      )}

      {/* Notes (view mode only -- editable from edit form above) */}
      {!editing && container.notes && (
        <div className="mt-4 pt-3 border-t">
          <h4 className="text-xs font-semibold text-gray-500 mb-1">
            {t("detail.notes")}
          </h4>
          <p className="text-sm text-gray-600">{container.notes}</p>
        </div>
      )}
    </div>
  );
}
