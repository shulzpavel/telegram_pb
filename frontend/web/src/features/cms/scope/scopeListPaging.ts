import { useCallback, useEffect, useMemo, useState } from "react";

export const SCOPE_LIST_PAGE_SIZE = 10;

function itemIdentity(item: unknown, index: number): string {
  if (item && typeof item === "object") {
    const record = item as Record<string, unknown>;
    if (typeof record.key === "string" && record.key) return record.key;
    if (typeof record.id === "string" && record.id) return record.id;
    if (typeof record.at === "string" && record.at) return record.at;
  }
  return `#${index}`;
}

/** Stable key for the full dataset — ignores array reference and display order. */
export function listDatasetKey(items: unknown[]): string {
  if (items.length === 0) return "";
  return items
    .map((item, index) => itemIdentity(item, index))
    .slice()
    .sort()
    .join("\n");
}

export function useIncrementalList<T>(items: T[], pageSize = SCOPE_LIST_PAGE_SIZE) {
  const [visibleCount, setVisibleCount] = useState(pageSize);
  const total = items.length;
  const datasetKey = useMemo(() => listDatasetKey(items), [items]);

  useEffect(() => {
    setVisibleCount(pageSize);
  }, [datasetKey, pageSize]);

  const visibleItems = useMemo(() => items.slice(0, visibleCount), [items, visibleCount]);
  const hasMore = visibleCount < total;
  const loadMore = useCallback(() => {
    setVisibleCount((current) => Math.min(current + pageSize, total));
  }, [pageSize, total]);

  return {
    visibleItems,
    hasMore,
    loadMore,
    loadedCount: visibleItems.length,
    total,
  };
}
