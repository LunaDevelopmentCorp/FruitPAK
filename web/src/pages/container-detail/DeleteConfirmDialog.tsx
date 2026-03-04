import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useNavigate } from "react-router-dom";
import { deleteContainer } from "../../api/containers";
import { getErrorMessage } from "../../api/client";
import { showToast } from "../../store/toastStore";
import { ContainerSectionProps } from "./types";

export default function DeleteConfirmDialog({
  container,
  containerId,
  onClose,
}: Omit<ContainerSectionProps, "onRefresh"> & { onClose: () => void }) {
  const { t } = useTranslation("containers");
  const { t: tc } = useTranslation("common");
  const navigate = useNavigate();

  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!containerId) return;
    setDeleting(true);
    try {
      await deleteContainer(containerId);
      showToast("success", t("detail.deleted"));
      navigate("/containers");
    } catch (err) {
      showToast("error", getErrorMessage(err, t("detail.deleteFailed")));
    } finally {
      setDeleting(false);
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-sm mx-4 p-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-2">
          {t("detail.deleteTitle")}
        </h3>
        <p className="text-sm text-gray-600 mb-4">
          {t("detail.deleteConfirm", { number: container.container_number })}
        </p>
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            disabled={deleting}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
          >
            {tc("actions.cancel")}
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700 disabled:opacity-50 transition-colors"
          >
            {deleting ? tc("actions.deleting") : tc("actions.delete")}
          </button>
        </div>
      </div>
    </div>
  );
}
