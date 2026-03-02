import { useTranslation } from "react-i18next";
import { useCallback, useMemo } from "react";

interface PermissionGroup {
  group: string;
  permissions: string[];
}

type NormalProps = {
  groups: PermissionGroup[];
  selected: string[];
  onChange: (permissions: string[]) => void;
  mode?: "normal";
};

type OverrideProps = {
  groups: PermissionGroup[];
  basePermissions: string[];
  overrides: Record<string, boolean>;
  onOverrideChange: (overrides: Record<string, boolean>) => void;
  mode: "override";
};

type Props = NormalProps | OverrideProps;

/** Extract the action part from a permission string (e.g. "batch.read" -> "Read") */
function formatAction(permission: string): string {
  const action = permission.includes(".")
    ? permission.split(".").pop()!
    : permission;
  return action.charAt(0).toUpperCase() + action.slice(1);
}

// --- Tri-state checkbox for override mode ---

type OverrideState = "inherited" | "granted" | "revoked";

function TriStateCheckbox({
  state,
  baseIncluded,
  onClick,
}: {
  state: OverrideState;
  baseIncluded: boolean;
  onClick: () => void;
}) {
  if (state === "granted") {
    return (
      <button
        type="button"
        onClick={onClick}
        className="w-5 h-5 rounded border-2 border-green-500 bg-green-50 flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-green-300"
        title="Explicitly granted (click to revoke)"
      >
        <svg
          className="w-3.5 h-3.5 text-green-600"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={3}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M5 13l4 4L19 7"
          />
        </svg>
      </button>
    );
  }

  if (state === "revoked") {
    return (
      <button
        type="button"
        onClick={onClick}
        className="w-5 h-5 rounded border-2 border-red-500 bg-red-50 flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-red-300"
        title="Explicitly revoked (click to clear override)"
      >
        <svg
          className="w-3.5 h-3.5 text-red-600"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={3}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M6 18L18 6M6 6l12 12"
          />
        </svg>
      </button>
    );
  }

  // inherited
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-5 h-5 rounded border-2 flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-gray-300 ${
        baseIncluded
          ? "border-gray-400 bg-gray-100"
          : "border-gray-300 bg-white"
      }`}
      title={
        baseIncluded
          ? "Inherited from role (click to override)"
          : "Not in role (click to grant)"
      }
    >
      {baseIncluded && (
        <svg
          className="w-3.5 h-3.5 text-gray-400"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M5 13l4 4L19 7"
          />
        </svg>
      )}
    </button>
  );
}

// --- Main component ---

export default function PermissionMatrix(props: Props) {
  const { t } = useTranslation("admin");
  const { groups, mode = "normal" } = props;

  // Normal mode helpers
  const selectedSet = useMemo(
    () =>
      mode === "normal"
        ? new Set((props as NormalProps).selected)
        : new Set<string>(),
    [mode, mode === "normal" ? (props as NormalProps).selected : null],
  );

  const handleToggle = useCallback(
    (permission: string) => {
      if (mode !== "normal") return;
      const p = props as NormalProps;
      const next = selectedSet.has(permission)
        ? p.selected.filter((s) => s !== permission)
        : [...p.selected, permission];
      p.onChange(next);
    },
    [mode, selectedSet, mode === "normal" ? (props as NormalProps).selected : null],
  );

  const handleGroupToggle = useCallback(
    (groupPerms: string[]) => {
      if (mode !== "normal") return;
      const p = props as NormalProps;
      const allSelected = groupPerms.every((perm) => selectedSet.has(perm));
      let next: string[];
      if (allSelected) {
        const removeSet = new Set(groupPerms);
        next = p.selected.filter((s) => !removeSet.has(s));
      } else {
        const addSet = new Set(p.selected);
        groupPerms.forEach((perm) => addSet.add(perm));
        next = Array.from(addSet);
      }
      p.onChange(next);
    },
    [mode, selectedSet, mode === "normal" ? (props as NormalProps).selected : null],
  );

  // Override mode helpers
  const baseSet = useMemo(
    () =>
      mode === "override"
        ? new Set((props as OverrideProps).basePermissions)
        : new Set<string>(),
    [mode, mode === "override" ? (props as OverrideProps).basePermissions : null],
  );

  const handleOverrideCycle = useCallback(
    (permission: string) => {
      if (mode !== "override") return;
      const p = props as OverrideProps;
      const current = p.overrides[permission];
      const next = { ...p.overrides };

      if (current === undefined) {
        // inherited -> granted
        next[permission] = true;
      } else if (current === true) {
        // granted -> revoked
        next[permission] = false;
      } else {
        // revoked -> inherited (remove override)
        delete next[permission];
      }

      p.onOverrideChange(next);
    },
    [mode, mode === "override" ? (props as OverrideProps).overrides : null],
  );

  function getOverrideState(permission: string): OverrideState {
    if (mode !== "override") return "inherited";
    const p = props as OverrideProps;
    const override = p.overrides[permission];
    if (override === true) return "granted";
    if (override === false) return "revoked";
    return "inherited";
  }

  return (
    <div className="space-y-4">
      {groups.map(({ group, permissions }) => {
        const allSelected =
          mode === "normal" &&
          permissions.every((perm) => selectedSet.has(perm));
        const someSelected =
          mode === "normal" &&
          !allSelected &&
          permissions.some((perm) => selectedSet.has(perm));

        return (
          <div
            key={group}
            className="border border-gray-200 rounded-lg overflow-hidden"
          >
            {/* Group header */}
            <div className="flex items-center gap-3 px-4 py-2.5 bg-gray-50 border-b border-gray-200">
              {mode === "normal" && (
                <input
                  type="checkbox"
                  checked={allSelected}
                  ref={(el) => {
                    if (el) el.indeterminate = someSelected;
                  }}
                  onChange={() => handleGroupToggle(permissions)}
                  className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
              )}
              <span className="text-sm font-semibold text-gray-700">
                {t(`permissionGroups.${group}`, group)}
              </span>
              <span className="text-xs text-gray-400 ml-auto">
                {mode === "normal"
                  ? `${permissions.filter((p) => selectedSet.has(p)).length}/${permissions.length}`
                  : `${permissions.length} ${permissions.length === 1 ? "permission" : "permissions"}`}
              </span>
            </div>

            {/* Permissions grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-0">
              {permissions.map((perm) => {
                const isSelected = selectedSet.has(perm);
                const overrideState = getOverrideState(perm);
                const baseIncluded = baseSet.has(perm);

                return (
                  <label
                    key={perm}
                    className={`flex items-center gap-2.5 px-4 py-2 text-sm cursor-pointer transition-colors border-b border-r border-gray-100 ${
                      mode === "normal"
                        ? isSelected
                          ? "bg-blue-50/50 text-gray-800"
                          : "text-gray-600 hover:bg-gray-50"
                        : overrideState === "granted"
                          ? "bg-green-50/40 text-gray-800"
                          : overrideState === "revoked"
                            ? "bg-red-50/40 text-gray-500 line-through"
                            : "text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    {mode === "normal" ? (
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleToggle(perm)}
                        className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                    ) : (
                      <TriStateCheckbox
                        state={overrideState}
                        baseIncluded={baseIncluded}
                        onClick={() => handleOverrideCycle(perm)}
                      />
                    )}
                    <span>{formatAction(perm)}</span>
                    {mode === "override" && overrideState === "inherited" && (
                      <span
                        className={`ml-auto text-xs ${baseIncluded ? "text-gray-400" : "text-gray-300"}`}
                      >
                        {baseIncluded ? "from role" : "---"}
                      </span>
                    )}
                    {mode === "override" && overrideState === "granted" && (
                      <span className="ml-auto text-xs text-green-600">
                        override
                      </span>
                    )}
                    {mode === "override" && overrideState === "revoked" && (
                      <span className="ml-auto text-xs text-red-500">
                        revoked
                      </span>
                    )}
                  </label>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
