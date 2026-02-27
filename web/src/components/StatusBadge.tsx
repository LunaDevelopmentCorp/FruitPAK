import { useTranslation } from "react-i18next";

const COLOR_MAP: Record<string, string> = {
  // Batch
  received: "bg-blue-50 text-blue-700",
  grading: "bg-purple-50 text-purple-700",
  packing: "bg-yellow-50 text-yellow-700",
  complete: "bg-green-50 text-green-700",
  rejected: "bg-red-50 text-red-700",
  // Pallet
  open: "bg-blue-50 text-blue-700",
  closed: "bg-gray-100 text-gray-600",
  stored: "bg-green-50 text-green-700",
  allocated: "bg-purple-50 text-purple-700",
  loaded: "bg-orange-50 text-orange-700",
  exported: "bg-gray-100 text-gray-600",
  // Container
  loading: "bg-yellow-50 text-yellow-700",
  sealed: "bg-blue-50 text-blue-700",
  dispatched: "bg-orange-50 text-orange-700",
  delivered: "bg-green-50 text-green-700",
  // Payment
  paid: "bg-green-50 text-green-700",
  pending: "bg-yellow-50 text-yellow-700",
  // Reconciliation
  acknowledged: "bg-blue-50 text-blue-700",
  resolved: "bg-green-50 text-green-700",
  dismissed: "bg-gray-100 text-gray-600",
  // Client
  active: "bg-green-50 text-green-700",
  inactive: "bg-gray-100 text-gray-600",
  // Shipping schedule
  scheduled: "bg-blue-50 text-blue-700",
  departed: "bg-orange-50 text-orange-700",
  arrived: "bg-green-50 text-green-700",
  cancelled: "bg-red-50 text-red-700",
};

interface Props {
  status: string;
  className?: string;
}

export default function StatusBadge({ status, className = "" }: Props) {
  const { t } = useTranslation("common");
  const colors = COLOR_MAP[status] || "bg-gray-100 text-gray-600";
  return (
    <span
      className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium capitalize ${colors} ${className}`}
    >
      {t(`status.${status}`, status)}
    </span>
  );
}
