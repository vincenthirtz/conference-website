// utils/predictions/readState.ts
//
// Lectures des pronostics pour l'espace joueuse : l'état d'UN match (carte de
// la page match) et la liste « à pronostiquer / mes pronostics » (page TCG).
//
// LA RÉPARTITION N'EST RENDUE QU'UNE FOIS LE MATCH VERROUILLÉ. Montrer « 80 %
// voient Alpha gagner » pendant que les pronostics sont ouverts pousse à suivre
// la foule plutôt qu'à juger le match, et transforme la carte en sondage.

import { supabaseAdmin } from '@/utils/supabase';
import { MATCH_PREDICTION_COINS } from '@/utils/tcg/earnSources';
import {
  PREDICTION_MATCH_COLUMNS,
  predictionWindow,
  type PredictionIneligibility,
  type PredictionMatch,
  type PredictionResult,
  type PredictionWindow,
} from './rules';

export type PredictionTeam = {
  id: string;
  name: string;
  logoUrl: string | null;
};

export type MyPrediction = {
  teamId: string;
  result: PredictionResult | null;
  updatedAt: string;
};

export type MatchPredictionState = {
  matchId: string;
  window: PredictionWindow;
  /** Heure prévue du match : les pronostics ferment à cet instant. */
  locksAt: string | null;
  /** Pièces d'un pronostic juste. */
  reward: number;
  team1Id: string | null;
  team2Id: string | null;
  /** `null` = la joueuse peut pronostiquer ce match. */
  ineligibility: PredictionIneligibility | null;
  prediction: MyPrediction | null;
  /** Nombre de pronostics par équipe, rendu seulement une fois verrouillé. */
  distribution: { team1: number; team2: number } | null;
};

export type PredictionListItem = {
  matchId: string;
  tournamentName: string | null;
  scheduledAt: string | null;
  team1: PredictionTeam | null;
  team2: PredictionTeam | null;
  winnerTeamId: string | null;
  prediction: MyPrediction | null;
};

export type PlayerPredictionsResponse = {
  reward: number;
  /** Matchs à venir encore ouverts, hors matchs de ses propres équipes. */
  open: PredictionListItem[];
  /** Ses derniers pronostics, du plus récent au plus ancien. */
  recent: PredictionListItem[];
  /** Le staff ne pronostique pas : la page le dit au lieu d'une liste vide. */
  ineligibility: PredictionIneligibility | null;
};

type Read<T> = { ok: true; value: T } | { ok: false; error: string };

type PredictionRow = {
  match_id: string;
  predicted_winner_team_id: string;
  result: PredictionResult | null;
  updated_at: string;
};

const OPEN_LIMIT = 10;
const RECENT_LIMIT = 20;

function toMyPrediction(row: PredictionRow | null): MyPrediction | null {
  if (!row) return null;
  return {
    teamId: row.predicted_winner_team_id,
    result: row.result ?? null,
    updatedAt: row.updated_at,
  };
}

export async function readMatchForPrediction(
  tenantId: string,
  matchId: string
): Promise<Read<PredictionMatch | null>> {
  if (!supabaseAdmin) return { ok: false, error: 'supabase indisponible' };
  const { data, error } = await supabaseAdmin
    .from('matches')
    .select(PREDICTION_MATCH_COLUMNS)
    .eq('tenant_id', tenantId)
    .eq('id', matchId)
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  return { ok: true, value: (data as unknown as PredictionMatch) ?? null };
}

export async function readMatchPredictionState(input: {
  match: PredictionMatch;
  userId: string;
  ineligibility: PredictionIneligibility | null;
  now: Date;
}): Promise<Read<MatchPredictionState>> {
  const { match, userId, now } = input;
  if (!supabaseAdmin) return { ok: false, error: 'supabase indisponible' };

  const { data: mine, error: mineError } = await supabaseAdmin
    .from('match_predictions')
    .select('match_id, predicted_winner_team_id, result, updated_at')
    .eq('tenant_id', match.tenant_id)
    .eq('match_id', match.id)
    .eq('user_id', userId)
    .maybeSingle();
  if (mineError) return { ok: false, error: mineError.message };

  const window = predictionWindow(match, now);
  let distribution: MatchPredictionState['distribution'] = null;
  if (window === 'locked' && match.team1_id && match.team2_id) {
    const counts: number[] = [];
    for (const teamId of [match.team1_id, match.team2_id]) {
      const { count, error } = await supabaseAdmin
        .from('match_predictions')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', match.tenant_id)
        .eq('match_id', match.id)
        .eq('predicted_winner_team_id', teamId);
      if (error) return { ok: false, error: error.message };
      counts.push(count ?? 0);
    }
    distribution = { team1: counts[0], team2: counts[1] };
  }

  return {
    ok: true,
    value: {
      matchId: match.id,
      window,
      locksAt: match.scheduled_at,
      reward: MATCH_PREDICTION_COINS,
      team1Id: match.team1_id,
      team2Id: match.team2_id,
      ineligibility: input.ineligibility,
      prediction: toMyPrediction((mine as PredictionRow | null) ?? null),
      distribution,
    },
  };
}

/** Les équipes d'une personne dans l'espace : roster (tout statut) et capitanat. */
async function readOwnTeamIds(
  tenantId: string,
  userId: string
): Promise<Read<Set<string>>> {
  if (!supabaseAdmin) return { ok: false, error: 'supabase indisponible' };
  const ids = new Set<string>();
  const { data: members, error: membersError } = await supabaseAdmin
    .from('team_members')
    .select('team_id')
    .eq('tenant_id', tenantId)
    .eq('user_id', userId);
  if (membersError) return { ok: false, error: membersError.message };
  for (const row of (members ?? []) as Array<{ team_id: string | null }>) {
    if (row.team_id) ids.add(row.team_id);
  }
  const { data: captained, error: captainError } = await supabaseAdmin
    .from('teams')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('captain_id', userId);
  if (captainError) return { ok: false, error: captainError.message };
  for (const row of (captained ?? []) as Array<{ id: string }>) {
    ids.add(row.id);
  }
  return { ok: true, value: ids };
}

