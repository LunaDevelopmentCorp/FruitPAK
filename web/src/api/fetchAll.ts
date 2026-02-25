import api from "./client";

interface PaginatedResponse<T> {
  items: T[];
  total: number;
  limit: number;
  offset: number;
}

/**
 * Fetch all pages of a paginated endpoint.
 * Returns { items, total } with all records loaded.
 */
export async function fetchAllPages<T>(
  url: string,
  params?: Record<string, string>,
  pageSize = 200
): Promise<{ items: T[]; total: number }> {
  const first = await api.get<PaginatedResponse<T>>(url, {
    params: { ...params, limit: String(pageSize), offset: "0" },
  });
  const { items, total } = first.data;

  if (total <= pageSize) {
    return { items, total };
  }

  // Fetch remaining pages in parallel
  const pages = Math.ceil(total / pageSize);
  const remaining = await Promise.all(
    Array.from({ length: pages - 1 }, (_, i) =>
      api.get<PaginatedResponse<T>>(url, {
        params: { ...params, limit: String(pageSize), offset: String((i + 1) * pageSize) },
      })
    )
  );

  let all = items;
  for (const page of remaining) {
    all = all.concat(page.data.items);
  }

  return { items: all, total };
}
