import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAuthStore } from "../store/authStore";
import { usePackhouseStore } from "../store/packhouseStore";
import { listPackhouses, type Packhouse } from "../api/batches";

export default function PackhousePicker() {
  const { t } = useTranslation("common");
  const user = useAuthStore((s) => s.user);
  const currentId = usePackhouseStore((s) => s.currentPackhouseId);
  const setPackhouse = usePackhouseStore((s) => s.setPackhouse);
  const [packhouses, setPackhouses] = useState<Packhouse[]>([]);

  useEffect(() => {
    listPackhouses()
      .then(setPackhouses)
      .catch(() => {});
  }, []);

  // Auto-select: if user has exactly 1 assigned packhouse, lock to it
  useEffect(() => {
    if (!user) return;
    const assigned = user.assigned_packhouses;
    if (assigned && assigned.length === 1 && currentId !== assigned[0]) {
      setPackhouse(assigned[0]);
    }
  }, [user, currentId, setPackhouse]);

  // Validate stored selection is still valid
  useEffect(() => {
    if (!user || !packhouses.length) return;
    const assigned = user.assigned_packhouses;
    if (currentId) {
      const validIds = assigned
        ? assigned
        : packhouses.map((p) => p.id);
      if (!validIds.includes(currentId)) {
        setPackhouse(null);
      }
    }
  }, [user, packhouses, currentId, setPackhouse]);

  if (!user || !packhouses.length) return null;

  const assigned = user.assigned_packhouses;

  // Single packhouse user: show static name, no dropdown
  if (assigned && assigned.length === 1) {
    const ph = packhouses.find((p) => p.id === assigned[0]);
    return (
      <span className="text-xs text-gray-500 font-medium truncate max-w-[160px]">
        {ph?.name ?? "…"}
      </span>
    );
  }

  // Multiple or admin: show dropdown
  const options = assigned
    ? packhouses.filter((p) => assigned.includes(p.id))
    : packhouses;

  return (
    <select
      value={currentId ?? ""}
      onChange={(e) => setPackhouse(e.target.value || null)}
      className="text-xs border border-gray-200 rounded px-2 py-1 bg-white text-gray-700 focus:ring-1 focus:ring-green-500 focus:border-green-500 max-w-[200px]"
    >
      {/* "All" option only for admins (no assigned_packhouses restriction) */}
      {!assigned && (
        <option value="">{t("packhouse.allPackhouses")}</option>
      )}
      {options.map((ph) => (
        <option key={ph.id} value={ph.id}>
          {ph.name}
        </option>
      ))}
    </select>
  );
}
