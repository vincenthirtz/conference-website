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
  /**
   * SSR hydration: initial rows for the first paint. When provided, the hook
   * seeds `data` (and `total` from `initialTotal`) with these values AND skips
   * the mount fetch — so an SSR-rendered list shows instantly with no flash and
   * no redundant client round-trip. A fetch only fires when the resolved URL
   * changes (filter / search / pagination) or `refresh()` is called.
   *
   * Omit this option and behaviour is identical to before (fetch on mount).
   */
  initialData?: T[];
  /**
   * SSR hydration: initial total to seed pagination alongside `initialData`.
   * Only read when `initialData` is provided. Defaults to `null`.
   */
  initialTotal?: number | null;
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

/**
 * Builds the resolved request URL (base + query string) from the pagination /
 * search / static params. Extracted as a pure function so the URL contract —
 * which is what decides whether a change should trigger a refetch — is unit
 * testable without a React renderer (the hook itself can't be tested in this
 * harness: no jsdom / @testing-library, forbidden by the zero-dependency
 * policy). The param ordering is stable: limit, offset, includeTotal, search,
 * then static params in insertion order.
 */
export function buildAdminResourceUrl(
  url: string,
  opts: {
    limit: number;
    offset: number;
    includeTotal: boolean;
    search?: string;
    searchParam?: string;
    params?: Record<string, string | number | boolean | null | undefined>;
  }
): string {
  const {
    limit,
    offset,
    includeTotal,
    search = '',
    searchParam = 'search',
    params,
  } = opts;

  const sp = new URLSearchParams();
  sp.set('limit', String(limit));
  sp.set('offset', String(offset));
  if (includeTotal) sp.set('includeTotal', '1');

  const trimmed = search.trim();
  if (trimmed) sp.set(searchParam, trimmed);

  for (const [key, value] of Object.entries(params ?? {})) {
    if (value === null || value === undefined || value === '') continue;
    sp.set(key, String(value));
  }

  const qs = sp.toString();
  return qs ? `${url}?${qs}` : url;
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
    initialData,
    initialTotal = null,
  } = options;

  const { adminFetchJson } = useAdminFetch({ loginPath });

  // When SSR-hydrated, seed state from the initial props and skip the mount
  // fetch (see the fetch effect below). `hasInitialData` is captured once.
  const hasInitialData = initialData !== undefined;
  const [data, setData] = useState<T[]>(initialData ?? []);
  const [total, setTotal] = useState<number | null>(
    hasInitialData ? initialTotal : null
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [offset, setOffsetState] = useState(initialOffset);
  const [debouncedQuery, setDebouncedQuery] = useState(query ?? '');
  // Bumped by refresh() to force a re-run without changing the URL.
  const [refreshTick, setRefreshTick] = useState(0);

  // SSR hydration: when initialData is provided, consume (skip) exactly the
  // first fetch that would otherwise fire — the one on mount, whose resolved
  // URL matches the initial SSR state. Any later fetch (URL change via a
  // filter/search/page, or refresh()) proceeds normally. One-shot: the ref is
  // flipped to false the first time the effect reaches the fetch branch, so
  // subsequent runs are never skipped. Without initialData it starts false, so
  // existing consumers keep fetching on mount (unchanged behaviour).
  const skipNextFetchRef = useRef(hasInitialData);

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
    const staticParams = JSON.parse(paramsKey) as Record<
      string,
      string | number | boolean | null | undefined
    >;
    return buildAdminResourceUrl(url, {
      limit,
      offset,
      includeTotal,
      search: debouncedQuery,
      searchParam,
      params: staticParams,
    });
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

    // SSR-hydrated first paint: skip the mount fetch exactly once (see
    // skipNextFetchRef). Later URL/refresh-driven runs fall through and fetch.
    if (skipNextFetchRef.current) {
      skipNextFetchRef.current = false;
      return;
    }

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
