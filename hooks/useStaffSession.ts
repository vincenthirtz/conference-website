import { useCallback, useEffect, useRef, useState } from 'react';
import { supabaseClient } from '@/utils/supabase';
import { useSession } from '@/hooks/useSession';
import type { StaffRole } from '@/utils/staff';
import type { TenantKind } from '@/utils/tenantKind';

export const STAFF_CACHE_TTL = 2 * 60 * 1000;
// Bump v2 : ajout du champ `activeTenantKind`. Le suffixe invalide les vieux
// caches sessionStorage écrits sans ce champ (sinon un cache frais sans
// `activeTenantKind` masquerait la console développeur au 1er render).
export const STAFF_CACHE_KEY = 'staff_cache_v2';

/**
 * Rôles qui font de quelqu'un un membre du STAFF. Copie CLIENT de
 * `STAFF_ROLES` (utils/staff.ts) — importer ce module ici embarquerait le
 * client Supabase service-role dans le bundle (même convention que
 * `STAFF_LIKE_ROLES` dans pages/admin/users/new.tsx).
 */
const STAFF_ROLES_CLIENT: readonly string[] = ['owner', 'admin', 'caster'];

/**
 * `GET /api/admin/me` répond aussi 200 pour une CAPITAINE d'équipe
 * (`role: 'captain'`, cf. le repli `teams.captain_id` du handler) : c'est une
 * réponse d'IDENTITÉ, pas un laissez-passer back-office. Prendre ce 200 pour du
 * staff cassait la navbar de toute capitaine / manager devenue `captain_id` :
 * nav publique masquée (`hideMarketingNav`), PlayerTopBar bloquée (`&& !isStaff`)
 * et top-bar admin VIDE (`filterAdminLinks` n'a pas de rang pour 'captain').
 * `pages/login.tsx` faisait déjà cette distinction (`me.role !== 'captain'`
 * avant d'amorcer le cache) — on l'applique ici aussi.
 */
export function isStaffRole(role: unknown): role is StaffRole {
  return typeof role === 'string' && STAFF_ROLES_CLIENT.includes(role);
}

export type StaffCache = {
  isStaff: boolean;
  staffName: string | null;
  staffRole: StaffRole | null;
  activeTenantKind: TenantKind | null;
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
  activeTenantKind: TenantKind | null;
  loading: boolean;
  clear: () => void;
};

export function useStaffSession(): StaffSession {
  // IMPORTANT — hydratation : on N'initialise PAS depuis le cache (sessionStorage)
  // ici. readCache() renvoie null en SSR mais la valeur cachée côté client, donc
  // lire le cache dans l'initialiseur useState faisait diverger le 1er rendu
  // client du HTML SSR → mismatch d'hydratation sur TOUTE page rendant le Navbar
  // (toutes les pages /admin), avec régénération complète de l'arbre par React.
  // On part donc d'un état SSR-safe (loading, pas staff) ; le cache est appliqué
  // aussitôt après le mount par checkStaff (branche synchrone isCacheFresh),
  // donc sans attente réseau — juste un tick plus tard, cohérent avec le SSR.
  const [loading, setLoading] = useState(true);
  const [isStaff, setIsStaff] = useState(false);
  const [staffName, setStaffName] = useState<string | null>(null);
  const [staffRole, setStaffRole] = useState<StaffRole | null>(null);
  const [activeTenantKind, setActiveTenantKind] = useState<TenantKind | null>(
    null
  );

  const inflight = useRef<Promise<void> | null>(null);

  const reset = useCallback(() => {
    setIsStaff(false);
    setStaffName(null);
    setStaffRole(null);
    setActiveTenantKind(null);
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
          setActiveTenantKind(cached!.activeTenantKind ?? null);
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

          if (!res.ok || me?.error || !isStaffRole(me?.role)) {
            reset();
            return;
          }

          const name = me.display_name || me.email || 'Staff';
          const role = me.role as StaffRole;
          // Fallback 'organizer' si le champ est absent (API pas encore
          // déployée) mais qu'on a bien un staff → comportement inchangé.
          const kind: TenantKind =
            me.active_tenant_kind === 'developer' ? 'developer' : 'organizer';
          setIsStaff(true);
          setStaffName(name);
          setStaffRole(role);
          setActiveTenantKind(kind);
          writeCache({
            isStaff: true,
            staffName: name,
            staffRole: role,
            activeTenantKind: kind,
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
    activeTenantKind,
    loading,
    clear: reset,
  };
}
