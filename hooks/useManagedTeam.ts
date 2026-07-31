// hooks/useManagedTeam.ts
//
// Shared accessor for the captain/manager's team payload exposed at
// `/api/admin/teams/my` ({ team, members, isCaptain, isManager }).
//
// Several player pages (manage-team, requests, messages) each used to fire
// their own GET against this endpoint on mount, so navigating between them
// re-fetched the exact same data three times. This hook funnels every caller
// through a MODULE-LEVEL cache:
//   - a single in-flight Promise is shared by concurrent callers, and
//   - the resolved payload is memoised for a short TTL (~15s),
// both keyed on the Supabase access token (so a session swap busts the cache).
//
// `reload()` clears the cache and re-fetches — call it right after a mutation
// (promote, remove, toggle recruitment, accept join request, …) so every
// mounted consumer sees fresh data.

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabaseClient } from '@/utils/supabase';
import { usePlayerSession } from '@/hooks/usePlayerSession';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { usePlayerArea } from '@/components/player/PlayerAreaContext';
import type { TeamMemberLite } from '@/components/player/TeamCard';

export type ManagedTeamInfo = {
  id: string;
  slug?: string | null;
  name: string;
  short_name: string | null;
  logo_url: string | null;
  country?: string | null;
  description?: string | null;
  is_joinable?: boolean;
};

// The /api/admin/teams/my endpoint returns a superset of TeamMemberLite
// (it also carries user_id / battle_tag / specialty), which manage-team needs.
// We keep TeamMemberLite as the structural base so TeamCard consumers stay
// type-compatible.
export type ManagedTeamMember = TeamMemberLite & {
  user_id: string | null;
  battle_tag: string | null;
  specialty?: string | null;
  /** Pseudo affichable — l'encadrement n'a pas forcément de BattleTag. */
  display_name?: string | null;
};

export type ManagedTeamData = {
  team: ManagedTeamInfo | null;
  members: ManagedTeamMember[];
  isCaptain: boolean;
  isManager: boolean;
};

type ApiPayload = {
  team?: ManagedTeamInfo | null;
  members?: ManagedTeamMember[];
  isCaptain?: boolean;
  isManager?: boolean;
};

const CACHE_TTL_MS = 15_000;

type CacheEntry = {
  /**
   * Clé de cache = token d'accès + sujet inspecté. Le token seul suffisait
   * tant qu'une session ne pouvait voir qu'une équipe ; en inspection staff
   * (`?as=`), le MÊME token sert à lire l'équipe du staff puis celle de
   * plusieurs joueuses — sans le sujet dans la clé, la première réponse serait
   * resservie pour toutes les suivantes.
   */
  key: string;
  data: ManagedTeamData;
  fetchedAt: number;
};

// Module-level (shared across every hook instance / page).
let cacheEntry: CacheEntry | null = null;
let inFlight: { key: string; promise: Promise<ManagedTeamData> } | null = null;

function normalize(payload: ApiPayload | null): ManagedTeamData {
  return {
    team: payload?.team ?? null,
    members: payload?.members ?? [],
    isCaptain: payload?.isCaptain ?? false,
    isManager: payload?.isManager ?? false,
  };
}

/** Clears the shared cache + any in-flight request. */
function bustCache() {
  cacheEntry = null;
  inFlight = null;
}

export type UseManagedTeamOptions = {
  /** When false, the hook stays idle (no fetch). Defaults to true. */
  enabled?: boolean;
};

export type UseManagedTeamResult = {
  data: ManagedTeamData | null;
  loading: boolean;
  error: Error | null;
  /** Busts the shared cache and re-fetches. Call after a mutation. */
  reload: () => Promise<void>;
};

export function useManagedTeam(
  opts: UseManagedTeamOptions = {}
): UseManagedTeamResult {
  const { enabled = true } = opts;
  const { ready } = usePlayerSession({ redirect: false });
  const { adminFetchJson } = useAdminFetch({ loginPath: '/login' });
  const { withSubject, subjectId } = usePlayerArea();

  const [data, setData] = useState<ManagedTeamData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Mounted guard so a slow/aborted response can't setState after unmount.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Resolve the current access token (cache key).
  const getToken = useCallback(async (): Promise<string | null> => {
    const {
      data: { session },
    } = await supabaseClient.auth.getSession();
    return session?.access_token ?? null;
  }, []);

  // Shared fetcher: serves the cache, joins an in-flight request, or starts a
  // new one. `force` skips the cache (used by reload()).
  const fetchShared = useCallback(
    async (token: string, force: boolean): Promise<ManagedTeamData> => {
      const now = Date.now();
      const key = `${token}::${subjectId ?? 'self'}`;

      if (!force && cacheEntry && cacheEntry.key === key) {
        if (now - cacheEntry.fetchedAt < CACHE_TTL_MS) {
          return cacheEntry.data;
        }
      }

      if (!force && inFlight && inFlight.key === key) {
        return inFlight.promise;
      }

      const promise = adminFetchJson<ApiPayload>(
        withSubject('/api/admin/teams/my'),
        { skipAuthRedirect: true }
      )
        .then((payload) => {
          const normalized = normalize(payload);
          cacheEntry = { key, data: normalized, fetchedAt: Date.now() };
          return normalized;
        })
        .finally(() => {
          if (inFlight && inFlight.promise === promise) {
            inFlight = null;
          }
        });

      inFlight = { key, promise };
      return promise;
    },
    [adminFetchJson, withSubject, subjectId]
  );

  const run = useCallback(
    async (force: boolean) => {
      if (!enabled || !ready) return;
      setLoading(true);
      setError(null);
      try {
        const token = await getToken();
        if (!token) {
          if (mountedRef.current) {
            setData(null);
            setLoading(false);
          }
          return;
        }
        const result = await fetchShared(token, force);
        if (mountedRef.current) {
          setData(result);
        }
      } catch (err) {
        if (mountedRef.current) {
          setError(err instanceof Error ? err : new Error(String(err)));
        }
      } finally {
        if (mountedRef.current) {
          setLoading(false);
        }
      }
    },
    [enabled, ready, getToken, fetchShared]
  );

  useEffect(() => {
    if (!enabled || !ready) return;
    run(false);
  }, [enabled, ready, run]);

  const reload = useCallback(async () => {
    bustCache();
    await run(true);
  }, [run]);

  return { data, loading, error, reload };
}
