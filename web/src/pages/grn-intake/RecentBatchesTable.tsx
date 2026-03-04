import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { useTableSort, sortRows, sortableThClass } from "../../hooks/useTableSort";
import { Spinner } from "./helpers";
import InlineEditPanel from "./InlineEditPanel";
import { RecentBatchesTableProps } from "./types";

export default function RecentBatchesTable({
  batches,
  loading,
  grnDate,
  onDateChange,
  binTypes,
  onRefresh,
}: RecentBatchesTableProps) {
  const { t } = useTranslation("grn");
  const { sortCol, sortDir, toggleSort, sortIndicator } = useTableSort();
  const [editingBatchId, setEditingBatchId] = useState<string | null>(null);

  return (
    <div className="mt-10 border-t pt-8">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-800">
            {grnDate === new Date().toISOString().split("T")[0] ? t("recent.titleToday") : t("recent.titleDate", { date: grnDate })}
          </h2>
          <p className="text-sm text-gray-500">
            {t("recent.clickToEdit")}
          </p>
        </div>
        <input
          type="date"
          value={grnDate}
          onChange={(e) => {
            onDateChange(e.target.value);
            setEditingBatchId(null);
          }}
          className="border rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
        />
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-gray-400 text-sm">
          <Spinner /> {t("common:actions.loading")}
        </div>
      ) : batches.length === 0 ? (
        <p className="text-gray-400 text-sm">{t("recent.noGrns")}</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-gray-500 text-xs border-b">
              <tr>
                <th onClick={() => toggleSort("code")} className={`text-left px-2 py-2 font-medium ${sortableThClass}`}>{t("recent.batchCode")}{sortIndicator("code")}</th>
                <th onClick={() => toggleSort("grower")} className={`text-left px-2 py-2 font-medium ${sortableThClass}`}>{t("common:table.grower")}{sortIndicator("grower")}</th>
                <th onClick={() => toggleSort("fruit")} className={`text-left px-2 py-2 font-medium ${sortableThClass}`}>{t("recent.fruitVariety")}{sortIndicator("fruit")}</th>
                <th onClick={() => toggleSort("bins")} className={`text-right px-2 py-2 font-medium ${sortableThClass}`}>{t("recent.bins")}{sortIndicator("bins")}</th>
                <th onClick={() => toggleSort("gross")} className={`text-right px-2 py-2 font-medium ${sortableThClass}`}>{t("recent.grossKg")}{sortIndicator("gross")}</th>
                <th onClick={() => toggleSort("net")} className={`text-right px-2 py-2 font-medium ${sortableThClass}`}>{t("recent.netKg")}{sortIndicator("net")}</th>
                <th onClick={() => toggleSort("status")} className={`text-left px-2 py-2 font-medium ${sortableThClass}`}>{t("common:table.status")}{sortIndicator("status")}</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {sortRows(batches, sortCol, sortDir, {
                code: (b) => b.batch_code,
                grower: (b) => b.grower_name || "",
                fruit: (b) => `${b.fruit_type}${b.variety ? ` / ${b.variety}` : ""}`,
                bins: (b) => b.bin_count ?? 0,
                gross: (b) => b.gross_weight_kg ?? 0,
                net: (b) => b.net_weight_kg ?? 0,
                status: (b) => b.status,
              }).map((b) => (
                <React.Fragment key={b.id}>
                  <tr
                    onClick={() => setEditingBatchId(editingBatchId === b.id ? null : b.id)}
                    className={`cursor-pointer hover:bg-green-50/50 even:bg-gray-50/50 ${editingBatchId === b.id ? "bg-amber-50" : ""}`}
                  >
                    <td className="px-2 py-2 font-mono text-xs text-green-700">{b.batch_code}</td>
                    <td className="px-2 py-2">{b.grower_code ? `${b.grower_name || b.grower_id} (${b.grower_code})` : (b.grower_name || b.grower_id)}</td>
                    <td className="px-2 py-2">
                      {b.fruit_type}{b.variety ? ` / ${b.variety}` : ""}
                    </td>
                    <td className="px-2 py-2 text-right">{b.bin_count ?? "\u2014"}</td>
                    <td className="px-2 py-2 text-right">
                      {b.gross_weight_kg != null ? b.gross_weight_kg.toLocaleString() : "\u2014"}
                    </td>
                    <td className="px-2 py-2 text-right font-medium">
                      {b.net_weight_kg != null ? b.net_weight_kg.toLocaleString() : "\u2014"}
                    </td>
                    <td className="px-2 py-2">
                      <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700">
                        {b.status}
                      </span>
                    </td>
                  </tr>
                  {editingBatchId === b.id && (
                    <tr>
                      <td colSpan={7} className="p-0">
                        <InlineEditPanel
                          batch={b}
                          binTypes={binTypes}
                          onSave={() => {
                            setEditingBatchId(null);
                            onRefresh();
                          }}
                          onCancel={() => setEditingBatchId(null)}
                        />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
