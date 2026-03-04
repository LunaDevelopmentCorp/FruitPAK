import { useState } from "react";
import { useTranslation } from "react-i18next";
import { markContainerArrived } from "../../api/containers";
import { getErrorMessage } from "../../api/client";
import { showToast } from "../../store/toastStore";
import { ContainerSectionProps } from "./types";

export default function OverdueBanner({
  container,
  containerId,
  onRefresh,
}: ContainerSectionProps) {
  const { t } = useTranslation("containers");
  const [actionBusy, setActionBusy] = useState(false);

  if (!container.is_overdue) return null;

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

  return (
    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <p className="text-sm text-yellow-800">
          {t("container.overdueWarning", {
            eta: container.eta
              ? new Date(container.eta).toLocaleDateString()
              : "?",
          })}
        </p>
        <div className="flex gap-2">
          <button
            onClick={handleMarkArrived}
            disabled={actionBusy}
            className="px-3 py-1.5 text-xs font-medium rounded-md bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50 transition-colors"
          >
            {t("container.markArrived")}
          </button>
          <button
            onClick={() => {
              /* dismiss overdue by doing nothing -- user acknowledges */
            }}
            className="px-3 py-1.5 text-xs font-medium rounded-md border border-yellow-300 text-yellow-800 hover:bg-yellow-100 transition-colors"
          >
            {t("container.stillInTransit")}
          </button>
        </div>
      </div>
    </div>
  );
}
