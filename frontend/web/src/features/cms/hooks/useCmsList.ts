import { useCallback } from "react";
import { useProgressiveList } from "../../../hooks/useProgressiveList";
import type { ProgressiveListResult } from "../../../hooks/useProgressiveList";
import type { ParamValue } from "../../../shared/types/pagination";
import { cmsList } from "../api/cmsClient";

interface UseCmsListOptions {
  /** Soft cap — null disables. Default 200, mirroring `useProgressiveList`. */
  softCap?: number | null;
  /** Page size; defaults to backend-imposed default. */
  pageSize?: number;
  /** Stable identifier for sessionStorage scroll restoration. */
  scrollKey?: string;
}

export interface UseCmsListResult<T> extends ProgressiveListResult<T> {}

/**
 * Thin wrapper around `useProgressiveList` for CMS list endpoints. Keeps the
 * historical `cmsList<T>` contract (cursor-only pagination), and forwards
 * AbortSignal cancellation through `cmsList` -> `cmsFetch` -> `requestJson`.
 *
 * Backwards-compat: the returned shape still exposes
 * `items / cursor / loading / error / reload / loadMore`. New consumers
 * should prefer `loadingMore`, `hasMore`, `reachedCap`, and `total`.
 */
export function useCmsList<T>(
  path: string,
  params: Record<string, ParamValue>,
  options: UseCmsListOptions = {},
): UseCmsListResult<T> {
  const fetchPage = useCallback(
    async ({
      cursor,
      params: pageParams,
      signal,
    }: {
      cursor: string | null;
      limit: number;
      params: Record<string, ParamValue>;
      signal: AbortSignal;
    }) => {
      const page = await cmsList<T>(path, pageParams, cursor, { signal });
      return {
        items: page.items,
        next_cursor: page.next_cursor,
        total: page.total ?? null,
      };
    },
    [path],
  );

  return useProgressiveList<T, Record<string, ParamValue>>(fetchPage, params, {
    pageSize: options.pageSize,
    softCap: options.softCap,
    scrollKey: options.scrollKey,
  });
}
