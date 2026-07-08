import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  useAdminFetch,
  AdminFetchError,
  type UseAdminFetchOptions,
} from './useAdminFetch';

/**
 * Standardised read hook for admin list/detail endpoints.
 *
 * Eliminates the repeated `useState(loading/error/total/offset)` +
 * `useEffect(fetch)` boilerplate found across ~40 admin pages. Built on top of
 * `adminFetchJson`, so it inherits the Bearer header and the 401 redirect.
 *
 * Key guarantees:
 * - An `AbortController` cancels the in-flight request whenever the resolved URL
 *   changes (filters, pagination, debounced query), so stale responses can never
 *   clobber fresh state (audit point #15).
 * - Pagination state (`offset` / `limit`) is owned by the hook; helpers
 *   (`nextPage`, `prevPage`, `setOffset`, `resetOffset`) keep it in sync.
 * - An optional `query` with debounce drives a `search` param and resets the
 *   offset on change.
 */

export type UseAdminResourceOptions<T, R = unknown> = UseAdminFetchOptions & {
  /**
   * Maps the raw API payload to the list of rows. Defaults to identity when the
   * payload is already an array. Provide this when the rows live under a key
   * (e.g. `(res) => res.comments`).
   */
  select?: (payload: R) => T[];
  /**
   * Reads the total count from the raw payload (for pagination). Defaults to
   * reading a numeric `total` field, falling back to `null`.
   */
  selectTotal?: (payload: R) => number | null;
  /**
   * Called with the raw payload on every successful fetch, after `data`/`total`
   * are set. Use it to capture extra fields that live alongside the row list in
   * the same response (aggregate stats, config values, …) without firing a
   * second request. Kept in a ref internally, so an inline callback never
   * retriggers a fetch.
   */
  onData?: (payload: R) => void;
  /** Page size. Default: 30. */
  limit?: number;
  /** Initial offset. Default: 0. */
  initialOffset?: number;
  /**
   * Free-text search term. When provided it is sent as the `search` query param
   * (after `debounceMs`), and any change resets the offset to 0.
   */
  query?: string;
  /** Debounce applied to `query` before it triggers a refetch. Default: 300ms. */
  debounceMs?: number;
  /** Name of the search query param. Default: `'search'`. */
  searchParam?: string;
  /** Extra static query params merged into every request. */
  params?: Record<string, string | number | boolean | null | undefined>;
  /**
   * When true, appends `includeTotal=1`. Many admin endpoints gate the COUNT
   * behind this flag. Default: true.
   */
  includeTotal?: boolean;
  /** When false, no request is fired (e.g. waiting on a dependency). Default: true. */
  enabled?: boolean;
};

export type UseAdminResourceResult<T> = {
  data: T[];
  total: number | null;
  loading: boolean;
  error: string | null;
  /** Re-runs the current request (e.g. after a mutation). */
  refresh: () => void;
  /**
   * Locally patches the current rows for optimistic UI (e.g. drag reorder before
   * persistence). Accepts the next array or an updater. The value is authoritative
   * only until the next successful fetch, which overwrites it — pair an optimistic
   * `mutate` with `refresh()` on failure to roll back.
   */
  mutate: (next: T[] | ((prev: T[]) => T[])) => void;
  offset: number;
  limit: number;
  setOffset: (offset: number) => void;
  nextPage: () => void;
  prevPage: () => void;
  resetOffset: () => void;
  /** True when there is a known total and more rows follow the current page. */
  hasMore: boolean;
};

function defaultSelect<T, R>(payload: R): T[] {
  return Array.isArray(payload) ? (payload as unknown as T[]) : [];
}

function defaultSelectTotal<R>(payload: R): number | null {
  if (payload && typeof payload === 'object' && 'total' in payload) {
    const t = (payload as { total: unknown }).total;
    return typeof t === 'number' ? t : null;
  }
  return null;
}

