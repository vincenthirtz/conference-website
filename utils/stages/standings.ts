// utils/stages/standings.ts
// Calcul generique du classement d'un stage, quel que soit son type.
// Reutilise computeSwissStandings() pour les stages swiss,
// et calcule W/L/D pour les stages group/round_robin/bracket.

import { supabaseAdmin } from '../supabase';
import { computeSwissStandings } from '../swiss/standings';
import { defaultSwissScoreConfig } from '../swiss/utils';
import { getCachedStandings, setCachedStandings } from './standingsCache';
import type { SwissMatchResult, SwissScoreConfig } from '../../types/swiss';
import {
  DEFAULT_TIEBREAKER_ORDER,
  parseTiebreakerOrder,
  rankWithTiebreakers,
  type TiebreakerKey,
  type TiebreakerMatch,
} from './tiebreakers';

export type StageStanding = {
  teamId: string;
  teamName: string | null;
  rank: number;
  wins: number;
  losses: number;
  draws: number;
  score: number;
  seed: number | null;
  /** Cle de poule, uniquement renseignee pour les stages de type "group" */
  groupKey?: string | null;
  /**
   * Le critere qui a departage cette equipe des autres a egalite de points.
   * `null` quand elle n'etait a egalite avec personne. Affiche tel quel :
   * un classement qu'on ne peut pas expliquer est un classement qu'on conteste.
   */
  tiebrokenBy?: TiebreakerKey | null;
};

export type GroupedStandings = {
  /** Cle = group_key (ex: "A", "B"...) */
  groups: Record<string, StageStanding[]>;
  /** Equipes sans assignation de poule (ne devrait pas arriver) */
  unassigned: StageStanding[];
};

type DbMatch = {
  id: string;
  status: string;
  is_bye: boolean | null;
  round_number: number | null;
  team1_id: string | null;
  team2_id: string | null;
  winner_team_id: string | null;
  team1_score: number | null;
  team2_score: number | null;
};

type StageTeamRow = {
  team_id: string;
  seed: number | null;
  team: { id: string; name: string; short_name: string | null } | null;
};

/**
 * Calcule le classement d'un stage. Retourne un tableau trie par performance.
 *
 * @param tenantId Scope multi-tenant — applique a stage_teams et matches pour
 *   eviter toute fuite cross-tenant si jamais un stage_id collisionne entre
 *   deux tenants (peu probable avec des UUIDs mais defense-in-depth S5b-bis).
 */
