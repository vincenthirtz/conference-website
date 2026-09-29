// features/admin/matches/repository/drafts.ts — accès base des drafts MOBA
// hors moteur (utils/draftEngine porte le reste). `tenantId` obligatoire.

import type { AdminDb } from '@/utils/admin/serviceContext';

/** Id du draft (matchId, gameIndex) du tenant, ou null. */
export async function findDraftId(
  db: AdminDb,
  tenantId: string,
  matchId: string,
  gameIndex: number
) {
  const { data, error } = await db
    .from('match_drafts')
    .select('id')
    .eq('match_id', matchId)
    .eq('game_index', gameIndex)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  return { row: data, error };
}
