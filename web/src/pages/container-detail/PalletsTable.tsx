import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import StatusBadge from "../../components/StatusBadge";
import { useTableSort, sortRows, sortableThClass } from "../../hooks/useTableSort";
import { ContainerSectionProps } from "./types";

export default function PalletsTable({
  container,
  onRefresh,
  onOpenLoadModal,
}: ContainerSectionProps & { onOpenLoadModal: () => void }) {
  const { t } = useTranslation("containers");
  const { sortCol, sortDir, toggleSort, sortIndicator } = useTableSort();

  const canLoadPallets =
    container.status === "open" || container.status === "loading";

  return (
    <div className="bg-white rounded-lg border p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-700">
          {t("detail.pallets")} ({container.pallets.length})
        </h3>
        {canLoadPallets && !container.locked_fields?.length && (
          <button
            onClick={onOpenLoadModal}
            className="px-3 py-1.5 text-xs font-medium rounded-md bg-green-600 text-white hover:bg-green-700 transition-colors"
          >
            {t("detail.loadPallets")}
          </button>
        )}
      </div>
      {container.pallets.length > 0 ? (
        <table className="w-full text-sm">
          <thead className="text-gray-500 text-xs">
            <tr>
              <th
                onClick={() => toggleSort("pallet_number")}
                className={`text-left px-2 py-1.5 font-medium ${sortableThClass}`}
              >
                {t("detail.headers.palletNumber")}
                {sortIndicator("pallet_number")}
              </th>
              <th
                onClick={() => toggleSort("fruit")}
                className={`text-left px-2 py-1.5 font-medium ${sortableThClass}`}
              >
                {t("detail.headers.fruit")}
                {sortIndicator("fruit")}
              </th>
              <th
                onClick={() => toggleSort("grade")}
                className={`text-left px-2 py-1.5 font-medium ${sortableThClass}`}
              >
                {t("detail.headers.grade")}
                {sortIndicator("grade")}
              </th>
              <th
                onClick={() => toggleSort("size")}
                className={`text-left px-2 py-1.5 font-medium ${sortableThClass}`}
              >
                {t("detail.headers.size")}
                {sortIndicator("size")}
              </th>
              <th
                onClick={() => toggleSort("box_type")}
                className={`text-left px-2 py-1.5 font-medium ${sortableThClass}`}
              >
                {t("detail.headers.boxType")}
                {sortIndicator("box_type")}
              </th>
              <th
                onClick={() => toggleSort("boxes")}
                className={`text-right px-2 py-1.5 font-medium ${sortableThClass}`}
              >
                {t("detail.headers.boxes")}
                {sortIndicator("boxes")}
              </th>
              <th
                onClick={() => toggleSort("status")}
                className={`text-left px-2 py-1.5 font-medium ${sortableThClass}`}
              >
                {t("detail.headers.status")}
                {sortIndicator("status")}
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {sortRows(container.pallets, sortCol, sortDir, {
              pallet_number: (r) => r.pallet_number,
              fruit: (r) => r.fruit_type,
              grade: (r) => r.grade,
              size: (r) => r.size,
              box_type: (r) => r.box_size_name,
              boxes: (r) => r.current_boxes,
              status: (r) => r.status,
            }).map((p) => (
              <tr
                key={p.id}
                className="hover:bg-green-50/50 even:bg-gray-50/50"
              >
                <td className="px-2 py-1.5">
                  <Link
                    to={`/pallets/${p.id}`}
                    className="font-mono text-xs text-green-700 hover:underline"
                  >
                    {p.pallet_number}
                  </Link>
                </td>
                <td className="px-2 py-1.5">{p.fruit_type || "\u2014"}</td>
                <td className="px-2 py-1.5">{p.grade || "\u2014"}</td>
                <td className="px-2 py-1.5">{p.size || "\u2014"}</td>
                <td className="px-2 py-1.5">{p.box_size_name || "\u2014"}</td>
                <td className="px-2 py-1.5 text-right font-medium">
                  {p.current_boxes}
                </td>
                <td className="px-2 py-1.5">
                  <StatusBadge status={p.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="text-gray-400 text-sm">{t("detail.noPallets")}</p>
      )}
    </div>
  );
}