export async function computeStageStandings(
  tenantId: string,
  stageId: string,
  stageType: string
): Promise<StageStanding[]> {
  if (!supabaseAdmin) {
    throw new Error('Supabase admin client not available');
  }

  // Fetch stage teams with team names
  const { data: stageTeamsData, error: teamsErr } = await supabaseAdmin
    .from('stage_teams')
    .select('team_id, seed, team:teams(id, name, short_name)')
    .eq('stage_id', stageId)
    .eq('tenant_id', tenantId);

  if (teamsErr) {
    throw new Error(`Failed to fetch stage teams: ${teamsErr.message}`);
  }

  // Supabase may return `team` as an array (join) — normalize to single object
  const stageTeams: StageTeamRow[] = (stageTeamsData || []).map((row: any) => ({
    team_id: row.team_id,
    seed: row.seed,
    team: Array.isArray(row.team) ? (row.team[0] ?? null) : (row.team ?? null),
  }));

  if (stageTeams.length === 0) {
    return [];
  }

  // Build team name map
  const teamNameMap = new Map<string, string | null>();
  for (const st of stageTeams) {
    teamNameMap.set(st.team_id, st.team?.name ?? null);
  }

  // Fetch finished matches for the stage
  const { data: matchesData, error: matchesErr } = await supabaseAdmin
    .from('matches')
    .select(
      'id, status, is_bye, round_number, team1_id, team2_id, winner_team_id, team1_score, team2_score'
    )
    .eq('stage_id', stageId)
    .eq('tenant_id', tenantId)
    .neq('status', 'cancelled');

  if (matchesErr) {
    throw new Error(`Failed to fetch matches: ${matchesErr.message}`);
  }

  const matches = (matchesData || []) as DbMatch[];
  const finishedMatches = matches.filter((m) => m.status === 'finished');

  let raw: StageStanding[];
  let cacheHit = false;
  switch (stageType) {
    case 'swiss': {
      // Check cache first — Buchholz computation can be expensive for 30+ teams
      const cached = getCachedStandings(stageId);
      if (cached) {
        // Le cache contient déjà le résultat post-override (cf. set ci-dessous).
        return cached;
      }
      raw = computeSwissStageStandings(stageTeams, finishedMatches);
      cacheHit = false;
      break;
    }
    case 'group':
    case 'round_robin': {
      // L'ordre de departage vit dans les settings du stage. Absent, on prend
      // le defaut (confrontation directe d'abord) : une regle par defaut
      // explicite vaut mieux qu'un tri implicite que personne n'a choisi.
      const { data: stageRow } = await supabaseAdmin
        .from('tournament_stages')
        .select('settings')
        .eq('id', stageId)
        .eq('tenant_id', tenantId)
        .maybeSingle();
      const order =
        parseTiebreakerOrder(
          (stageRow?.settings as { standings_tiebreakers?: unknown } | null)
            ?.standings_tiebreakers
        ) ?? DEFAULT_TIEBREAKER_ORDER;
      raw = computeGroupStandings(stageTeams, finishedMatches, order);
      break;
    }
    case 'bracket':
      raw = computeBracketStandings(stageTeams, finishedMatches, matches);
      break;
    default:
      // showmatch, other: just return by seed
      raw = stageTeams
        .sort((a, b) => (a.seed ?? 999) - (b.seed ?? 999))
        .map((st, idx) => ({
          teamId: st.team_id,
          teamName: st.team?.name ?? null,
          rank: idx + 1,
          wins: 0,
          losses: 0,
          draws: 0,
          score: 0,
          seed: st.seed,
        }));
  }

  const final = await applyTiebreakerOverrides(tenantId, stageId, raw);
  // Cache uniquement les stages swiss (calcul coûteux, cf. case 'swiss').
  if (stageType === 'swiss' && !cacheHit) {
    setCachedStandings(stageId, final);
  }
  return final;
}

/**
 * Applique les overrides admin de tie-break post-tri : si une row
 * stage_tiebreaker_overrides existe pour deux équipes adjacentes ayant
 * le même score, swap leurs positions. Si l'override pointe vers une
 * paire non-adjacente ou de scores différents, on log un warning et on
 * skip — l'admin doit corriger le score d'abord.
 *
 * Re-numérote les ranks après les swaps appliqués.
 */
async function applyTiebreakerOverrides(
  tenantId: string,
  stageId: string,
  standings: StageStanding[]
): Promise<StageStanding[]> {
  if (!supabaseAdmin || standings.length < 2) return standings;

  const { data: overrides, error } = await supabaseAdmin
    .from('stage_tiebreaker_overrides')
    .select('winner_team_id, loser_team_id')
    .eq('stage_id', stageId)
    .eq('tenant_id', tenantId);
  if (error || !overrides || overrides.length === 0) return standings;

  const list = standings.slice();
  const idx = new Map(list.map((s, i) => [s.teamId, i]));

  for (const o of overrides as {
    winner_team_id: string;
    loser_team_id: string;
  }[]) {
    const wi = idx.get(o.winner_team_id);
    const li = idx.get(o.loser_team_id);
    if (wi === undefined || li === undefined) continue;
    if (wi < li) continue; // déjà dans le bon ordre

    // On n'autorise le swap que si les scores sont égaux. Sinon ça
    // bypass la logique de tri normal — ce qui n'est pas l'intention
    // d'un "tiebreaker".
    if (list[wi].score !== list[li].score) continue;

    // Swap simple (peut traverser plus d'une position si écart) : on
    // déplace winner juste avant loser.
    const [item] = list.splice(wi, 1);
    list.splice(li, 0, item);

    // Mettre à jour l'index pour les overrides suivants.
    list.forEach((s, i) => idx.set(s.teamId, i));
  }

  // Re-rank
  return list.map((s, i) => ({ ...s, rank: i + 1 }));
}

