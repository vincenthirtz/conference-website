// utils/public/readMatches.ts
//
// Lectures partagées pour l'API publique `/api/public/v1/tournaments/{id}/matches`
// et `/api/public/v1/matches/{id}`. Overlays de bracket : id, stage, round,
// bracket side, équipes (id + nom), scores, vainqueur, status, horaire.
//
// Jointure des noms d'équipes batchée via `.in(...)` (pas de N+1, pas de
// PostgREST embed — reste testable avec le mock in-memory).

import { supabaseAdmin } from '@/utils/supabase';
import { logger } from '@/utils/logger';

/** Statuts de match publiquement visibles (jamais cancelled). */
export const PUBLIC_MATCH_STATUSES = [
  'pending',
  'ongoing',
  'finished',
] as const;

export type PublicMatch = {
  id: string;
  stage_id: string | null;
  round_number: number | null;
  bracket_side: string | null;
  team1_id: string | null;
  team1_name: string | null;
  team1_logo_url: string | null;
  team2_id: string | null;
  team2_name: string | null;
  team2_logo_url: string | null;
  team1_score: number | null;
  team2_score: number | null;
  winner_team_id: string | null;
  status: string;
  scheduled_at: string | null;
};

export type PublicMatchGame = {
  map_name: string | null;
  map_order: number | null;
  team1_score: number | null;
  team2_score: number | null;
  winner_team_id: string | null;
};

export type PublicMatchDetail = PublicMatch & {
  games: PublicMatchGame[];
};

const MATCH_COLUMNS =
  'id, tournament_id, stage_id, round_number, bracket_side, team1_id, team2_id, team1_score, team2_score, winner_team_id, status, scheduled_at';

type MatchRow = {
  id: string;
  tournament_id: string | null;
  stage_id: string | null;
  round_number: number | null;
  bracket_side: string | null;
  team1_id: string | null;
  team2_id: string | null;
  team1_score: number | null;
  team2_score: number | null;
  winner_team_id: string | null;
  status: string;
  scheduled_at: string | null;
};

/** Public, non-PII team projection used to decorate match overlays. */
type TeamPublicInfo = { name: string | null; logo_url: string | null };

/** Batch-resolve public team info (name + logo) for a set of team ids. */
async function resolveTeamInfo(
  tenantId: string,
  teamIds: string[]
): Promise<Map<string, TeamPublicInfo>> {
  const info = new Map<string, TeamPublicInfo>();
  const ids = [...new Set(teamIds.filter((id): id is string => !!id))];
  if (ids.length === 0) return info;

  const { data, error } = await supabaseAdmin
    .from('teams')
    .select('id, name, logo_url')
    .eq('tenant_id', tenantId)
    .in('id', ids);
  if (error) {
    logger.error('[readMatches] team info resolution error', error);
    throw new Error('Failed to load teams');
  }
  for (const t of (data ?? []) as Array<{
    id: string;
    name: string | null;
    logo_url: string | null;
  }>) {
    info.set(t.id, { name: t.name ?? null, logo_url: t.logo_url ?? null });
  }
  return info;
}

function shapeMatch(
  r: MatchRow,
  info: Map<string, TeamPublicInfo>
): PublicMatch {
  const t1 = r.team1_id ? info.get(r.team1_id) : undefined;
  const t2 = r.team2_id ? info.get(r.team2_id) : undefined;
  return {
    id: r.id,
    stage_id: r.stage_id ?? null,
    round_number: r.round_number ?? null,
    bracket_side: r.bracket_side ?? null,
    team1_id: r.team1_id ?? null,
    team1_name: t1?.name ?? null,
    team1_logo_url: t1?.logo_url ?? null,
    team2_id: r.team2_id ?? null,
    team2_name: t2?.name ?? null,
    team2_logo_url: t2?.logo_url ?? null,
    team1_score: r.team1_score ?? null,
    team2_score: r.team2_score ?? null,
    winner_team_id: r.winner_team_id ?? null,
    status: r.status,
    scheduled_at: r.scheduled_at ?? null,
  };
}

/**
 * Liste des matches publics d'un tournoi, filtrable par stage / status.
 * Ordonnée par `scheduled_at` asc.
 */
export async function readPublicTournamentMatches(
  tournamentId: string,
  tenantId: string,
  opts: { stageId?: string | null; status?: string | null }
): Promise<PublicMatch[]> {
  let query = supabaseAdmin
    .from('matches')
    .select(MATCH_COLUMNS)
    .eq('tenant_id', tenantId)
    .eq('tournament_id', tournamentId);

  if (
    opts.status &&
    (PUBLIC_MATCH_STATUSES as readonly string[]).includes(opts.status)
  ) {
    query = query.eq('status', opts.status);
  } else {
    query = query.in('status', PUBLIC_MATCH_STATUSES as unknown as string[]);
  }

  if (opts.stageId) {
    query = query.eq('stage_id', opts.stageId);
  }

  query = query.order('scheduled_at', { ascending: true, nullsFirst: false });

  const { data, error } = await query;
  if (error) {
    logger.error('[readPublicTournamentMatches] error', error);
    throw new Error('Failed to load matches');
  }

  const rows = (data ?? []) as MatchRow[];
  const info = await resolveTeamInfo(
    tenantId,
    rows.flatMap((r) =>
      [r.team1_id, r.team2_id].filter((x): x is string => !!x)
    )
  );
  return rows.map((r) => shapeMatch(r, info));
}

/**
 * Détail d'un match public + games (map par map). `null` si inconnu ou non
 * publiquement visible (status hors PUBLIC_MATCH_STATUSES).
 */
export async function readPublicMatchDetail(
  matchId: string,
  tenantId: string
): Promise<PublicMatchDetail | null> {
  const { data: matchRow, error: matchErr } = await supabaseAdmin
    .from('matches')
    .select(MATCH_COLUMNS)
    .eq('tenant_id', tenantId)
    .eq('id', matchId)
    .maybeSingle();

  if (matchErr) {
    logger.error('[readPublicMatchDetail] match error', matchErr);
    throw new Error('Failed to load match');
  }
  if (!matchRow) return null;
  const row = matchRow as MatchRow;
  if (!(PUBLIC_MATCH_STATUSES as readonly string[]).includes(row.status)) {
    return null;
  }

  const info = await resolveTeamInfo(
    tenantId,
    [row.team1_id, row.team2_id].filter((x): x is string => !!x)
  );

  const { data: gameRows, error: gamesErr } = await supabaseAdmin
    .from('games')
    .select('map_name, map_order, team1_score, team2_score, winner_team_id')
    .eq('tenant_id', tenantId)
    .eq('match_id', matchId);

  if (gamesErr) {
    logger.error('[readPublicMatchDetail] games error', gamesErr);
    throw new Error('Failed to load games');
  }

  const games: PublicMatchGame[] = (
    (gameRows ?? []) as Array<{
      map_name: string | null;
      map_order: number | null;
      team1_score: number | null;
      team2_score: number | null;
      winner_team_id: string | null;
    }>
  )
    .slice()
    .sort((a, b) => (a.map_order ?? 0) - (b.map_order ?? 0))
    .map((g) => ({
      map_name: g.map_name ?? null,
      map_order: g.map_order ?? null,
      team1_score: g.team1_score ?? null,
      team2_score: g.team2_score ?? null,
      winner_team_id: g.winner_team_id ?? null,
    }));

  return { ...shapeMatch(row, info), games };
}