export function useAdminResource<T, R = unknown>(
  /** Base endpoint, without query string (e.g. `/api/admin/comments`). */
  url: string,
  options: UseAdminResourceOptions<T, R> = {}
): UseAdminResourceResult<T> {
  const {
    select,
    selectTotal,
    onData,
    limit = 30,
    initialOffset = 0,
    query,
    debounceMs = 300,
    searchParam = 'search',
    params,
    includeTotal = true,
    enabled = true,
    loginPath,
  } = options;

  const { adminFetchJson } = useAdminFetch({ loginPath });

  const [data, setData] = useState<T[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffsetState] = useState(initialOffset);
  const [debouncedQuery, setDebouncedQuery] = useState(query ?? '');
  // Bumped by refresh() to force a re-run without changing the URL.
  const [refreshTick, setRefreshTick] = useState(0);

  // Keep mapper refs stable so inline-defined selectors don't retrigger fetches.
  const selectRef = useRef(select);
  const selectTotalRef = useRef(selectTotal);
  const onDataRef = useRef(onData);
  useEffect(() => {
    selectRef.current = select;
    selectTotalRef.current = selectTotal;
    onDataRef.current = onData;
  });

  // Debounce the search query and reset pagination when it changes.
  useEffect(() => {
    const next = query ?? '';
    const handle = setTimeout(() => {
      setDebouncedQuery((prev) => {
        if (prev !== next) setOffsetState(0);
        return next;
      });
    }, debounceMs);
    return () => clearTimeout(handle);
  }, [query, debounceMs]);

  // Serialise static params to a stable dependency.
  const paramsKey = useMemo(() => JSON.stringify(params ?? {}), [params]);

  const resolvedUrl = useMemo(() => {
    const sp = new URLSearchParams();
    sp.set('limit', String(limit));
    sp.set('offset', String(offset));
    if (includeTotal) sp.set('includeTotal', '1');

    const trimmed = debouncedQuery.trim();
    if (trimmed) sp.set(searchParam, trimmed);

    const staticParams = JSON.parse(paramsKey) as Record<string, unknown>;
    for (const [key, value] of Object.entries(staticParams)) {
      if (value === null || value === undefined || value === '') continue;
      sp.set(key, String(value));
    }

    const qs = sp.toString();
    return qs ? `${url}?${qs}` : url;
  }, [
    url,
    limit,
    offset,
    includeTotal,
    debouncedQuery,
    searchParam,
    paramsKey,
  ]);

  useEffect(() => {
    if (!enabled) return;

    const controller = new AbortController();
    let active = true;

    setLoading(true);
    setError(null);

    adminFetchJson<R>(resolvedUrl, { signal: controller.signal })
      .then((payload) => {
        if (!active) return;
        const mapSelect = selectRef.current ?? defaultSelect<T, R>;
        const mapTotal = selectTotalRef.current ?? defaultSelectTotal<R>;
        setData(mapSelect(payload));
        setTotal(mapTotal(payload));
        onDataRef.current?.(payload);
      })
      .catch((err: unknown) => {
        // Aborted requests are expected churn, not errors.
        if (controller.signal.aborted) return;
        if (err instanceof DOMException && err.name === 'AbortError') return;
        if (!active) return;
        const message =
          err instanceof AdminFetchError || err instanceof Error
            ? err.message
            : 'Erreur de chargement';
        setError(message);
      })
      .finally(() => {
        if (active && !controller.signal.aborted) setLoading(false);
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [adminFetchJson, resolvedUrl, enabled, refreshTick]);

  const refresh = useCallback(() => setRefreshTick((t) => t + 1), []);
  const setOffset = useCallback((next: number) => {
    setOffsetState(Math.max(0, next));
  }, []);
  const nextPage = useCallback(() => {
    setOffsetState((prev) => prev + limit);
  }, [limit]);
  const prevPage = useCallback(() => {
    setOffsetState((prev) => Math.max(0, prev - limit));
  }, [limit]);
  const resetOffset = useCallback(() => setOffsetState(0), []);

  const hasMore = total !== null && offset + limit < total;

  return {
    data,
    total,
    loading,
    error,
    refresh,
    mutate: setData,
    offset,
    limit,
    setOffset,
    nextPage,
    prevPage,
    resetOffset,
    hasMore,
  };
}