/**
 * Calcule les standings d'un stage de type "group" en separant par poule.
 * Chaque groupe est classe independamment (W/L/points/scoreDiff).
 *
 * Renvoie aussi `unassigned` pour les equipes presentes dans stage_teams mais
 * pas dans group_assignments (cas degrade — devrait etre vide en prod).
 */
export async function computeGroupedStandings(
  tenantId: string,
  stageId: string
): Promise<GroupedStandings> {
  if (!supabaseAdmin) {
    throw new Error('Supabase admin client not available');
  }

  // 1) Charger le stage pour recuperer group_assignments
  const { data: stage, error: stageErr } = await supabaseAdmin
    .from('tournament_stages')
    .select('id, stage_type, settings')
    .eq('id', stageId)
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (stageErr || !stage) {
    throw new Error(`Stage ${stageId} not found`);
  }

  const groupAssignments: Record<string, string[]> =
    stage.settings?.group_assignments || {};

  // 2) Charger les stage_teams + matchs
  const { data: stageTeamsData } = await supabaseAdmin
    .from('stage_teams')
    .select('team_id, seed, team:teams(id, name, short_name)')
    .eq('stage_id', stageId)
    .eq('tenant_id', tenantId);

  const stageTeams: StageTeamRow[] = (stageTeamsData || []).map((row: any) => ({
    team_id: row.team_id,
    seed: row.seed,
    team: Array.isArray(row.team) ? (row.team[0] ?? null) : (row.team ?? null),
  }));

  const { data: matchesData } = await supabaseAdmin
    .from('matches')
    .select(
      'id, status, is_bye, round_number, team1_id, team2_id, winner_team_id, team1_score, team2_score, group_key'
    )
    .eq('stage_id', stageId)
    .eq('tenant_id', tenantId)
    .neq('status', 'cancelled');

  type GroupedMatchRow = DbMatch & { group_key: string | null };
  const matches = (matchesData || []) as GroupedMatchRow[];
  const finishedMatches = matches.filter((m) => m.status === 'finished');

  // 3) Index group_key par equipe (depuis settings)
  const teamToGroup = new Map<string, string>();
  for (const [gk, ids] of Object.entries(groupAssignments)) {
    for (const tid of ids) teamToGroup.set(tid, gk);
  }
  // Fallback : utiliser le group_key des matchs si settings vide
  if (teamToGroup.size === 0) {
    for (const m of matches) {
      if (!m.group_key) continue;
      if (m.team1_id && !teamToGroup.has(m.team1_id))
        teamToGroup.set(m.team1_id, m.group_key);
      if (m.team2_id && !teamToGroup.has(m.team2_id))
        teamToGroup.set(m.team2_id, m.group_key);
    }
  }

  // 4) Splitter equipes + matchs par groupe
  const teamsByGroup = new Map<string, StageTeamRow[]>();
  const unassignedTeams: StageTeamRow[] = [];

  for (const st of stageTeams) {
    const gk = teamToGroup.get(st.team_id);
    if (gk) {
      if (!teamsByGroup.has(gk)) teamsByGroup.set(gk, []);
      teamsByGroup.get(gk)!.push(st);
    } else {
      unassignedTeams.push(st);
    }
  }

  const matchesByGroup = new Map<string, DbMatch[]>();
  for (const m of finishedMatches) {
    const gk =
      m.group_key ||
      (m.team1_id && teamToGroup.get(m.team1_id)) ||
      (m.team2_id && teamToGroup.get(m.team2_id)) ||
      null;
    if (!gk) continue;
    if (!matchesByGroup.has(gk)) matchesByGroup.set(gk, []);
    matchesByGroup.get(gk)!.push(m);
  }

  // 5) Calculer chaque groupe via computeGroupStandings (deja existant)
  const groups: Record<string, StageStanding[]> = {};
  for (const [gk, teams] of teamsByGroup) {
    const groupMatches = matchesByGroup.get(gk) || [];
    const standings = computeGroupStandings(teams, groupMatches);
    groups[gk] = standings.map((s) => ({ ...s, groupKey: gk }));
  }

  const unassigned: StageStanding[] =
    unassignedTeams.length > 0
      ? computeGroupStandings(unassignedTeams, []).map((s) => ({
          ...s,
          groupKey: null,
        }))
      : [];

  return { groups, unassigned };
}

