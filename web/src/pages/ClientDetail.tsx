import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import PageHeader from "../components/PageHeader";
import StatusBadge from "../components/StatusBadge";
import { showToast } from "../store/toastStore";
import { listClients, ClientSummary } from "../api/clients";
import { listContainers, ContainerSummary } from "../api/containers";
import {
  listDocuments,
  uploadDocument,
  generatePackingList,
  downloadDocument,
  deleteDocument,
  emailDocuments,
  ShipmentDocument,
} from "../api/shipmentDocuments";

const DOC_TYPE_LABELS: Record<string, string> = {
  packing_list_shipping: "Packing List (Shipping)",
  packing_list_traceability: "Packing List (Traceability)",
  bill_of_lading: "Bill of Lading",
  phyto_certificate: "Phyto Certificate",
  fumigation_certificate: "Fumigation Certificate",
  other: "Other",
};

const UPLOAD_DOC_TYPES = [
  "bill_of_lading",
  "phyto_certificate",
  "fumigation_certificate",
  "other",
];

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ClientDetail() {
  const { clientId } = useParams<{ clientId: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation("clients");
  const [client, setClient] = useState<ClientSummary | null>(null);
  const [containers, setContainers] = useState<ContainerSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedContainer, setExpandedContainer] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!clientId) return;
    setLoading(true);
    try {
      const clients = await listClients();
      const found = clients.find((c) => c.id === clientId);
      if (!found) {
        navigate("/clients");
        return;
      }
      setClient(found);
      const allContainers = await listContainers({ client_id: clientId });
      setContainers(allContainers);
    } catch {
      showToast("error", t("loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [clientId, navigate, t]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  if (loading) return <p className="text-gray-400 text-sm p-6">{t("loading")}</p>;
  if (!client) return null;

  return (
    <div className="p-4 lg:p-6 max-w-[1200px] mx-auto">
      <PageHeader
        title={client.name}
        subtitle={[client.contact_person, client.email, client.phone].filter(Boolean).join(" · ") || undefined}
        action={
          <button
            onClick={() => navigate("/clients")}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            {t("detail.backToList")}
          </button>
        }
      />

      {/* Client info cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <div className="bg-white border rounded p-3">
          <span className="text-xs text-gray-400 block">{t("headers.country")}</span>
          <span className="font-medium">{client.country || "—"}</span>
        </div>
        <div className="bg-white border rounded p-3">
          <span className="text-xs text-gray-400 block">{t("headers.incoterm")}</span>
          <span className="font-medium">{client.incoterm || "—"}</span>
        </div>
        <div className="bg-white border rounded p-3">
          <span className="text-xs text-gray-400 block">{t("headers.paymentTerms")}</span>
          <span className="font-medium">
            {client.payment_terms_days != null ? `${client.payment_terms_days} ${t("days")}` : "—"}
          </span>
        </div>
        <div className="bg-white border rounded p-3">
          <span className="text-xs text-gray-400 block">{t("headers.status")}</span>
          <StatusBadge status={client.is_active ? "active" : "inactive"} />
        </div>
      </div>

      {/* Shipments section */}
      <h2 className="text-lg font-semibold text-gray-800 mb-3">{t("detail.shipments")}</h2>

      {containers.length === 0 ? (
        <p className="text-gray-400 text-sm py-8 text-center">{t("detail.noShipments")}</p>
      ) : (
        <div className="space-y-3">
          {containers.map((c) => (
            <ContainerDocCard
              key={c.id}
              container={c}
              clientEmail={client.email}
              expanded={expandedContainer === c.id}
              onToggle={() =>
                setExpandedContainer(expandedContainer === c.id ? null : c.id)
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ── Container card with documents panel ─────────────────────

function ContainerDocCard({
  container,
  clientEmail,
  expanded,
  onToggle,
}: {
  container: ContainerSummary;
  clientEmail: string | null;
  expanded: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation("clients");
  const [docs, setDocs] = useState<ShipmentDocument[]>([]);
  const [docsLoading, setDocsLoading] = useState(false);
  const [generating, setGenerating] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadDocType, setUploadDocType] = useState("bill_of_lading");
  const [showEmailModal, setShowEmailModal] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadDocs = useCallback(async () => {
    setDocsLoading(true);
    try {
      setDocs(await listDocuments(container.id));
    } catch {
      // silent
    } finally {
      setDocsLoading(false);
    }
  }, [container.id]);

  useEffect(() => {
    if (expanded) loadDocs();
  }, [expanded, loadDocs]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      await uploadDocument(container.id, file, uploadDocType);
      showToast("success", t("detail.uploadSuccess"));
      await loadDocs();
    } catch {
      showToast("error", t("detail.uploadFailed"));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleGenerate = async (variant: "shipping" | "traceability") => {
    setGenerating(variant);
    try {
      await generatePackingList(container.id, variant);
      showToast("success", t("detail.generateSuccess"));
      await loadDocs();
    } catch {
      showToast("error", t("detail.generateFailed"));
    } finally {
      setGenerating(null);
    }
  };

  const handleDownload = async (doc: ShipmentDocument) => {
    try {
      const { url } = await downloadDocument(container.id, doc.id);
      window.open(url, "_blank");
    } catch {
      showToast("error", t("detail.downloadFailed"));
    }
  };

  const handleDelete = async (doc: ShipmentDocument) => {
    if (!confirm(t("detail.deleteConfirm", { name: doc.filename }))) return;
    try {
      await deleteDocument(container.id, doc.id);
      showToast("success", t("detail.deleteSuccess"));
      await loadDocs();
    } catch {
      showToast("error", t("detail.deleteFailed"));
    }
  };

  return (
    <div className="bg-white border rounded-lg overflow-hidden">
      {/* Container row header */}
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50"
      >
        <div className="flex items-center gap-4">
          <span className="font-medium text-gray-800">{container.container_number}</span>
          <StatusBadge status={container.status} />
          <span className="text-sm text-gray-500">
            {container.destination || ""}
          </span>
        </div>
        <div className="flex items-center gap-3 text-sm text-gray-400">
          <span>{container.pallet_count} pallets</span>
          <span>{container.total_cartons} cartons</span>
          <svg
            className={`w-4 h-4 transition-transform ${expanded ? "rotate-180" : ""}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>

      {/* Expanded documents panel */}
      {expanded && (
        <div className="border-t px-4 py-4 bg-gray-50/50">
          {/* Action buttons */}
          <div className="flex flex-wrap gap-2 mb-4">
            <button
              onClick={() => handleGenerate("shipping")}
              disabled={generating !== null}
              className="px-3 py-1.5 bg-green-600 text-white text-sm rounded hover:bg-green-700 disabled:opacity-50"
            >
              {generating === "shipping" ? t("detail.generating") : t("detail.generateShipping")}
            </button>
            <button
              onClick={() => handleGenerate("traceability")}
              disabled={generating !== null}
              className="px-3 py-1.5 bg-green-600 text-white text-sm rounded hover:bg-green-700 disabled:opacity-50"
            >
              {generating === "traceability" ? t("detail.generating") : t("detail.generateTraceability")}
            </button>

            <div className="flex items-center gap-1 ml-2">
              <select
                value={uploadDocType}
                onChange={(e) => setUploadDocType(e.target.value)}
                className="border rounded px-2 py-1.5 text-sm bg-white"
              >
                {UPLOAD_DOC_TYPES.map((dt) => (
                  <option key={dt} value={dt}>
                    {DOC_TYPE_LABELS[dt]}
                  </option>
                ))}
              </select>
              <label className="px-3 py-1.5 border text-sm rounded cursor-pointer hover:bg-gray-100">
                {uploading ? t("detail.uploading") : t("detail.upload")}
                <input
                  ref={fileInputRef}
                  type="file"
                  className="hidden"
                  accept=".pdf,.jpg,.jpeg,.png,.doc,.docx"
                  onChange={handleUpload}
                  disabled={uploading}
                />
              </label>
            </div>

            {docs.length > 0 && (
              <button
                onClick={() => setShowEmailModal(true)}
                className="px-3 py-1.5 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 ml-auto"
              >
                {t("detail.emailDocs")}
              </button>
            )}
          </div>

          {/* Documents list */}
          {docsLoading ? (
            <p className="text-gray-400 text-sm">{t("loading")}</p>
          ) : docs.length === 0 ? (
            <p className="text-gray-400 text-sm py-4 text-center">{t("detail.noDocs")}</p>
          ) : (
            <div className="bg-white rounded border divide-y">
              {docs.map((doc) => (
                <div key={doc.id} className="flex items-center justify-between px-3 py-2 text-sm">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="inline-block px-2 py-0.5 bg-gray-100 rounded text-xs text-gray-600 whitespace-nowrap">
                      {DOC_TYPE_LABELS[doc.doc_type] || doc.doc_type}
                    </span>
                    <span className="truncate text-gray-700">{doc.filename}</span>
                    <span className="text-gray-400 text-xs whitespace-nowrap">{formatBytes(doc.file_size)}</span>
                    <span className="text-gray-400 text-xs whitespace-nowrap">
                      {doc.created_at.slice(0, 10)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 ml-3">
                    <button
                      onClick={() => handleDownload(doc)}
                      className="text-xs text-blue-600 hover:underline"
                    >
                      {t("detail.download")}
                    </button>
                    <button
                      onClick={() => handleDelete(doc)}
                      className="text-xs text-red-500 hover:underline"
                    >
                      {t("detail.delete")}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Email modal */}
          {showEmailModal && (
            <EmailModal
              containerId={container.id}
              containerNumber={container.container_number}
              clientEmail={clientEmail}
              docCount={docs.length}
              onClose={() => setShowEmailModal(false)}
            />
          )}
        </div>
      )}
    </div>
  );
}

// ── Email modal ──────────────────────────────────────────────

function EmailModal({
  containerId,
  containerNumber,
  clientEmail,
  docCount,
  onClose,
}: {
  containerId: string;
  containerNumber: string;
  clientEmail: string | null;
  docCount: number;
  onClose: () => void;
}) {
  const { t } = useTranslation("clients");
  const [toEmail, setToEmail] = useState(clientEmail || "");
  const [subject, setSubject] = useState(`Shipment Documents — Container ${containerNumber}`);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);

  const handleSend = async () => {
    if (!toEmail) return;
    setSending(true);
    try {
      const result = await emailDocuments(containerId, {
        to_email: toEmail,
        subject,
        message: message || undefined,
      });
      showToast("success", t("detail.emailSent", { count: result.documents_sent, to: toEmail }));
      onClose();
    } catch {
      showToast("error", t("detail.emailFailed"));
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">{t("detail.emailTitle")}</h3>

        <div className="space-y-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">{t("detail.emailTo")}</label>
            <input
              type="email"
              value={toEmail}
              onChange={(e) => setToEmail(e.target.value)}
              className="border rounded px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">{t("detail.emailSubject")}</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="border rounded px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">{t("detail.emailMessage")}</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              placeholder={t("detail.emailMessagePlaceholder")}
              className="border rounded px-3 py-2 text-sm w-full focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>
          <p className="text-xs text-gray-400">
            {t("detail.emailAttachments", { count: docCount })}
          </p>
        </div>

        <div className="flex gap-3 mt-5">
          <button
            onClick={onClose}
            className="flex-1 border rounded px-4 py-2 text-sm text-gray-600 hover:bg-gray-50"
          >
            {t("common:actions.cancel")}
          </button>
          <button
            onClick={handleSend}
            disabled={sending || !toEmail}
            className="flex-1 bg-blue-600 text-white rounded px-4 py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {sending ? t("detail.sending") : t("detail.send")}
          </button>
        </div>
      </div>
    </div>
  );
}
