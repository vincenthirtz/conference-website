// utils/teams/playedGames.ts
//
// Lecture des affrontements JOUÉS d'une équipe — matchs terminés et scrims
// clos, ramenés à une forme commune.
//
// Extrait parce que trois surfaces posaient déjà la même question à deux
// tables : la mémoire d'équipe (N2), la santé d'équipe (N3) et le dossier
// d'adversaire (N5). Trois copies d'une jointure, c'est la garantie qu'une
// correction n'atterrisse que sur l'une d'elles.
//
// Le filtre d'appartenance est appliqué DEUX FOIS, côté serveur (`.or`) et
// localement : une garantie qui ne tient qu'à une chaîne de filtre envoyée à
// PostgREST n'est pas vérifiable ici, et le coût d'un `filter` sur quelques
// dizaines de lignes est nul.

import { supabaseAdmin } from '@/utils/supabase';
import { logger } from '@/utils/logger';
import type { PlayedGame } from '@/utils/teams/scouting';

/** Profondeur de lecture — au-delà, aucune section du dossier ne change. */
const DEFAULT_LIMIT = 100;

type Row = Record<string, unknown>;

/**
 * Affrontements joués d'une équipe, les plus récents d'abord.
 *
 * Ne throw jamais : une erreur de lecture renvoie une liste vide, et les
 * sections qui en dépendent se taisent d'elles-mêmes (seuil d'échantillon).
 */
export async function loadPlayedGames(
  tenantId: string,
  teamId: string,
  limit: number = DEFAULT_LIMIT
): Promise<PlayedGame[]> {
  if (!supabaseAdmin || !teamId) return [];

  const involvesMe = `team1_id.eq.${teamId},team2_id.eq.${teamId}`;
  const belongsToMe = (row: Row) =>
    row.team1_id === teamId || row.team2_id === teamId;

  try {
    const [matchesRes, scrimsRes] = await Promise.all([
      supabaseAdmin
        .from('matches')
        .select(
          'id, scheduled_at, completed_at, team1_id, team2_id, team1_score, team2_score, winner_team_id'
        )
        .eq('tenant_id', tenantId)
        .eq('status', 'finished')
        .is('deleted_at', null)
        .or(involvesMe)
        .order('scheduled_at', { ascending: false })
        .limit(limit),
      supabaseAdmin
        .from('scrims')
        .select(
          'id, scheduled_date, completed_at, team1_id, team2_id, team1_score, team2_score, winner_team_id'
        )
        .eq('tenant_id', tenantId)
        .eq('status', 'completed')
        .is('deleted_at', null)
        .or(involvesMe)
        .order('scheduled_date', { ascending: false })
        .limit(limit),
    ]);

    const map = (
      rows: Row[] | null,
      subjectType: 'match' | 'scrim',
      dateColumn: string
    ): PlayedGame[] =>
      (rows || []).filter(belongsToMe).map((row) => ({
        subjectType,
        subjectId: row.id as string,
        playedAt:
          ((row.completed_at as string | null) ??
            (row[dateColumn] as string | null)) ||
          null,
        team1Id: (row.team1_id as string | null) ?? null,
        team2Id: (row.team2_id as string | null) ?? null,
        team1Score: (row.team1_score as number | null) ?? null,
        team2Score: (row.team2_score as number | null) ?? null,
        winnerTeamId: (row.winner_team_id as string | null) ?? null,
      }));

    return [
      ...map(matchesRes.data as Row[] | null, 'match', 'scheduled_at'),
      ...map(scrimsRes.data as Row[] | null, 'scrim', 'scheduled_date'),
    ];
  } catch (err) {
    logger.error('[playedGames] crash', err);
    return [];
  }
}
