import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ParamValue } from "../../../shared/types/pagination";
import { cmsList } from "../api/cmsClient";

export function useCmsList<T>(path: string, params: Record<string, ParamValue>) {
  const [items, setItems] = useState<T[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const paramsKey = useMemo(() => JSON.stringify(params), [params]);
  const requestSeq = useRef(0);

  const load = useCallback(
    async (nextCursor: string | null, replace: boolean) => {
      const requestId = requestSeq.current + 1;
      requestSeq.current = requestId;
      setLoading(true);
      setError(null);
      try {
        const page = await cmsList<T>(
          path,
          JSON.parse(paramsKey) as Record<string, ParamValue>,
          nextCursor
        );
        if (requestSeq.current !== requestId) return;
        setItems((current) => (replace ? page.items : [...current, ...page.items]));
        setCursor(page.next_cursor);
      } catch (err) {
        if (requestSeq.current !== requestId) return;
        setError(err instanceof Error ? err.message : "Request failed");
      } finally {
        if (requestSeq.current === requestId) {
          setLoading(false);
        }
      }
    },
    [paramsKey, path]
  );

  useEffect(() => {
    setItems([]);
    setCursor(null);
    void load(null, true);
  }, [load]);

  return {
    items,
    cursor,
    loading,
    error,
    reload: () => load(null, true),
    loadMore: () => load(cursor, false),
  };
}
