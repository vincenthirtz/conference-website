// hooks/useAccessibleTenants.ts
//
// Reactive read of the list of tenants the signed-in staff member can access.
// Backed by GET /api/admin/tenants/accessible. Cached in a module-local store
// (TTL 60s) so the navbar <TenantSwitcher /> and any "switch tenant" UI on
// other pages share a single fetch.

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAdminFetch } from './useAdminFetch';
import type { StaffRole } from '@/utils/staff';

import { logger } from '../utils/logger';

export type AccessibleTenant = {
  id: string;
  slug: string;
  name: string;
  is_active: boolean;
  role: StaffRole;
};

export type AccessibleTenantsResponse = {
  tenants: AccessibleTenant[];
};

export type UseAccessibleTenantsApi = {
  tenants: AccessibleTenant[];
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

type CacheEntry = {
  data: AccessibleTenant[] | null;
  ts: number;
  error: string | null;
};

const TTL_MS = 60_000;
let cache: CacheEntry | null = null;
const listeners = new Set<(entry: CacheEntry | null) => void>();

function notify(entry: CacheEntry | null) {
  cache = entry;
  for (const l of listeners) l(entry);
}

/** Test-only helper. */
export function __resetAccessibleTenantsCache() {
  cache = null;
  for (const l of listeners) l(null);
}

let inflight: Promise<void> | null = null;

export function useAccessibleTenants(): UseAccessibleTenantsApi {
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
        const json = await fetchRef.current<AccessibleTenantsResponse>(
          '/api/admin/tenants/accessible'
        );
        notify({ data: json.tenants ?? [], ts: Date.now(), error: null });
      } catch (err) {
        logger.error('useAccessibleTenants: fetch error', err);
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
    tenants: entry?.data ?? [],
    isLoading: !entry,
    error: entry?.error ?? null,
    refresh: runFetch,
  };
}
