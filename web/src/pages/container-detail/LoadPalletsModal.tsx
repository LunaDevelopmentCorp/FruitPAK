import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { loadPalletsIntoContainer } from "../../api/containers";
import { listPallets, PalletSummary } from "../../api/pallets";
import { getErrorMessage } from "../../api/client";
import { showToast } from "../../store/toastStore";
import { ContainerSectionProps } from "./types";

export default function LoadPalletsModal({
  container,
  containerId,
  onRefresh,
  onClose,
}: ContainerSectionProps & { onClose: () => void }) {
  const { t } = useTranslation("containers");
  const { t: tc } = useTranslation("common");

  const [availablePallets, setAvailablePallets] = useState<PalletSummary[]>([]);
  const [selectedPalletIds, setSelectedPalletIds] = useState<Set<string>>(
    new Set(),
  );
  const [loadingPallets, setLoadingPallets] = useState(true);
  const [submittingLoad, setSubmittingLoad] = useState(false);
  const [forceOverride, setForceOverride] = useState(false);

  // Fetch available pallets on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const pallets = await listPallets({ status: "closed" });
        if (cancelled) return;
        const loadedIds = new Set(container.pallets.map((p) => p.id));
        setAvailablePallets(pallets.filter((p) => !loadedIds.has(p.id)));
      } catch (err) {
        if (cancelled) return;
        showToast(
          "error",
          getErrorMessage(err, "Failed to fetch available pallets"),
        );
        onClose();
      } finally {
        if (!cancelled) setLoadingPallets(false);
      }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const togglePalletSelection = (id: string) => {
    setSelectedPalletIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleLoadSelected = async () => {
    if (!containerId || selectedPalletIds.size === 0) return;
    setSubmittingLoad(true);
    try {
      await loadPalletsIntoContainer(containerId, {
        pallet_ids: Array.from(selectedPalletIds),
        force: forceOverride || undefined,
      });
      showToast(
        "success",
        t("loadPallets.loaded", { count: selectedPalletIds.size }),
      );
      onClose();
      onRefresh();
    } catch (err) {
      showToast("error", getErrorMessage(err, t("loadPallets.loadFailed")));
    } finally {
      setSubmittingLoad(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl mx-4 max-h-[80vh] flex flex-col">
        {/* Modal header */}
        <div className="flex items-center justify-between px-5 py-4 border-b">
          <h2 className="text-lg font-semibold text-gray-800">
            {t("loadPallets.title")}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none"
          >
            &times;
          </button>
        </div>

        {/* Modal body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loadingPallets ? (
            <p className="text-sm text-gray-400">{t("loadPallets.loading")}</p>
          ) : availablePallets.length === 0 ? (
            <p className="text-sm text-gray-500">{t("loadPallets.empty")}</p>
          ) : (
            <>
              <p className="text-xs text-gray-500 mb-3">
                {t("loadPallets.help", { count: selectedPalletIds.size })}
              </p>
              <table className="w-full text-sm">
                <thead className="text-gray-500 text-xs">
                  <tr>
                    <th className="text-left px-2 py-1.5 font-medium w-8">
                      <input
                        type="checkbox"
                        checked={
                          availablePallets.length > 0 &&
                          selectedPalletIds.size === availablePallets.length
                        }
                        onChange={() => {
                          if (
                            selectedPalletIds.size === availablePallets.length
                          ) {
                            setSelectedPalletIds(new Set());
                          } else {
                            setSelectedPalletIds(
                              new Set(availablePallets.map((p) => p.id)),
                            );
                          }
                        }}
                        className="rounded border-gray-300"
                      />
                    </th>
                    <th className="text-left px-2 py-1.5 font-medium">
                      {t("detail.headers.palletNumber")}
                    </th>
                    <th className="text-right px-2 py-1.5 font-medium">
                      {t("detail.headers.boxes")}
                    </th>
                    <th className="text-left px-2 py-1.5 font-medium">
                      {t("detail.headers.fruit")}
                    </th>
                    <th className="text-left px-2 py-1.5 font-medium">
                      {t("detail.headers.grade")}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {availablePallets.map((p) => (
                    <tr
                      key={p.id}
                      className={`cursor-pointer ${
                        selectedPalletIds.has(p.id)
                          ? "bg-green-50"
                          : "hover:bg-gray-50"
                      }`}
                      onClick={() => togglePalletSelection(p.id)}
                    >
                      <td className="px-2 py-1.5">
                        <input
                          type="checkbox"
                          checked={selectedPalletIds.has(p.id)}
                          onChange={() => togglePalletSelection(p.id)}
                          onClick={(e) => e.stopPropagation()}
                          className="rounded border-gray-300"
                        />
                      </td>
                      <td className="px-2 py-1.5 font-mono text-xs text-green-700">
                        {p.pallet_number}
                      </td>
                      <td className="px-2 py-1.5 text-right font-medium">
                        {p.current_boxes}
                      </td>
                      <td className="px-2 py-1.5">{p.fruit_type || "\u2014"}</td>
                      <td className="px-2 py-1.5">{p.grade || "\u2014"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>

        {/* Modal footer */}
        <div className="px-5 py-4 border-t space-y-3">
          <label className="flex items-center gap-2 text-xs text-yellow-700 font-medium cursor-pointer">
            <input
              type="checkbox"
              checked={forceOverride}
              onChange={(e) => setForceOverride(e.target.checked)}
              className="rounded border-gray-300"
            />
            {t("loadPallets.forceOverride")}
          </label>
          <div className="flex items-center justify-end gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors"
            >
              {tc("actions.cancel")}
            </button>
            <button
              onClick={handleLoadSelected}
              disabled={selectedPalletIds.size === 0 || submittingLoad}
              className="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {submittingLoad
                ? t("loadPallets.loadingButton")
                : t("loadPallets.loadSelected", {
                    count: selectedPalletIds.size,
                  })}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
