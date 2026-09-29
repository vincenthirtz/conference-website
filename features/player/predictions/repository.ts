// features/player/predictions/repository.ts — écriture du pronostic de la
// joueuse (`match_predictions`), toujours scopée au tenant ET à la joueuse.
// Les lectures passent par utils/predictions (partagées avec le règlement).

import type { AdminDb } from '@/utils/admin/serviceContext';

type Key = { tenantId: string; matchId: string; userId: string };

/** Retire un pronostic encore non réglé. */
export async function deleteOpenPrediction(db: AdminDb, k: Key) {
  const { error } = await db
    .from('match_predictions')
    .delete()
    .eq('tenant_id', k.tenantId)
    .eq('match_id', k.matchId)
    .eq('user_id', k.userId)
    .is('settled_at', null);
  return { error };
}

/** Pose (ou change) le pronostic ; le déclencheur en base a le dernier mot. */
export async function upsertPrediction(
  db: AdminDb,
  k: Key & { teamId: string }
) {
  const { data, error } = await db
    .from('match_predictions')
    .upsert(
      {
        tenant_id: k.tenantId,
        match_id: k.matchId,
        user_id: k.userId,
        predicted_winner_team_id: k.teamId,
      },
      { onConflict: 'tenant_id,match_id,user_id' }
    )
    .select('predicted_winner_team_id, result, updated_at')
    .maybeSingle();
  return {
    row: data as {
      predicted_winner_team_id: string;
      result: 'won' | 'lost' | 'void' | null;
      updated_at: string;
    } | null,
    error,
  };
}
