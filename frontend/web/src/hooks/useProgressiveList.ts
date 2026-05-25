import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

/**
 * Progressive list hook. Renders the first page, kicks off a prefetch of the
 * second page in the background and returns it instantly when the user clicks
 * "load more". When the list grows past `softCap` items further loading is
 * blocked and the consumer is expected to show a "refine your search" hint.
 *
 * Optionally restores scroll position via `sessionStorage` keyed by `scrollKey`
 * — useful for "list → detail → back to list" flows where we want the user
 * to land on the row they came from.
 *
 * Cancellation: in-flight requests are aborted on unmount and on params
 * change; `fetchPage` should forward the provided `signal` to the underlying
 * fetch call. If it does not, we still ignore the response via a request seq
 * counter, so we never apply stale data.
 */

export interface ProgressiveListPage<T> {
  items: T[];
  next_cursor: string | null;
  total?: number | null;
}

export interface ProgressiveFetchArgs<TParams> {
  cursor: string | null;
  limit: number;
  params: TParams;
  signal: AbortSignal;
}

export type ProgressiveFetcher<T, TParams> = (
  args: ProgressiveFetchArgs<TParams>,
) => Promise<ProgressiveListPage<T>>;

export interface ProgressiveListSeed<T> {
  items: T[];
  nextCursor: string | null;
  total?: number | null;
}

export interface ProgressiveListOptions<T> {
  /** Page size to request and treat as the prefetch chunk. Default 20. */
  pageSize?: number;
  /**
   * Stop auto-loading after the visible list grows past this many items.
   * `null` disables the cap entirely. Default 200 — chosen to keep DOM size
   * modest on commodity laptops without virtualization.
   */
  softCap?: number | null;
  /** Disable automatic loading entirely (e.g. while auth is pending). */
  enabled?: boolean;
  /**
   * Stable identifier for sessionStorage scroll restoration. Different keys
   * for different list views (`cms-sessions`, `manager-history-${chatId}`).
   * Pass undefined to disable.
   */
  scrollKey?: string;
  /**
   * Optional pre-loaded first page. When the parent has already fetched the
   * first page through a different endpoint (e.g. session summary), we seed
   * the hook with it instead of paying for a duplicate request.
   */
  seed?: ProgressiveListSeed<T> | null;
  /** scrollY/itemsLength target keyed in sessionStorage. */
  enableScrollRestore?: boolean;
}

export interface ProgressiveListResult<T> {
  items: T[];
  /**
   * Cursor that would fetch the *next* page; `null` when exhausted. Exposed
   * mostly for backwards-compatibility with the original `useCmsList` —
   * prefer `hasMore` for "is there a next page".
   */
  cursor: string | null;
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  hasMore: boolean;
  reachedCap: boolean;
  total: number | null;
  /** Re-fetches from scratch, forgetting the prefetch cache and cap. */
  reload: () => Promise<void>;
  /**
   * Append the next page. If the page is already prefetched it is committed
   * synchronously and the function still returns a Promise (resolved next
   * tick) so callers can `await` it uniformly.
   */
  loadMore: () => Promise<void>;
}

interface InternalState<T> {
  items: T[];
  cursor: string | null;
  total: number | null;
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  reachedCap: boolean;
}

interface PrefetchEntry<T> {
  /** Cursor that produced this prefetched page. */
  forCursor: string;
  items: T[];
  nextCursor: string | null;
  total: number | null;
}

interface ScrollRecord {
  paramsKey: string;
  scrollY: number;
  itemsLength: number;
}

const SCROLL_PREFIX = "pl-scroll:";

