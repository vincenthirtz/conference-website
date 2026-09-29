// features/admin/tournaments/repository/matches.ts — accès base des matchs
// d'un tournoi côté staff (liste, création en lot, bracket, opérations en
// masse, planning). `tenantId` obligatoire partout.

import type { AdminDb } from '@/utils/admin/serviceContext';
import type { TablesInsert, TablesUpdate } from '@/types/database.generated';
import { AVAILABILITY_COLUMNS } from '@/utils/matches/availabilityRows';
import {
  GAME_ROW_COLUMNS,
  TOURNAMENT_MATCH_LIST_COLUMNS,
  TOURNAMENT_MATCH_ROW_COLUMNS,
} from '../schemas';

/* ---- Liste ---- */

export type MatchListFilters = {
  stageId: string | null;
  status: string | null;
  bracketSide: string | null;
  groupKey: string | null;
  roundNumber: number | null;
  result: string | null;
  dateFrom: string | null;
  dateTo: string | null;
  /** Clauses `or()` déjà construites (recherche), ou null. */
  searchOr: string | null;
};

// Le client typé ne sait pas typer une chaîne de `.select()` construite à
// l'exécution (embeds optionnels) : la requête passe par une vue non typée,
// les colonnes restant des constantes du module.
type LooseQuery = {
  eq: (c: string, v: unknown) => LooseQuery;
  gte: (c: string, v: unknown) => LooseQuery;
  lte: (c: string, v: unknown) => LooseQuery;
  is: (c: string, v: null) => LooseQuery;
  not: (c: string, op: string, v: unknown) => LooseQuery;
  or: (f: string) => LooseQuery;
};

function applyMatchFilters<Q>(
  q: Q,
  tenantId: string,
  tournamentId: string,
  f: MatchListFilters
): Q {
  let x = (q as unknown as LooseQuery)
    .eq('tenant_id', tenantId)
    .eq('tournament_id', tournamentId);
  if (f.stageId) x = x.eq('stage_id', f.stageId);
  if (f.status) x = x.eq('status', f.status);
  if (f.bracketSide) x = x.eq('bracket_side', f.bracketSide);
  if (f.groupKey) x = x.eq('group_key', f.groupKey);
  if (f.roundNumber !== null) x = x.eq('round_number', f.roundNumber);
  if (f.result === 'bye') x = x.eq('is_bye', true);
  else if (f.result === 'win') x = x.not('winner_team_id', 'is', null);
  else if (f.result === 'no_result') {
    x = x.eq('status', 'finished').is('winner_team_id', null);
  }
  if (f.dateFrom) x = x.gte('scheduled_at', f.dateFrom);
  if (f.dateTo) x = x.lte('scheduled_at', f.dateTo);
  if (f.searchOr) x = x.or(f.searchOr);
  return x as unknown as Q;
}

/** Équipes du tenant dont le nom ou le nom court contient `pattern`. */
export async function teamIdsMatching(
  db: AdminDb,
  tenantId: string,
  pattern: string
) {
  return db
    .from('teams')
    .select('id')
    .eq('tenant_id', tenantId)
    .or(`name.ilike.${pattern},short_name.ilike.${pattern}`)
    .limit(50);
}

export async function listMatches(
  db: AdminDb,
  tenantId: string,
  tournamentId: string,
  f: MatchListFilters,
  opts: {
    withTeams: boolean;
    withGames: boolean;
    orderField: 'scheduled_at' | 'round_number' | 'created_at';
    ascending: boolean;
    offset: number;
    limit: number;
  }
) {
  let columns: string = TOURNAMENT_MATCH_LIST_COLUMNS;
  if (opts.withTeams) {
    columns +=
      ', team1:team1_id(id, name, short_name, logo_url), team2:team2_id(id, name, short_name, logo_url)';
  }
  if (opts.withGames) columns += `, games:games(${GAME_ROW_COLUMNS})`;

  let query = applyMatchFilters(
    db.from('matches').select(columns),
    tenantId,
    tournamentId,
    f
  );
  // DÉPARTAGE EXPLICITE : un seul critère laissait Postgres ordonner les ex
  // æquo à sa guise (doublons / trous d'une page à l'autre). Non programmés À
  // LA FIN, puis tour, création, id.
  query = query.order(opts.orderField, {
    ascending: opts.ascending,
    nullsFirst: false,
  });
  if (opts.orderField !== 'round_number') {
    query = query.order('round_number', { ascending: true, nullsFirst: false });
  }
  if (opts.orderField !== 'created_at') {
    query = query.order('created_at', { ascending: true });
  }
  return query
    .order('id', { ascending: true })
    .range(opts.offset, opts.offset + opts.limit - 1);
}

export async function countMatches(
  db: AdminDb,
  tenantId: string,
  tournamentId: string,
  f: MatchListFilters
) {
  return applyMatchFilters(
    db.from('matches').select('id', { count: 'exact', head: true }),
    tenantId,
    tournamentId,
    f
  );
}

/** Phases, version allégée pour le filtre de la page des matchs. */
export async function stageSummaries(
  db: AdminDb,
  tenantId: string,
  tournamentId: string
) {
  return db
    .from('tournament_stages')
    .select(
      'id, name, stage_type, order_index, is_active, is_public, start_date, end_date'
    )
    .eq('tenant_id', tenantId)
    .eq('tournament_id', tournamentId)
    .order('order_index', { ascending: true });
}

