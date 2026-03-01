import { useCallback, useMemo, useState } from "react";

type SortDir = "asc" | "desc";

/**
 * Generic hook for sortable table columns.
 *
 * Usage:
 *   const { sortCol, sortDir, toggleSort, sortIndicator, sortRows } = useTableSort<Row>();
 *
 *   // In <th>:
 *   <th onClick={() => toggleSort("name")} className="cursor-pointer select-none">
 *     Name{sortIndicator("name")}
 *   </th>
 *
 *   // To sort data:
 *   const sorted = sortRows(rows, { name: r => r.name, age: r => r.age });
 */
export function useTableSort<_T = unknown>(defaultCol = "", defaultDir: SortDir = "asc") {
  const [sortCol, setSortCol] = useState(defaultCol);
  const [sortDir, setSortDir] = useState<SortDir>(defaultDir);

  const toggleSort = useCallback(
    (col: string) => {
      if (sortCol === col) {
        setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      } else {
        setSortCol(col);
        setSortDir("asc");
      }
    },
    [sortCol],
  );

  const sortIndicator = useCallback(
    (col: string) => (sortCol === col ? (sortDir === "asc" ? " ▲" : " ▼") : ""),
    [sortCol, sortDir],
  );

  const resetSort = useCallback(() => {
    setSortCol(defaultCol);
    setSortDir(defaultDir);
  }, [defaultCol, defaultDir]);

  return { sortCol, sortDir, toggleSort, sortIndicator, resetSort };
}

/** CSS classes for sortable <th> elements */
export const sortableThClass = "cursor-pointer hover:text-gray-700 select-none";

/**
 * Compare helper for sorting rows. Handles string/number/null/undefined.
 * Returns sorted copy of the array (does not mutate).
 */
export function sortRows<T>(
  rows: T[],
  sortCol: string,
  sortDir: SortDir,
  accessors: Record<string, (row: T) => string | number | null | undefined>,
): T[] {
  if (!sortCol || !accessors[sortCol]) return rows;
  const get = accessors[sortCol];
  return [...rows].sort((a, b) => {
    const va = get(a);
    const vb = get(b);
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    const cmp =
      typeof va === "string" && typeof vb === "string"
        ? va.localeCompare(vb, undefined, { numeric: true, sensitivity: "base" })
        : (va as number) - (vb as number);
    return sortDir === "asc" ? cmp : -cmp;
  });
}
