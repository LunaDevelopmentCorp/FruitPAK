import React, { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import api from "../../api/client";
import { getErrorMessage } from "../../api/client";
import { showToast } from "../../store/toastStore";

interface ImportResult {
  created: Record<string, number>;
  skipped: Record<string, number>;
  errors: string[];
}

export default function TenantExportImport() {
  const { t } = useTranslation("admin");
  const fileRef = useRef<HTMLInputElement>(null);

  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [previewName, setPreviewName] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);

  const handleExport = async () => {
    setExporting(true);
    try {
      const { data } = await api.get("/admin/tenant-export");
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `tenant-config-${new Date().toISOString().split("T")[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showToast("success", t("export.downloaded"));
    } catch (e: unknown) {
      showToast("error", getErrorMessage(e, t("export.failed")));
    } finally {
      setExporting(false);
    }
  };

  const handleFileSelect = () => {
    const file = fileRef.current?.files?.[0];
    if (file) {
      setPreviewName(file.name);
      setImportResult(null);
      setImportError(null);
    } else {
      setPreviewName(null);
    }
  };

  const handleImport = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) return;

    setImporting(true);
    setImportResult(null);
    setImportError(null);

    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      const { data } = await api.post<ImportResult>(
        "/admin/tenant-import",
        payload
      );
      setImportResult(data);
      showToast("success", t("export.importSuccess"));
    } catch (e: unknown) {
      const msg = getErrorMessage(e, t("export.importFailed"));
      setImportError(msg);
      showToast("error", msg);
    } finally {
      setImporting(false);
    }
  };

  const totalCreated = importResult
    ? Object.values(importResult.created).reduce((a, b) => a + b, 0)
    : 0;
  const totalSkipped = importResult
    ? Object.values(importResult.skipped).reduce((a, b) => a + b, 0)
    : 0;

  return (
    <div className="space-y-6">
      {/* Export section */}
      <div className="bg-white rounded-lg border p-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-1">
          {t("export.exportTitle")}
        </h3>
        <p className="text-xs text-gray-500 mb-4">{t("export.exportDesc")}</p>
        <button
          onClick={handleExport}
          disabled={exporting}
          className="px-4 py-2 bg-green-600 text-white rounded text-sm font-medium hover:bg-green-700 disabled:opacity-50"
        >
          {exporting ? t("common:actions.loading") : t("export.downloadBtn")}
        </button>
      </div>

      {/* Import section */}
      <div className="bg-white rounded-lg border p-6">
        <h3 className="text-sm font-semibold text-gray-700 mb-1">
          {t("export.importTitle")}
        </h3>
        <p className="text-xs text-gray-500 mb-4">{t("export.importDesc")}</p>

        <div className="flex flex-wrap items-center gap-3">
          <label className="cursor-pointer px-4 py-2 border border-gray-300 rounded text-sm text-gray-700 hover:bg-gray-50">
            {t("export.chooseFile")}
            <input
              ref={fileRef}
              type="file"
              accept=".json"
              onChange={handleFileSelect}
              className="hidden"
            />
          </label>
          {previewName && (
            <span className="text-sm text-gray-600">{previewName}</span>
          )}
          <button
            onClick={handleImport}
            disabled={importing || !previewName}
            className="px-4 py-2 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {importing ? t("common:actions.loading") : t("export.importBtn")}
          </button>
        </div>

        {importError && (
          <div className="mt-4 p-3 bg-red-50 text-red-700 rounded text-sm">
            {importError}
          </div>
        )}

        {/* Import results */}
        {importResult && (
          <div className="mt-4 space-y-3">
            {/* Summary */}
            <div className="flex gap-4">
              <div className="px-4 py-2 bg-green-50 rounded text-center">
                <p className="text-2xl font-bold text-green-700">
                  {totalCreated}
                </p>
                <p className="text-xs text-green-600">
                  {t("export.created")}
                </p>
              </div>
              <div className="px-4 py-2 bg-gray-50 rounded text-center">
                <p className="text-2xl font-bold text-gray-600">
                  {totalSkipped}
                </p>
                <p className="text-xs text-gray-500">
                  {t("export.skipped")}
                </p>
              </div>
              {importResult.errors.length > 0 && (
                <div className="px-4 py-2 bg-red-50 rounded text-center">
                  <p className="text-2xl font-bold text-red-700">
                    {importResult.errors.length}
                  </p>
                  <p className="text-xs text-red-600">
                    {t("export.errors")}
                  </p>
                </div>
              )}
            </div>

            {/* Detail table */}
            {totalCreated + totalSkipped > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-left text-gray-600">
                    <tr>
                      <th className="px-3 py-2">{t("export.table")}</th>
                      <th className="px-3 py-2 text-center text-green-700">
                        {t("export.created")}
                      </th>
                      <th className="px-3 py-2 text-center text-gray-500">
                        {t("export.skipped")}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {Object.keys({
                      ...importResult.created,
                      ...importResult.skipped,
                    }).map((key) => (
                      <tr key={key} className="hover:bg-gray-50">
                        <td className="px-3 py-1.5 font-medium capitalize">
                          {key.replace(/_/g, " ")}
                        </td>
                        <td className="px-3 py-1.5 text-center text-green-700">
                          {importResult.created[key] || 0}
                        </td>
                        <td className="px-3 py-1.5 text-center text-gray-500">
                          {importResult.skipped[key] || 0}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Error list */}
            {importResult.errors.length > 0 && (
              <div className="p-3 bg-red-50 rounded">
                <p className="text-xs font-semibold text-red-700 mb-1">
                  {t("export.errorList")}
                </p>
                <ul className="text-xs text-red-600 space-y-1">
                  {importResult.errors.map((err, i) => (
                    <li key={i}>{err}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Info box */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h4 className="text-sm font-medium text-blue-800 mb-1">
          {t("export.infoTitle")}
        </h4>
        <ul className="text-xs text-blue-700 space-y-1 list-disc list-inside">
          <li>{t("export.info1")}</li>
          <li>{t("export.info2")}</li>
          <li>{t("export.info3")}</li>
          <li>{t("export.info4")}</li>
        </ul>
      </div>
    </div>
  );
}