/* -----------------------------------------------------------
 * Swiss standings
 * ---------------------------------------------------------*/

function computeSwissStageStandings(
  stageTeams: StageTeamRow[],
  finishedMatches: DbMatch[]
): StageStanding[] {
  const config: SwissScoreConfig = defaultSwissScoreConfig;

  const participants = stageTeams.map((st, idx) => ({
    id: st.team_id,
    name: st.team?.name,
    seed: st.seed ?? idx + 1,
  }));

  const results: SwissMatchResult[] = [];

  for (const m of finishedMatches) {
    if (!m.team1_id) continue;
    const round = m.round_number ?? 0;

    if (m.is_bye || !m.team2_id) {
      results.push({
        round,
        player1Id: m.team1_id,
        player2Id: null,
        player1Score: config.bye,
        player2Score: 0,
      });
      continue;
    }

    if (m.winner_team_id === m.team1_id) {
      results.push({
        round,
        player1Id: m.team1_id,
        player2Id: m.team2_id,
        player1Score: config.win,
        player2Score: config.loss,
      });
    } else if (m.winner_team_id === m.team2_id) {
      results.push({
        round,
        player1Id: m.team1_id,
        player2Id: m.team2_id,
        player1Score: config.loss,
        player2Score: config.win,
      });
    } else {
      results.push({
        round,
        player1Id: m.team1_id,
        player2Id: m.team2_id,
        player1Score: config.draw,
        player2Score: config.draw,
      });
    }
  }

  const standings = computeSwissStandings({ participants, results });

  const teamNameMap = new Map<string, string | null>();
  for (const st of stageTeams) {
    teamNameMap.set(st.team_id, st.team?.name ?? null);
  }

  return standings.map((s, idx) => ({
    teamId: s.id,
    teamName: teamNameMap.get(s.id) ?? s.name ?? null,
    rank: idx + 1,
    wins: s.wins,
    losses: s.losses,
    draws: s.draws,
    score: s.score,
    seed: s.seed ?? null,
  }));
}

/* -----------------------------------------------------------
 * Group / Round Robin standings
 * ---------------------------------------------------------*/

/** @internal Exported for testing */
export function computeGroupStandings(
  stageTeams: StageTeamRow[],
  finishedMatches: DbMatch[],
  tiebreakerOrder: TiebreakerKey[] = DEFAULT_TIEBREAKER_ORDER
): StageStanding[] {
  type Agg = {
    teamId: string;
    wins: number;
    losses: number;
    draws: number;
    points: number;
    scoreDiff: number;
    /** Score total marque — sert au departage `scored`. */
    scored: number;
    seed: number | null;
  };

  const map = new Map<string, Agg>();

  for (const st of stageTeams) {
    map.set(st.team_id, {
      teamId: st.team_id,
      wins: 0,
      losses: 0,
      draws: 0,
      points: 0,
      scoreDiff: 0,
      scored: 0,
      seed: st.seed,
    });
  }

  for (const m of finishedMatches) {
    if (!m.team1_id || !m.team2_id) continue;

    const a1 = map.get(m.team1_id);
    const a2 = map.get(m.team2_id);
    if (!a1 || !a2) continue;

    const s1 = m.team1_score ?? 0;
    const s2 = m.team2_score ?? 0;

    a1.scoreDiff += s1 - s2;
    a2.scoreDiff += s2 - s1;
    a1.scored += s1;
    a2.scored += s2;

    if (m.winner_team_id === m.team1_id) {
      a1.wins += 1;
      a1.points += 3;
      a2.losses += 1;
    } else if (m.winner_team_id === m.team2_id) {
      a2.wins += 1;
      a2.points += 3;
      a1.losses += 1;
    } else {
      // draw
      a1.draws += 1;
      a1.points += 1;
      a2.draws += 1;
      a2.points += 1;
    }
  }

  // Le tri maison (points → diff → victoires → seed) est remplace par la
  // cascade configurable : il ignorait la CONFRONTATION DIRECTE, premier
  // departage de la quasi-totalite des reglements, et ne disait pas ce qui
  // avait tranche.
  const h2hMatches: TiebreakerMatch[] = finishedMatches.map((m) => ({
    team1Id: m.team1_id,
    team2Id: m.team2_id,
    team1Score: m.team1_score,
    team2Score: m.team2_score,
    winnerTeamId: m.winner_team_id,
  }));

  const ranked = rankWithTiebreakers(
    Array.from(map.values()).map((a) => ({
      teamId: a.teamId,
      points: a.points,
      wins: a.wins,
      scoreDiff: a.scoreDiff,
      scored: a.scored,
      seed: a.seed,
    })),
    h2hMatches,
    tiebreakerOrder
  );

  const aggById = new Map(Array.from(map.values()).map((a) => [a.teamId, a]));
  const teamNameMap = new Map<string, string | null>();
  for (const st of stageTeams) {
    teamNameMap.set(st.team_id, st.team?.name ?? null);
  }

  return ranked.map((r) => {
    const a = aggById.get(r.teamId);
    return {
      teamId: r.teamId,
      teamName: teamNameMap.get(r.teamId) ?? null,
      rank: r.rank,
      wins: r.wins,
      losses: a?.losses ?? 0,
      draws: a?.draws ?? 0,
      score: r.points,
      seed: r.seed,
      tiebrokenBy: r.tiebrokenBy,
    };
  });
}

