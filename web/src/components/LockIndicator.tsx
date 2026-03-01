import { useTranslation } from "react-i18next";

/**
 * Small amber lock icon shown next to locked form fields.
 * Tooltip shows the reason and how to unlock.
 */
export default function LockIndicator({ reason }: { reason?: string }) {
  const { t } = useTranslation("common");
  return (
    <span
      className="inline-flex items-center text-amber-500 ml-1"
      title={reason || t("locks.fieldLocked")}
    >
      <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
        <path
          fillRule="evenodd"
          d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z"
          clipRule="evenodd"
        />
      </svg>
    </span>
  );
}

/**
 * Warning banner shown at the top of edit forms when fields are locked.
 */
export function LockBanner({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded text-amber-800 text-xs mb-3">
      <svg className="w-4 h-4 shrink-0" fill="currentColor" viewBox="0 0 20 20">
        <path
          fillRule="evenodd"
          d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z"
          clipRule="evenodd"
        />
      </svg>
      <span>{message}</span>
    </div>
  );
}