function readScrollRecord(key: string | undefined, paramsKey: string): ScrollRecord | null {
  if (!key || typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(SCROLL_PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ScrollRecord>;
    if (
      typeof parsed.scrollY !== "number" ||
      typeof parsed.itemsLength !== "number" ||
      parsed.paramsKey !== paramsKey
    ) {
      return null;
    }
    return { paramsKey, scrollY: parsed.scrollY, itemsLength: parsed.itemsLength };
  } catch {
    return null;
  }
}

function writeScrollRecord(key: string | undefined, record: ScrollRecord): void {
  if (!key || typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(SCROLL_PREFIX + key, JSON.stringify(record));
  } catch {
    /* sessionStorage unavailable (private mode, quota) — best effort only. */
  }
}

function clearScrollRecord(key: string | undefined): void {
  if (!key || typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(SCROLL_PREFIX + key);
  } catch {
    /* ignored */
  }
}

export function isCapped(itemsLength: number, softCap: number | null | undefined): boolean {
  if (softCap === null || softCap === undefined) return false;
  return itemsLength >= softCap;
}

export function applyPage<T>(
  state: InternalState<T>,
  page: ProgressiveListPage<T>,
  replace: boolean,
  softCap: number | null,
): InternalState<T> {
  const items = replace ? page.items : [...state.items, ...page.items];
  return {
    items,
    cursor: page.next_cursor,
    total: page.total ?? null,
    loading: false,
    loadingMore: false,
    error: null,
    reachedCap: isCapped(items.length, softCap),
  };
}

function seedAsResult<T>(seed: ProgressiveListSeed<T>, softCap: number | null): InternalState<T> {
  return {
    items: seed.items,
    cursor: seed.nextCursor,
    total: seed.total ?? null,
    loading: false,
    loadingMore: false,
    error: null,
    reachedCap: isCapped(seed.items.length, softCap),
  };
}

export function useProgressiveList<T, TParams>(
  fetchPage: ProgressiveFetcher<T, TParams>,
  params: TParams,
  options: ProgressiveListOptions<T> = {},
): ProgressiveListResult<T> {
  const {
    pageSize = 20,
    softCap = 200,
    enabled = true,
    scrollKey,
    seed,
    enableScrollRestore = Boolean(scrollKey),
  } = options;
  const cap = softCap ?? null;
  const paramsKey = useMemo(() => JSON.stringify(params), [params]);

  // Hold the seed so we don't re-apply it after a manual reload.
  const seedRef = useRef<ProgressiveListSeed<T> | null>(
    seed ? { items: seed.items, nextCursor: seed.nextCursor, total: seed.total ?? null } : null,
  );
  // Refresh seedRef whenever the caller passes a new seed object — but we
  // only consume it on the very first load for a paramsKey.
  useEffect(() => {
    seedRef.current = seed
      ? { items: seed.items, nextCursor: seed.nextCursor, total: seed.total ?? null }
      : null;
  }, [seed]);

  const [state, setState] = useState<InternalState<T>>(() => {
    if (seedRef.current) return seedAsResult(seedRef.current, cap);
    return {
      items: [],
      cursor: null,
      total: null,
      loading: enabled,
      loadingMore: false,
      error: null,
      reachedCap: false,
    };
  });

  const fetchPageRef = useRef(fetchPage);
  useEffect(() => {
    fetchPageRef.current = fetchPage;
  }, [fetchPage]);

  // Latest paramsKey + serialized params — captured on every render so that
  // async closures see the freshest values without re-creating callbacks.
  const paramsRef = useRef<{ key: string; value: TParams }>({ key: paramsKey, value: params });
  paramsRef.current = { key: paramsKey, value: params };

  // Per-paramsKey monotonic request id; older replies are discarded if a
  // newer one is in-flight. Reset whenever the params signature changes.
  const requestSeqRef = useRef(0);
  // Tracks the AbortController for the most recent in-flight foreground
  // request so we can cancel it on unmount or params change.
  const abortRef = useRef<AbortController | null>(null);
  // Background prefetch is fully separate — it uses its own controller and
  // its own seq, so racing against the foreground load doesn't spuriously
  // void the prefetched page.
  const prefetchAbortRef = useRef<AbortController | null>(null);
  const prefetchSeqRef = useRef(0);

  // Cached prefetched page keyed by the cursor that produced it. We only
  // honor it if the cursor still matches state.cursor at consumption time.
  const prefetchedRef = useRef<PrefetchEntry<T> | null>(null);

  // Scroll restore target — captured once per mount so we know to keep
  // loading until we've covered the saved itemsLength.
  const restoreRef = useRef<ScrollRecord | null>(
    enableScrollRestore ? readScrollRecord(scrollKey, paramsKey) : null,
  );

  // Mirror of `state` for use inside async callbacks without re-binding the
  // callback identity. Updates synchronously after every setState.
  const stateRef = useRef(state);
  stateRef.current = state;

  const cancelInflight = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    prefetchAbortRef.current?.abort();
    prefetchAbortRef.current = null;
    prefetchedRef.current = null;
    prefetchSeqRef.current += 1;
  }, []);

  const startPrefetch = useCallback(
    (cursor: string | null, originParamsKey: string) => {
      if (cursor === null) return;
      // Don't prefetch past the cap — we wouldn't be allowed to commit it.
      if (isCapped(stateRef.current.items.length, cap)) return;
      // Already cached for this exact cursor — nothing to do.
      if (prefetchedRef.current && prefetchedRef.current.forCursor === cursor) return;

      const seq = ++prefetchSeqRef.current;
      const controller = new AbortController();
      prefetchAbortRef.current = controller;

      void (async () => {
        try {
          const page = await fetchPageRef.current({
            cursor,
            limit: pageSize,
            params: paramsRef.current.value,
            signal: controller.signal,
          });
          if (
            seq !== prefetchSeqRef.current ||
            paramsRef.current.key !== originParamsKey
          ) {
            return;
          }
          prefetchedRef.current = {
            forCursor: cursor,
            items: page.items,
            nextCursor: page.next_cursor,
            total: page.total ?? null,
          };
        } catch {
          // Prefetch failures are silent — the next foreground loadMore
          // will retry through the regular path.
          if (seq === prefetchSeqRef.current) {
            prefetchedRef.current = null;
          }
        }
      })();
    },
    [cap, pageSize],
  );

  const load = useCallback(
    async (mode: "first" | "more"): Promise<void> => {
      if (!enabled) return;
      const originParamsKey = paramsRef.current.key;
      const seq = ++requestSeqRef.current;
      // Cancel any older foreground request.
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const replace = mode === "first";
      const cursor = replace ? null : stateRef.current.cursor;

      if (mode === "more" && cursor === null) return;
      if (mode === "more" && stateRef.current.reachedCap) return;

      // Reset prefetch cache when starting a fresh first load.
      if (replace) {
        prefetchedRef.current = null;
        prefetchAbortRef.current?.abort();
        prefetchAbortRef.current = null;
        prefetchSeqRef.current += 1;
      }

      setState((current) => ({
        ...(replace ? { ...current, items: [], cursor: null, total: null, reachedCap: false } : current),
        loading: replace ? true : current.loading,
        loadingMore: !replace,
        error: null,
      }));

      try {
        const page = await fetchPageRef.current({
          cursor,
          limit: pageSize,
          params: paramsRef.current.value,
          signal: controller.signal,
        });
        if (seq !== requestSeqRef.current || paramsRef.current.key !== originParamsKey) return;
        setState((current) => applyPage(current, page, replace, cap));
        // After a successful first or more load, fire-and-forget prefetch
        // the *next* page so loadMore can be served instantly later.
        if (page.next_cursor && !isCapped(stateRef.current.items.length + page.items.length, cap)) {
          startPrefetch(page.next_cursor, originParamsKey);
        }
      } catch (err) {
        if (seq !== requestSeqRef.current) return;
        if (controller.signal.aborted) return;
        const message = err instanceof Error ? err.message : "Request failed";
        setState((current) => ({ ...current, loading: false, loadingMore: false, error: message }));
      }
    },
    [cap, enabled, pageSize, startPrefetch],
  );

  // Effect: react to paramsKey/enabled changes. Resets state and triggers a
  // first load — unless we have an unconsumed seed that matches the current
  // paramsKey, in which case we keep the seeded items and only kick off the
  // prefetch.
  const isFirstRunRef = useRef(true);
  useEffect(() => {
    if (!enabled) {
      cancelInflight();
      return;
    }
    const firstRun = isFirstRunRef.current;
    isFirstRunRef.current = false;
    if (firstRun && seedRef.current) {
      // Already seeded into initial state. Just kick off prefetch.
      const seeded = seedRef.current;
      seedRef.current = null;
      if (seeded.nextCursor) startPrefetch(seeded.nextCursor, paramsKey);
      return;
    }
    // Drop any stale seed so subsequent param changes always re-fetch.
    seedRef.current = null;
    void load("first");
    return () => {
      // Reset scroll restore target on unmount to avoid leaking stale data.
    };
    // load is paramsKey-stable via paramsRef; including paramsKey reruns the
    // effect on filter changes, which is exactly what we want.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, paramsKey]);

  // Auto-load extra pages on mount until we cover the saved scroll position.
  // Each loop iteration is a regular loadMore — when there are no more
  // pages, `hasMore` flips false and we bail out.
  useEffect(() => {
    if (!restoreRef.current) return;
    const target = restoreRef.current.itemsLength;
    if (state.items.length >= target) return;
    if (state.loading || state.loadingMore) return;
    if (!state.cursor || state.reachedCap) {
      restoreRef.current = null;
      return;
    }
    void load("more");
  }, [load, state.cursor, state.items.length, state.loading, state.loadingMore, state.reachedCap]);

  // Restore scroll position once we've loaded at least as many items as
  // were saved. Use useLayoutEffect so the restoration happens before paint.
  const restoredRef = useRef(false);
  useLayoutEffect(() => {
    if (restoredRef.current) return;
    const record = restoreRef.current;
    if (!record) return;
    if (state.items.length < record.itemsLength) return;
    restoredRef.current = true;
    if (typeof window !== "undefined") {
      window.scrollTo(0, record.scrollY);
    }
    restoreRef.current = null;
  }, [state.items.length]);

  // Persist scroll position on unmount (and whenever items change while the
  // saved record is stale, to keep it fresh between renders).
  const persistRef = useRef<{ scrollKey: string | undefined; paramsKey: string }>({
    scrollKey,
    paramsKey,
  });
  persistRef.current = { scrollKey, paramsKey };
  useEffect(() => {
    return () => {
      cancelInflight();
      const ctx = persistRef.current;
      if (!ctx.scrollKey || !enableScrollRestore || typeof window === "undefined") return;
      const length = stateRef.current.items.length;
      if (length === 0) {
        clearScrollRecord(ctx.scrollKey);
        return;
      }
      writeScrollRecord(ctx.scrollKey, {
        paramsKey: ctx.paramsKey,
        scrollY: window.scrollY,
        itemsLength: length,
      });
    };
    // We deliberately want this teardown to run once on unmount. Effects
    // tracking `paramsKey`/`scrollKey` would clobber the saved record on
    // every search keystroke, defeating restoration.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const reload = useCallback(async () => {
    seedRef.current = null;
    clearScrollRecord(scrollKey);
    restoreRef.current = null;
    restoredRef.current = false;
    await load("first");
  }, [load, scrollKey]);

  const loadMore = useCallback(async () => {
    if (!enabled) return;
    const current = stateRef.current;
    if (current.loadingMore || current.loading) return;
    if (current.reachedCap) return;
    if (current.cursor === null) return;

    const cached = prefetchedRef.current;
    if (cached && cached.forCursor === current.cursor) {
      // Synchronous commit of the prefetched page — this is what makes the
      // "load more" click feel instantaneous.
      prefetchedRef.current = null;
      setState((s) => applyPage(s, { items: cached.items, next_cursor: cached.nextCursor, total: cached.total }, false, cap));
      // Kick off the next prefetch after the just-committed cursor.
      if (cached.nextCursor) {
        const newLength = current.items.length + cached.items.length;
        if (!isCapped(newLength, cap)) {
          startPrefetch(cached.nextCursor, paramsRef.current.key);
        }
      }
      return;
    }
    await load("more");
  }, [cap, enabled, load, startPrefetch]);

  return {
    items: state.items,
    cursor: state.cursor,
    loading: state.loading,
    loadingMore: state.loadingMore,
    error: state.error,
    hasMore: state.cursor !== null && !state.reachedCap,
    reachedCap: state.reachedCap,
    total: state.total,
    reload,
    loadMore,
  };
}
