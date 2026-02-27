import api from "./client";

export interface RowError {
  row: number;
  errors: string[];
}

export interface BulkImportResult {
  total_rows: number;
  created: number;
  updated: number;
  failed: number;
  errors: RowError[];
}

export type EntityType = "growers" | "harvest-teams" | "clients" | "shipping-schedules";

export function downloadTemplate(entity: EntityType): void {
  api
    .get(`/bulk-import/${entity}/template`, { responseType: "blob" })
    .then((response) => {
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `${entity}_template.csv`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    });
}

export async function uploadCsv(
  entity: EntityType,
  file: File,
): Promise<BulkImportResult> {
  const formData = new FormData();
  formData.append("file", file);
  const { data } = await api.post<BulkImportResult>(
    `/bulk-import/${entity}/upload`,
    formData,
    { headers: { "Content-Type": "multipart/form-data" } },
  );
  return data;
}
