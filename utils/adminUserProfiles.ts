// utils/adminUserProfiles.ts
// Batch-resolve auth-user profile info via the `admin_get_user_profiles(uuid[])`
// RPC instead of N per-row `auth.admin.getUserById` round-trips (audit perf P6
// bis). Callers collect the unique user_ids they need, make ONE RPC call, then
// compose their own site-specific `userInfo` shape from the returned Map — the
// response shapes are intentionally left to each route so nothing changes on
// the wire.
//
// Only `supabaseAdmin` (service_role) may call this RPC. Best-effort by design:
// an unknown id is simply absent from the Map (skip → userInfo null) and an RPC
// error logs + yields an empty Map (same graceful degradation as the previous
// per-row try/catch).

import { supabaseAdmin } from './supabase';
import { logger } from './logger';

/** One row of the `admin_get_user_profiles` RPC contract. */
export type AdminUserProfile = {
  id: string;
  email: string | null;
  display_name: string | null;
  full_name: string | null;
  avatar_url: string | null;
  battle_tag: string | null;
  discord: string | null;
};

/**
 * Resolve `admin_get_user_profiles` for the unique, non-empty ids in `ids`.
 * Returns a Map keyed by user id. Never throws. When `ids` has no usable id the
 * RPC is NOT called and an empty Map is returned.
 */
export async function fetchAdminUserProfiles(
  ids: Array<string | null | undefined>
): Promise<Map<string, AdminUserProfile>> {
  const uniqueIds = Array.from(
    new Set(ids.filter((id): id is string => typeof id === 'string' && !!id))
  );

  const map = new Map<string, AdminUserProfile>();
  if (uniqueIds.length === 0) return map;

  try {
    const { data, error } = await supabaseAdmin!.rpc(
      'admin_get_user_profiles',
      {
        p_ids: uniqueIds,
      }
    );

    if (error) {
      logger.error('[adminUserProfiles] rpc error:', error);
      return map;
    }

    for (const row of (data || []) as AdminUserProfile[]) {
      if (row && typeof row.id === 'string') {
        map.set(row.id, {
          id: row.id,
          email: row.email ?? null,
          display_name: row.display_name ?? null,
          full_name: row.full_name ?? null,
          avatar_url: row.avatar_url ?? null,
          battle_tag: row.battle_tag ?? null,
          discord: row.discord ?? null,
        });
      }
    }
  } catch (err) {
    logger.error('[adminUserProfiles] rpc exception:', err);
  }

  return map;
}
