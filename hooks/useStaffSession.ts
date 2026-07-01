import { useCallback, useEffect, useRef, useState } from 'react';
import { supabaseClient } from '@/utils/supabase';
import { useSession } from '@/hooks/useSession';
import type { StaffRole } from '@/utils/staff';

export const STAFF_CACHE_TTL = 2 * 60 * 1000;
export const STAFF_CACHE_KEY = 'staff_cache';

export type StaffCache = {
  isStaff: boolean;
  staffName: string | null;
  staffRole: StaffRole | null;
  ts: number;
};

export function isCacheFresh(
  cache: { ts: number } | null | undefined,
  now: number = Date.now(),
  ttl: number = STAFF_CACHE_TTL
): boolean {
  if (!cache || typeof cache.ts !== 'number') return false;
  return now - cache.ts < ttl;
}

export function parseStaffCache(raw: string | null): StaffCache | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed as StaffCache;
  } catch {
    return null;
  }
}

function readCache(): StaffCache | null {
  if (typeof window === 'undefined') return null;
  try {
    return parseStaffCache(sessionStorage.getItem(STAFF_CACHE_KEY));
  } catch {
    return null;
  }
}

function writeCache(value: StaffCache | null) {
  if (typeof window === 'undefined') return;
  try {
    if (value === null) sessionStorage.removeItem(STAFF_CACHE_KEY);
    else sessionStorage.setItem(STAFF_CACHE_KEY, JSON.stringify(value));
  } catch {}
}

export type StaffSession = {
  isStaff: boolean;
  staffName: string | null;
  staffRole: StaffRole | null;
  loading: boolean;
  clear: () => void;
};

export function useStaffSession(): StaffSession {
  const [loading, setLoading] = useState(() => !readCache());
  const [isStaff, setIsStaff] = useState(() => readCache()?.isStaff === true);
  const [staffName, setStaffName] = useState<string | null>(
    () => readCache()?.staffName ?? null
  );
  const [staffRole, setStaffRole] = useState<StaffRole | null>(
    () => readCache()?.staffRole ?? null
  );

  const inflight = useRef<Promise<void> | null>(null);

  const reset = useCallback(() => {
    setIsStaff(false);
    setStaffName(null);
    setStaffRole(null);
    writeCache(null);
  }, []);

  const checkStaff = useCallback(
    async (accessToken?: string | null, forceRefresh = false) => {
      if (!forceRefresh) {
        const cached = readCache();
        if (isCacheFresh(cached)) {
          setIsStaff(cached!.isStaff === true);
          setStaffName(cached!.staffName ?? null);
          setStaffRole(cached!.staffRole ?? null);
          setLoading(false);
          return;
        }
      }

      if (inflight.current) {
        await inflight.current;
        return;
      }

      const run = async () => {
        if (!readCache()) setLoading(true);
        try {
          let token = accessToken ?? null;
          if (!token) {
            const {
              data: { session },
            } = await supabaseClient.auth.getSession();
            token = session?.access_token ?? null;
          }

          if (!token) {
            reset();
            return;
          }

          const res = await fetch('/api/admin/me', {
            headers: { Authorization: `Bearer ${token}` },
          });
          const me = await res.json().catch(() => null);

          if (!res.ok || me?.error || !me?.role) {
            reset();
            return;
          }

          const name = me.display_name || me.email || 'Staff';
          const role = me.role as StaffRole;
          setIsStaff(true);
          setStaffName(name);
          setStaffRole(role);
          writeCache({
            isStaff: true,
            staffName: name,
            staffRole: role,
            ts: Date.now(),
          });
        } catch (e) {
          console.error('useStaffSession check error:', e);
          reset();
        } finally {
          setLoading(false);
        }
      };

      inflight.current = run();
      await inflight.current;
      inflight.current = null;
    },
    [reset]
  );

  // Piloté par l'unique SessionProvider (plus de souscription propre). On
  // (re)valide le staff à chaque changement de session : au premier
  // INITIAL_SESSION on autorise le cache 2 min ; sur tout autre event
  // (SIGNED_IN / SIGNED_OUT / TOKEN_REFRESHED) on force le rafraîchissement.
  const {
    token: sessionToken,
    loading: sessionLoading,
    lastEvent,
  } = useSession();

  useEffect(() => {
    if (sessionLoading) return;
    const forceRefresh = lastEvent != null && lastEvent !== 'INITIAL_SESSION';
    checkStaff(sessionToken, forceRefresh);
  }, [sessionToken, sessionLoading, lastEvent, checkStaff]);

  return {
    isStaff,
    staffName,
    staffRole,
    loading,
    clear: reset,
  };
}
