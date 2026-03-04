import { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  markContainerLoaded,
  sealContainer,
  dispatchContainer,
  exportContainer,
  markContainerArrived,
  confirmContainerDelivery,
  revertContainerStatus,
} from "../../api/containers";
import { ShippingLineOut } from "../../api/shippingLines";
import { getErrorMessage } from "../../api/client";
import { showToast } from "../../store/toastStore";
import { ContainerSectionProps } from "./types";

export default function StatusActions({
  container,
  containerId,
  onRefresh,
  shippingLines,
}: ContainerSectionProps & { shippingLines: ShippingLineOut[] }) {
  const { t } = useTranslation("containers");
  const { t: tc } = useTranslation("common");

  const [actionBusy, setActionBusy] = useState(false);
  const [showSealForm, setShowSealForm] = useState(false);
  const [sealForm, setSealForm] = useState({ seal_number: "", temp_setpoint_c: "" });
  const [showExportForm, setShowExportForm] = useState(false);
  const [exportForm, setExportForm] = useState({
    vessel_name: "",
    voyage_number: "",
    shipping_line_id: "",
    eta: "",
  });

  const canRevert = ["loaded", "sealed", "dispatched", "in_transit", "arrived"].includes(
    container.status,
  );

  // Don't render if status is open or delivered
  if (container.status === "open" || container.status === "delivered") {
    return null;
  }

  const handleMarkLoaded = async () => {
    if (!containerId) return;
    setActionBusy(true);
    try {
      await markContainerLoaded(containerId);
      showToast("success", t("container.markLoadedSuccess"));
      onRefresh();
    } catch (err) {
      showToast("error", getErrorMessage(err, t("container.markLoadedFailed")));
    } finally {
      setActionBusy(false);
    }
  };

  const handleSeal = async () => {
    if (!containerId || !sealForm.seal_number.trim()) return;
    setActionBusy(true);
    try {
      await sealContainer(containerId, {
        seal_number: sealForm.seal_number.trim(),
        temp_setpoint_c: sealForm.temp_setpoint_c
          ? Number(sealForm.temp_setpoint_c)
          : null,
      });
      showToast("success", t("container.sealSuccess"));
      setShowSealForm(false);
      setSealForm({ seal_number: "", temp_setpoint_c: "" });
      onRefresh();
    } catch (err) {
      showToast("error", getErrorMessage(err, t("container.sealFailed")));
    } finally {
      setActionBusy(false);
    }
  };

  const handleDispatch = async () => {
    if (!containerId) return;
    setActionBusy(true);
    try {
      await dispatchContainer(containerId);
      showToast("success", t("container.dispatchSuccess"));
      onRefresh();
    } catch (err) {
      showToast("error", getErrorMessage(err, t("container.dispatchFailed")));
    } finally {
      setActionBusy(false);
    }
  };

  const handleExport = async () => {
    if (!containerId) return;
    setActionBusy(true);
    try {
      await exportContainer(containerId, {
        vessel_name: exportForm.vessel_name || null,
        voyage_number: exportForm.voyage_number || null,
        shipping_line_id: exportForm.shipping_line_id || null,
        eta: exportForm.eta || null,
      });
      showToast("success", t("container.markExportedSuccess"));
      setShowExportForm(false);
      setExportForm({ vessel_name: "", voyage_number: "", shipping_line_id: "", eta: "" });
      onRefresh();
    } catch (err) {
      showToast("error", getErrorMessage(err, t("container.markExportedFailed")));
    } finally {
      setActionBusy(false);
    }
  };

  const handleMarkArrived = async () => {
    if (!containerId) return;
    setActionBusy(true);
    try {
      await markContainerArrived(containerId);
      showToast("success", t("container.markArrivedSuccess"));
      onRefresh();
    } catch (err) {
      showToast("error", getErrorMessage(err, t("container.markArrivedFailed")));
    } finally {
      setActionBusy(false);
    }
  };

  const handleConfirmDelivery = async () => {
    if (!containerId) return;
    setActionBusy(true);
    try {
      await confirmContainerDelivery(containerId);
      showToast("success", t("container.confirmDeliverySuccess"));
      onRefresh();
    } catch (err) {
      showToast("error", getErrorMessage(err, t("container.confirmDeliveryFailed")));
    } finally {
      setActionBusy(false);
    }
  };

  const handleRevert = async () => {
    if (!containerId) return;
    setActionBusy(true);
    try {
      await revertContainerStatus(containerId);
      showToast("success", t("container.revertSuccess"));
      setShowSealForm(false);
      setShowExportForm(false);
      onRefresh();
    } catch (err) {
      showToast("error", getErrorMessage(err, t("container.revertFailed")));
    } finally {
      setActionBusy(false);
    }
  };

  return (
    <div className="bg-white rounded-lg border p-4">
      <h3 className="text-sm font-semibold text-gray-700 mb-3">
        {t("container.statusActions")}
      </h3>
      <div className="flex flex-wrap items-start gap-3">
        {/* Primary action button */}
        {container.status === "loading" && (
          <button
            onClick={handleMarkLoaded}
            disabled={actionBusy}
            className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 disabled:opacity-50 transition-colors"
          >
            {t("container.markLoaded")}
          </button>
        )}

        {container.status === "loaded" && !showSealForm && (
          <button
            onClick={() => setShowSealForm(true)}
            disabled={actionBusy}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
          >
            {t("container.sealContainer")}
          </button>
        )}

        {container.status === "sealed" && (
          <button
            onClick={handleDispatch}
            disabled={actionBusy}
            className="px-4 py-2 text-sm font-medium text-white bg-orange-600 rounded-md hover:bg-orange-700 disabled:opacity-50 transition-colors"
          >
            {t("container.dispatch")}
          </button>
        )}

        {container.status === "dispatched" && !showExportForm && (
          <button
            onClick={() => setShowExportForm(true)}
            disabled={actionBusy}
            className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {t("container.markExported")}
          </button>
        )}

        {container.status === "in_transit" && (
          <button
            onClick={handleMarkArrived}
            disabled={actionBusy}
            className="px-4 py-2 text-sm font-medium text-white bg-teal-600 rounded-md hover:bg-teal-700 disabled:opacity-50 transition-colors"
          >
            {t("container.markArrived")}
          </button>
        )}

        {container.status === "arrived" && (
          <button
            onClick={handleConfirmDelivery}
            disabled={actionBusy}
            className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 disabled:opacity-50 transition-colors"
          >
            {t("container.confirmDelivery")}
          </button>
        )}

        {/* Revert button */}
        {canRevert && (
          <button
            onClick={handleRevert}
            disabled={actionBusy}
            className="px-3 py-2 text-xs font-medium text-gray-600 bg-gray-100 rounded-md hover:bg-gray-200 border border-gray-300 disabled:opacity-50 transition-colors"
          >
            {t("container.revert")}
          </button>
        )}
      </div>

      {/* Seal inline form */}
      {showSealForm && container.status === "loaded" && (
        <div className="mt-4 p-3 bg-blue-50 rounded-md border border-blue-200 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-600 mb-1">
                {t("container.sealNumber")} <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={sealForm.seal_number}
                onChange={(e) =>
                  setSealForm((f) => ({ ...f, seal_number: e.target.value }))
                }
                className="w-full border rounded px-3 py-2 text-sm"
                placeholder={t("container.sealNumberPlaceholder")}
              />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">
                {t("container.tempSetpoint")}
              </label>
              <input
                type="number"
                step="0.1"
                value={sealForm.temp_setpoint_c}
                onChange={(e) =>
                  setSealForm((f) => ({ ...f, temp_setpoint_c: e.target.value }))
                }
                className="w-full border rounded px-3 py-2 text-sm"
                placeholder="-1.5"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleSeal}
              disabled={actionBusy || !sealForm.seal_number.trim()}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 transition-colors"
            >
              {t("container.sealContainer")}
            </button>
            <button
              onClick={() => {
                setShowSealForm(false);
                setSealForm({ seal_number: "", temp_setpoint_c: "" });
              }}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
            >
              {tc("actions.cancel")}
            </button>
          </div>
        </div>
      )}

      {/* Export inline form */}
      {showExportForm && container.status === "dispatched" && (
        <div className="mt-4 p-3 bg-indigo-50 rounded-md border border-indigo-200 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-600 mb-1">
                {t("container.vesselName")}
              </label>
              <input
                type="text"
                value={exportForm.vessel_name}
                onChange={(e) =>
                  setExportForm((f) => ({ ...f, vessel_name: e.target.value }))
                }
                className="w-full border rounded px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-600 mb-1">
                {t("container.voyageNumber")}
              </label>
              <input
                type="text"
                value={exportForm.voyage_number}
                onChange={(e) =>
                  setExportForm((f) => ({ ...f, voyage_number: e.target.value }))
                }
                className="w-full border rounded px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-600 mb-1">
                {t("container.shippingLine")}
              </label>
              <select
                value={exportForm.shipping_line_id}
                onChange={(e) =>
                  setExportForm((f) => ({ ...f, shipping_line_id: e.target.value }))
                }
                className="w-full border rounded px-3 py-2 text-sm"
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
              <label className="block text-xs text-gray-600 mb-1">
                {t("container.etaLabel")}
              </label>
              <input
                type="date"
                value={exportForm.eta}
                onChange={(e) =>
                  setExportForm((f) => ({ ...f, eta: e.target.value }))
                }
                className="w-full border rounded px-3 py-2 text-sm"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleExport}
              disabled={actionBusy}
              className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {t("container.markExported")}
            </button>
            <button
              onClick={() => {
                setShowExportForm(false);
                setExportForm({
                  vessel_name: "",
                  voyage_number: "",
                  shipping_line_id: "",
                  eta: "",
                });
              }}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
            >
              {tc("actions.cancel")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
