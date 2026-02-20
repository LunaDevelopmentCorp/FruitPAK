import { useRef, useState } from "react";
import {
  downloadTemplate,
  uploadCsv,
  BulkImportResult,
  EntityType,
} from "../api/bulkImport";
import { showToast } from "../store/toastStore";
import { getErrorMessage } from "../api/client";

interface Props {
  entity: EntityType;
  label: string;
  onSuccess?: () => void;
}

export default function CsvImport({ entity, label, onSuccess }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<BulkImportResult | null>(null);

  const handleUpload = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) return;

    setUploading(true);
    setResult(null);
    try {
      const res = await uploadCsv(entity, file);
      setResult(res);
      if (res.failed === 0) {
        showToast(
          "success",
          `Imported ${res.created} new + ${res.updated} updated ${label.toLowerCase()}`,
        );
      } else {
        showToast(
          "warning",
          `${res.created + res.updated} succeeded, ${res.failed} failed`,
        );
      }
      onSuccess?.();
    } catch (err: unknown) {
      showToast("error", getErrorMessage(err, "Upload failed"));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  return (
    <div className="border rounded-lg p-4 bg-gray-50 space-y-3">
      <div className="flex items-center gap-3 flex-wrap">
        <button
          onClick={() => downloadTemplate(entity)}
          className="text-sm px-3 py-1.5 border rounded text-blue-600 hover:bg-blue-50 font-medium"
        >
          Download CSV Template
        </button>
        <div className="flex items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept=".csv"
            className="text-sm text-gray-600 file:mr-2 file:py-1.5 file:px-3 file:rounded file:border file:text-sm file:font-medium file:bg-white file:text-gray-700 hover:file:bg-gray-50"
          />
          <button
            onClick={handleUpload}
            disabled={uploading}
            className="text-sm px-4 py-1.5 bg-green-600 text-white rounded font-medium hover:bg-green-700 disabled:opacity-50"
          >
            {uploading ? "Uploading..." : "Upload CSV"}
          </button>
        </div>
      </div>

      {result && (
        <div className="text-sm space-y-2">
          <div className="flex gap-4">
            <span className="text-gray-500">
              Total rows: <strong>{result.total_rows}</strong>
            </span>
            <span className="text-green-700">
              Created: <strong>{result.created}</strong>
            </span>
            <span className="text-blue-700">
              Updated: <strong>{result.updated}</strong>
            </span>
            {result.failed > 0 && (
              <span className="text-red-600">
                Failed: <strong>{result.failed}</strong>
              </span>
            )}
          </div>

          {result.errors.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded p-3 max-h-48 overflow-y-auto">
              <p className="text-red-700 font-medium mb-1">Errors:</p>
              {result.errors.map((e) => (
                <div key={e.row} className="text-red-600 text-xs mb-1">
                  <span className="font-medium">Row {e.row}:</span>{" "}
                  {e.errors.join("; ")}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
