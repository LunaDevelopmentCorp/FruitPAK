import { useEffect, useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { getContainer, ContainerDetailType } from "../api/containers";
import { listShippingLines, ShippingLineOut } from "../api/shippingLines";
import { listShippingSchedules, ShippingScheduleSummary } from "../api/shippingSchedules";
import PageHeader from "../components/PageHeader";
import StatusBadge from "../components/StatusBadge";

// Sub-components (each manages its own local state)
import OverdueBanner from "./container-detail/OverdueBanner";
import SummaryCards from "./container-detail/SummaryCards";
import StatusActions from "./container-detail/StatusActions";
import ShipmentInfo from "./container-detail/ShipmentInfo";
import Timestamps from "./container-detail/Timestamps";
import PalletsTable from "./container-detail/PalletsTable";
import Traceability from "./container-detail/Traceability";
import ContainerQRCode from "./container-detail/ContainerQRCode";
import LoadPalletsModal from "./container-detail/LoadPalletsModal";
import DeleteConfirmDialog from "./container-detail/DeleteConfirmDialog";

export default function ContainerDetail() {
  const { t } = useTranslation("containers");
  const { t: tc } = useTranslation("common");
  const { containerId } = useParams<{ containerId: string }>();
  const [container, setContainer] = useState<ContainerDetailType | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Shared config data (loaded once)
  const [shippingLines, setShippingLines] = useState<ShippingLineOut[]>([]);
  const [schedules, setSchedules] = useState<ShippingScheduleSummary[]>([]);

  // Modal / dialog visibility
  const [showLoadModal, setShowLoadModal] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const fetchContainer = useCallback(() => {
    if (!containerId) return;
    setLoading(true);
    getContainer(containerId)
      .then(setContainer)
      .catch(() => setError("Failed to load container"))
      .finally(() => setLoading(false));
  }, [containerId]);

  useEffect(() => {
    fetchContainer();
  }, [fetchContainer]);

  // Fetch shipping lines for dropdowns (edit form + export form)
  useEffect(() => {
    listShippingLines()
      .then(setShippingLines)
      .catch(() => {});
    listShippingSchedules({ status: "scheduled" })
      .then(setSchedules)
      .catch(() => {});
  }, []);

  if (loading)
    return (
      <p className="p-6 text-gray-400 text-sm">{t("detail.loading")}</p>
    );
  if (error)
    return <div className="p-6 text-red-600 text-sm">{error}</div>;
  if (!container)
    return (
      <div className="p-6 text-gray-400 text-sm">{t("detail.notFound")}</div>
    );

  // Can delete if status is open or loading with no pallets loaded
  const canDelete =
    (container.status === "open" || container.status === "loading") &&
    container.pallet_count === 0;

  return (
    <div className="max-w-4xl mx-auto px-6 py-8 space-y-6">
      {/* Header */}
      <PageHeader
        title={container.container_number}
        backTo="/containers"
        backLabel={t("detail.backLabel")}
        action={
          <div className="flex items-center gap-2">
            <StatusBadge
              status={container.status}
              className="text-sm px-3 py-1"
            />
            {canDelete && (
              <button
                onClick={() => setShowDeleteConfirm(true)}
                className="px-3 py-1 text-xs font-medium rounded-md border border-red-300 text-red-600 hover:bg-red-50 transition-colors"
              >
                {tc("actions.delete")}
              </button>
            )}
          </div>
        }
      />

      <OverdueBanner
        container={container}
        containerId={containerId!}
        onRefresh={fetchContainer}
      />

      <SummaryCards container={container} />

      <StatusActions
        container={container}
        containerId={containerId!}
        onRefresh={fetchContainer}
        shippingLines={shippingLines}
        schedules={schedules}
      />

      <ShipmentInfo
        container={container}
        containerId={containerId!}
        onRefresh={fetchContainer}
        shippingLines={shippingLines}
        schedules={schedules}
      />

      <Timestamps container={container} />

      <PalletsTable
        container={container}
        containerId={containerId!}
        onRefresh={fetchContainer}
        onOpenLoadModal={() => setShowLoadModal(true)}
      />

      <Traceability container={container} />

      <ContainerQRCode container={container} />

      {/* Meta */}
      <div className="text-xs text-gray-400">
        Created: {new Date(container.created_at).toLocaleString()} | Updated:{" "}
        {new Date(container.updated_at).toLocaleString()}
      </div>

      {/* Modals */}
      {showLoadModal && (
        <LoadPalletsModal
          container={container}
          containerId={containerId!}
          onRefresh={fetchContainer}
          onClose={() => setShowLoadModal(false)}
        />
      )}

      {showDeleteConfirm && (
        <DeleteConfirmDialog
          container={container}
          containerId={containerId!}
          onClose={() => setShowDeleteConfirm(false)}
        />
      )}
    </div>
  );
}
