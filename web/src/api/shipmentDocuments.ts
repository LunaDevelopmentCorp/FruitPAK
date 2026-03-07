import api from "./client";

// ── Types ────────────────────────────────────────────────────

export interface ShipmentDocument {
  id: string;
  container_id: string;
  doc_type: string;
  filename: string;
  file_size: number;
  mime_type: string;
  notes: string | null;
  created_at: string;
}

// ── API calls ────────────────────────────────────────────────

export async function listDocuments(containerId: string): Promise<ShipmentDocument[]> {
  const { data } = await api.get<ShipmentDocument[]>(
    `/containers/${containerId}/documents`,
  );
  return data;
}

export async function uploadDocument(
  containerId: string,
  file: File,
  docType: string,
): Promise<ShipmentDocument> {
  const formData = new FormData();
  formData.append("file", file);
  const { data } = await api.post<ShipmentDocument>(
    `/containers/${containerId}/documents/upload?doc_type=${encodeURIComponent(docType)}`,
    formData,
    { headers: { "Content-Type": "multipart/form-data" } },
  );
  return data;
}

export async function generatePackingList(
  containerId: string,
  variant: "shipping" | "traceability",
): Promise<ShipmentDocument> {
  const { data } = await api.post<ShipmentDocument>(
    `/containers/${containerId}/documents/generate-packing-list`,
    { variant },
  );
  return data;
}

export async function downloadDocument(
  containerId: string,
  docId: string,
): Promise<{ url: string; filename: string }> {
  const response = await api.get(
    `/containers/${containerId}/documents/${docId}/download`,
    { responseType: "blob" },
  );

  // If response is JSON with a URL (S3 mode), open the URL
  const contentType = response.headers["content-type"] || "";
  if (contentType.includes("application/json")) {
    const text = await (response.data as Blob).text();
    const json = JSON.parse(text);
    return json;
  }

  // Otherwise it's a direct file download (local mode) — create blob URL
  const blob = response.data as Blob;
  const disposition = response.headers["content-disposition"] || "";
  const filenameMatch = disposition.match(/filename="?([^"]+)"?/);
  const filename = filenameMatch ? filenameMatch[1] : "document";
  const url = URL.createObjectURL(blob);
  return { url, filename };
}

export async function deleteDocument(
  containerId: string,
  docId: string,
): Promise<void> {
  await api.delete(`/containers/${containerId}/documents/${docId}`);
}

export async function emailDocuments(
  containerId: string,
  payload: {
    to_email?: string;
    subject?: string;
    message?: string;
  },
): Promise<{ ok: boolean; to: string; documents_sent: number }> {
  const { data } = await api.post(
    `/containers/${containerId}/documents/email`,
    payload,
  );
  return data;
}
