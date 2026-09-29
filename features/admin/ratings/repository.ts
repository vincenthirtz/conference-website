// features/admin/ratings/repository.ts — lectures de la couverture du rating,
// toutes scopées par `tenantId` (obligatoire).

import type { AdminDb } from '@/utils/admin/serviceContext';

/** Matchs terminés ou walkover : le vivier des matchs « notables ». */
export async function listFinishedMatches(db: AdminDb, tenantId: string) {
  const { data, error } = await db
    .from('matches')
    .select('id, team1_id, team2_id, winner_team_id, completed_at, is_bye')
    .eq('tenant_id', tenantId)
    .in('status', ['finished', 'walkover']);
  return { rows: data ?? [], error };
}

export async function readCoverageInputs(
  db: AdminDb,
  tenantId: string,
  matchIds: string[]
) {
  const [history, participants, teams] = await Promise.all([
    db
      .from('player_rating_history')
      .select('match_id')
      .eq('tenant_id', tenantId)
      .in('match_id', matchIds),
    db
      .from('match_participants')
      .select('match_id, team_id')
      .eq('tenant_id', tenantId)
      .in('match_id', matchIds),
    db.from('teams').select('id, name').eq('tenant_id', tenantId),
  ]);
  return {
    history: { rows: history.data ?? [], error: history.error },
    participants: participants.data ?? [],
    teams: teams.data ?? [],
  };
}