/* -----------------------------------------------------------
 * Bracket standings (based on elimination round)
 * ---------------------------------------------------------*/

/** @internal Exported for testing */
export function computeBracketStandings(
  stageTeams: StageTeamRow[],
  finishedMatches: DbMatch[],
  allMatches: DbMatch[]
): StageStanding[] {
  // For bracket: rank based on the furthest round reached.
  // The winner of the highest round match is #1, loser is #2, etc.
  // Teams eliminated in earlier rounds are ranked lower.

  const maxRound = allMatches.reduce(
    (acc, m) => Math.max(acc, m.round_number ?? 0),
    0
  );

  // Track the last round each team won
  const lastWinRound = new Map<string, number>();
  const teamWins = new Map<string, number>();
  const teamLosses = new Map<string, number>();

  for (const m of finishedMatches) {
    if (!m.team1_id) continue;

    if (m.winner_team_id) {
      const loserId = m.winner_team_id === m.team1_id ? m.team2_id : m.team1_id;

      const winRound = m.round_number ?? 0;
      const prev = lastWinRound.get(m.winner_team_id) ?? 0;
      if (winRound > prev) lastWinRound.set(m.winner_team_id, winRound);

      teamWins.set(m.winner_team_id, (teamWins.get(m.winner_team_id) ?? 0) + 1);
      if (loserId) {
        teamLosses.set(loserId, (teamLosses.get(loserId) ?? 0) + 1);
      }
    }
  }

  const teamNameMap = new Map<string, string | null>();
  for (const st of stageTeams) {
    teamNameMap.set(st.team_id, st.team?.name ?? null);
  }

  // Sort: highest lastWinRound first, then by wins, then by seed
  const teams = stageTeams.map((st) => ({
    teamId: st.team_id,
    lastWinRound: lastWinRound.get(st.team_id) ?? 0,
    wins: teamWins.get(st.team_id) ?? 0,
    losses: teamLosses.get(st.team_id) ?? 0,
    seed: st.seed,
  }));

  teams.sort((a, b) => {
    if (b.lastWinRound !== a.lastWinRound)
      return b.lastWinRound - a.lastWinRound;
    if (b.wins !== a.wins) return b.wins - a.wins;
    return (a.seed ?? 999) - (b.seed ?? 999);
  });

  return teams.map((t, idx) => ({
    teamId: t.teamId,
    teamName: teamNameMap.get(t.teamId) ?? null,
    rank: idx + 1,
    wins: t.wins,
    losses: t.losses,
    draws: 0,
    score: t.lastWinRound,
    seed: t.seed,
  }));
}
