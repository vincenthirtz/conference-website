// features/player/checkin/repository.ts — candidats au « prochain match »
// d'une équipe, scopés au tenant. Deux requêtes plutôt qu'un filtre combiné
// (cf. service) : reprises À L'IDENTIQUE de la route historique.

import type { SupabaseClient } from '@supabase/supabase-js';
import type { AdminDb } from '@/utils/admin/serviceContext';
import { PLAYER_MATCH_SELECT } from '@/utils/matches/playerMatchView';

const loose = (db: AdminDb) => db as unknown as SupabaseClient;

export async function readNextMatchCandidates(
  db: AdminDb,
  tenantId: string,
  teamId: string,
  cutoffISO: string
) {
  const teamFilter = `team1_id.eq.${teamId},team2_id.eq.${teamId}`;
  const [recent, live] = await Promise.all([
    loose(db)
      .from('matches')
      .select(PLAYER_MATCH_SELECT)
      .or(teamFilter)
      .eq('tenant_id', tenantId)
      .in('status', ['pending', 'ongoing'])
      .gte('scheduled_at', cutoffISO)
      .order('scheduled_at', { ascending: true })
      .limit(5),
    loose(db)
      .from('matches')
      .select(PLAYER_MATCH_SELECT)
      .or(teamFilter)
      .eq('tenant_id', tenantId)
      .eq('status', 'ongoing')
      .order('scheduled_at', { ascending: false })
      .limit(3),
  ]);
  return {
    rows: [...(recent.data ?? []), ...(live.data ?? [])] as Record<
      string,
      unknown
    >[],
    error: recent.error ?? live.error,
  };
}
