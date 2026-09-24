// utils/tcg/playerProfile.ts
//
// « Ce compte a-t-il une carte joueuse possible dans cet espace ? »
//
// Une carte joueuse n'existe que pour un compte présent dans le vivier de
// tirage, c'est-à-dire avec une ligne `player_ratings` dans l'espace (cf.
// `readDrawPool`). Une joueuse connectée avec un AUTRE compte que celui de son
// équipe — typiquement un compte e-mail créé à côté de son compte Discord —
// pouvait pourtant déposer une photo, la faire valider, et ne jamais voir de
// carte : la photo n'était rattachée à rien. Cas réel, le 2026-09-23.
//
// Le critère est celui du vivier, lu à la même source, pour que l'envoi, la
// relecture et le catalogue ne puissent pas diverger.

import { supabaseAdmin } from '@/utils/supabase';
import { logger } from '@/utils/logger';

/**
 * Les comptes, parmi `userIds`, qui ont un profil joueuse dans l'espace.
 * `null` si la lecture échoue : « inconnu », jamais « aucun ».
 */
export async function readPlayerProfileIds(
  tenantId: string,
  userIds: string[]
): Promise<Set<string> | null> {
  if (!supabaseAdmin) return null;
  if (userIds.length === 0) return new Set();
  const { data, error } = await supabaseAdmin
    .from('player_ratings')
    .select('user_id')
    .eq('tenant_id', tenantId)
    .in('user_id', userIds);
  if (error) {
    logger.warn('[tcg] profils joueuse illisibles: %s', error.message);
    return null;
  }
  return new Set(
    ((data ?? []) as { user_id: string }[]).map((row) => row.user_id)
  );
}

/** Un seul compte : `true` / `false`, ou `null` si la lecture échoue. */
export async function hasPlayerProfile(
  tenantId: string,
  userId: string
): Promise<boolean | null> {
  const ids = await readPlayerProfileIds(tenantId, [userId]);
  return ids === null ? null : ids.has(userId);
}