async function readTeams(
  tenantId: string,
  teamIds: string[]
): Promise<Read<Map<string, PredictionTeam>>> {
  const map = new Map<string, PredictionTeam>();
  if (teamIds.length === 0) return { ok: true, value: map };
  if (!supabaseAdmin) return { ok: false, error: 'supabase indisponible' };
  const { data, error } = await supabaseAdmin
    .from('teams')
    .select('id, name, short_name, logo_url')
    .eq('tenant_id', tenantId)
    .in('id', [...new Set(teamIds)]);
  if (error) return { ok: false, error: error.message };
  for (const row of (data ?? []) as Array<{
    id: string;
    name: string | null;
    short_name: string | null;
    logo_url: string | null;
  }>) {
    map.set(row.id, {
      id: row.id,
      name: row.short_name || row.name || '',
      logoUrl: row.logo_url ?? null,
    });
  }
  return { ok: true, value: map };
}

async function readTournamentNames(
  tenantId: string,
  ids: string[]
): Promise<Read<Map<string, string>>> {
  const map = new Map<string, string>();
  if (ids.length === 0) return { ok: true, value: map };
  if (!supabaseAdmin) return { ok: false, error: 'supabase indisponible' };
  const { data, error } = await supabaseAdmin
    .from('tournaments')
    .select('id, name, short_name')
    .eq('tenant_id', tenantId)
    .in('id', [...new Set(ids)]);
  if (error) return { ok: false, error: error.message };
  for (const row of (data ?? []) as Array<{
    id: string;
    name: string | null;
    short_name: string | null;
  }>) {
    map.set(row.id, row.short_name || row.name || '');
  }
  return { ok: true, value: map };
}

export async function readPlayerPredictions(input: {
  tenantId: string;
  userId: string;
  isStaff: boolean;
  now: Date;
}): Promise<Read<PlayerPredictionsResponse>> {
  const { tenantId, userId, now } = input;
  if (!supabaseAdmin) return { ok: false, error: 'supabase indisponible' };

  const { data: recentRows, error: recentError } = await supabaseAdmin
    .from('match_predictions')
    .select('match_id, predicted_winner_team_id, result, updated_at')
    .eq('tenant_id', tenantId)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(RECENT_LIMIT);
  if (recentError) return { ok: false, error: recentError.message };
  const predictions = (recentRows ?? []) as PredictionRow[];
  const byMatch = new Map(predictions.map((row) => [row.match_id, row]));

  let openMatches: PredictionMatch[] = [];
  if (!input.isStaff) {
    const own = await readOwnTeamIds(tenantId, userId);
    if (!own.ok) return own;
    const { data, error } = await supabaseAdmin
      .from('matches')
      .select(PREDICTION_MATCH_COLUMNS)
      .eq('tenant_id', tenantId)
      .eq('status', 'pending')
      .is('deleted_at', null)
      .is('scrim_id', null)
      .gt('scheduled_at', now.toISOString())
      .order('scheduled_at', { ascending: true })
      // Marge : on retire ensuite byes, équipes inconnues et ses propres matchs.
      .limit(OPEN_LIMIT * 4);
    if (error) return { ok: false, error: error.message };
    openMatches = ((data ?? []) as unknown as PredictionMatch[])
      .filter((match) => predictionWindow(match, now) === 'open')
      .filter(
        (match) =>
          !own.value.has(match.team1_id as string) &&
          !own.value.has(match.team2_id as string)
      )
      .slice(0, OPEN_LIMIT);
  }

  let recentMatches: PredictionMatch[] = [];
  const recentIds = predictions.map((row) => row.match_id);
  if (recentIds.length > 0) {
    const { data, error } = await supabaseAdmin
      .from('matches')
      .select(PREDICTION_MATCH_COLUMNS)
      .eq('tenant_id', tenantId)
      .in('id', recentIds);
    if (error) return { ok: false, error: error.message };
    const found = new Map(
      ((data ?? []) as unknown as PredictionMatch[]).map((m) => [m.id, m])
    );
    recentMatches = recentIds
      .map((id) => found.get(id))
      .filter((m): m is PredictionMatch => Boolean(m));
  }

  const all = [...openMatches, ...recentMatches];
  const teams = await readTeams(
    tenantId,
    all.flatMap((m) => [m.team1_id, m.team2_id]).filter(Boolean) as string[]
  );
  if (!teams.ok) return teams;
  const tournaments = await readTournamentNames(
    tenantId,
    all.map((m) => m.tournament_id).filter(Boolean) as string[]
  );
  if (!tournaments.ok) return tournaments;

  const toItem = (match: PredictionMatch): PredictionListItem => ({
    matchId: match.id,
    tournamentName: match.tournament_id
      ? (tournaments.value.get(match.tournament_id) ?? null)
      : null,
    scheduledAt: match.scheduled_at,
    team1: match.team1_id ? (teams.value.get(match.team1_id) ?? null) : null,
    team2: match.team2_id ? (teams.value.get(match.team2_id) ?? null) : null,
    winnerTeamId: match.status === 'finished' ? match.winner_team_id : null,
    prediction: toMyPrediction(byMatch.get(match.id) ?? null),
  });

  return {
    ok: true,
    value: {
      reward: MATCH_PREDICTION_COINS,
      open: openMatches.map(toItem),
      recent: recentMatches.map(toItem),
      ineligibility: input.isStaff ? 'staff' : null,
    },
  };
}
