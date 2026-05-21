// hooks/useActiveTenant.ts
//
// Reactive read of the currently-active tenant for the signed-in staff member.
// Backed by GET /api/admin/active-tenant. The endpoint reads the
// `active_tenant_id` cookie (set via POST /api/admin/active-tenant) and falls
// back to the staff's default tenant if absent.
//
// Cached in a module-local store with a small TTL so multiple components on
// the same page (e.g. <TenantSwitcher /> + a header chip) share a single
// fetch. No SWR / react-query dependency — kept consistent with the
// zero-dependency policy.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAdminFetch } from './useAdminFetch';

import { logger } from '../utils/logger';

export type ActiveTenant = {
  id: string;
  slug: string;
  name: string;
  is_active: boolean;
  default_locale: string | null;
};

export type ActiveTenantSource = 'cookie' | 'default' | 'fallback';

export type ActiveTenantResponse = {
  tenant: ActiveTenant | null;
  source: ActiveTenantSource;
};

export type UseActiveTenantApi = {
  tenant: ActiveTenant | null;
  source: ActiveTenantSource | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

type CacheEntry = {
  data: ActiveTenantResponse | null;
  ts: number;
  error: string | null;
};

const TTL_MS = 30_000;
let cache: CacheEntry | null = null;
const listeners = new Set<(entry: CacheEntry | null) => void>();

function notify(entry: CacheEntry | null) {
  cache = entry;
  for (const l of listeners) l(entry);
}

/** Test-only helper. Not exported from the package surface. */
export function __resetActiveTenantCache() {
  cache = null;
  for (const l of listeners) l(null);
}

let inflight: Promise<void> | null = null;

export function useActiveTenant(): UseActiveTenantApi {
  const { adminFetchJson } = useAdminFetch();
  const [entry, setEntry] = useState<CacheEntry | null>(cache);
  const fetchRef = useRef(adminFetchJson);
  fetchRef.current = adminFetchJson;

  useEffect(() => {
    const handler = (e: CacheEntry | null) => setEntry(e);
    listeners.add(handler);
    return () => {
      listeners.delete(handler);
    };
  }, []);

  const runFetch = useCallback(async () => {
    if (inflight) {
      await inflight;
      return;
    }
    inflight = (async () => {
      try {
        const json = await fetchRef.current<ActiveTenantResponse>(
          '/api/admin/active-tenant'
        );
        notify({ data: json, ts: Date.now(), error: null });
      } catch (err) {
        logger.error('useActiveTenant: fetch error', err);
        notify({
          data: null,
          ts: Date.now(),
          error: (err as Error)?.message ?? 'Erreur de chargement',
        });
      }
    })();
    try {
      await inflight;
    } finally {
      inflight = null;
    }
  }, []);

  useEffect(() => {
    if (!cache || Date.now() - cache.ts > TTL_MS) {
      runFetch();
    }
  }, [runFetch]);

  return {
    tenant: entry?.data?.tenant ?? null,
    source: entry?.data?.source ?? null,
    isLoading: !entry,
    error: entry?.error ?? null,
    refresh: runFetch,
  };
}