export async function tournamentHeader(
  db: AdminDb,
  tenantId: string,
  tournamentId: string
) {
  return db
    .from('tournaments')
    .select('id, name, slug, status, timezone')
    .eq('tenant_id', tenantId)
    .eq('id', tournamentId)
    .maybeSingle();
}

export async function insertMatches(
  db: AdminDb,
  rows: TablesInsert<'matches'>[]
) {
  return db.from('matches').insert(rows).select(TOURNAMENT_MATCH_ROW_COLUMNS);
}

/* ---- Bracket ---- */

export async function updateTournamentMatch(
  db: AdminDb,
  tenantId: string,
  tournamentId: string,
  matchId: string,
  patch: TablesUpdate<'matches'>
) {
  return db
    .from('matches')
    .update(patch)
    .eq('id', matchId)
    .eq('tournament_id', tournamentId)
    .eq('tenant_id', tenantId);
}

export async function bracketGraphRows(
  db: AdminDb,
  tenantId: string,
  tournamentId: string,
  stageId: string | null
) {
  let query = db
    .from('matches')
    .select(
      'id, tournament_id, round_number, bracket_side, group_key, next_match_win_id, next_match_lose_id'
    )
    .eq('tournament_id', tournamentId)
    .eq('tenant_id', tenantId)
    .neq('status', 'cancelled');
  if (stageId) query = query.eq('stage_id', stageId);
  return query;
}

/* ---- Opérations en masse ---- */

export async function findStage(
  db: AdminDb,
  tenantId: string,
  stageId: string
) {
  const { data } = await db
    .from('tournament_stages')
    .select('id, tournament_id')
    .eq('id', stageId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  return data;
}

export async function roundMatches(
  db: AdminDb,
  tenantId: string,
  stageId: string,
  roundNumber: number
) {
  return db
    .from('matches')
    .select('id, scheduled_at, status')
    .eq('stage_id', stageId)
    .eq('tenant_id', tenantId)
    .eq('round_number', roundNumber)
    .neq('status', 'cancelled');
}

/** Mise à jour d'un match du tenant (sans contrôle de tournoi). */
export async function updateMatch(
  db: AdminDb,
  tenantId: string,
  matchId: string,
  patch: TablesUpdate<'matches'>
) {
  return db
    .from('matches')
    .update(patch)
    .eq('id', matchId)
    .eq('tenant_id', tenantId);
}

export async function matchesForReassign(
  db: AdminDb,
  tenantId: string,
  ids: string[]
) {
  return db
    .from('matches')
    .select(
      'id, tournament_id, stage_id, status, next_match_win_id, next_match_lose_id'
    )
    .in('id', ids)
    .eq('tenant_id', tenantId);
}

/* ---- Planning ---- */

export async function schedulableMatches(
  db: AdminDb,
  tenantId: string,
  tournamentId: string
) {
  return db
    .from('matches')
    .select(
      'id, tournament_id, stage_id, status, is_bye, match_format, round_number, group_key, bracket_side, team1_id, team2_id, scheduled_at'
    )
    .eq('tournament_id', tournamentId)
    .eq('tenant_id', tenantId)
    .neq('status', 'cancelled');
}

/**
 * Contraintes de disponibilité des équipes : celles du tournoi ET les
 * globales (une règle permanente pèse sur ce tournoi comme sur les autres).
 */
export async function availabilityConstraints(
  db: AdminDb,
  tenantId: string,
  tournamentId: string,
  teamIds: string[],
  ordered: boolean
) {
  const query = db
    .from('team_availability_constraints')
    .select(AVAILABILITY_COLUMNS)
    .eq('tenant_id', tenantId)
    .in('team_id', teamIds)
    .or(`tournament_id.eq.${tournamentId},tournament_id.is.null`);
  return ordered ? query.order('created_at', { ascending: true }) : query;
}

export async function entrantsWithNames(
  db: AdminDb,
  tenantId: string,
  tournamentId: string
) {
  return db
    .from('tournament_teams')
    .select('team_id, team:teams!tournament_teams_team_id_fkey(id, name)')
    .eq('tournament_id', tournamentId)
    .eq('tenant_id', tenantId);
}

export async function scheduledMatchesWithTeams(
  db: AdminDb,
  tenantId: string,
  tournamentId: string
) {
  return db
    .from('matches')
    .select(
      `
        id,
        stage_id,
        round_number,
        match_format,
        team1_id,
        team2_id,
        scheduled_at,
        is_bye,
        status,
        team1:teams!matches_team1_fk(name),
        team2:teams!matches_team2_fk(name)
      `
    )
    .eq('tournament_id', tournamentId)
    .eq('tenant_id', tenantId)
    .neq('status', 'cancelled')
    .not('scheduled_at', 'is', null);
}

export async function stageNames(
  db: AdminDb,
  tenantId: string,
  tournamentId: string
) {
  const { data } = await db
    .from('tournament_stages')
    .select('id, name')
    .eq('tournament_id', tournamentId)
    .eq('tenant_id', tenantId);
  return data ?? [];
}

/** Déplacement d'un match (écriture scopée tenant + tournoi). */
export async function moveMatch(
  db: AdminDb,
  tenantId: string,
  tournamentId: string,
  matchId: string,
  scheduledAt: string | null
) {
  return db
    .from('matches')
    .update({ scheduled_at: scheduledAt, updated_at: new Date().toISOString() })
    .eq('id', matchId)
    .eq('tenant_id', tenantId)
    .eq('tournament_id', tournamentId);
}
