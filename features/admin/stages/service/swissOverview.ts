// features/admin/stages/service/swissOverview.ts — GET
// /api/admin/stages/[stageId]/swiss : l'écran d'une phase suisse
// (pages/admin/stages/[stageId]/swiss.tsx) — classement enrichi + rondes.
//
// L'ORDRE du classement n'est pas recalculé ici : il vient de
// computeStageStandings (utils/stages/standings), le même que la modale
// d'avancement et le classement public — dérogations de départage
// appliquées, équipes disqualifiées classées en dernier et marquées
// (`disqualified` / `disqualificationMode`). Ce module n'y ajoute que les
// colonnes propres à la suisse (manches, Buchholz, taux de victoire des
// adversaires), calculées sur les mêmes matchs : comptés (terminés ou
// forfaits), hors matchs d'une équipe disqualifiée en mode « annul ».

import type { ServiceContext } from '@/utils/admin/serviceContext';
import { isCountedMatch } from '@/utils/stages/countedMatches';
import {
  type DisqualificationMap,
  type DisqualificationMode,
  excludeAnnulledMatches,
  readDisqualificationMap,
} from '@/utils/stages/disqualification';
import {
  computeStageStandings,
  type StageStanding,
} from '@/utils/stages/standings';
import { oneRelation, type Relation } from '@/utils/supabase/relation';
import type { MatchStatus } from '@/types/admin';
import * as stages from '../repository/stages';
import * as matches from '../repository/matches';
import * as related from '../repository/related';
import { fail, stageNotFound } from './common';

export type SwissTeamMini = {
  id: string;
  name: string;
  short_name: string | null;
  logo_url: string | null;
};

export type SwissOverviewMatch = {
  id: string;
  tournament_id: string;
  stage_id: string | null;
  status: string;
  is_bye: boolean | null;
  round_number: number | null;
  best_of: number | null;
  scheduled_at: string | null;
  team1_id: string | null;
  team2_id: string | null;
  winner_team_id: string | null;
  team1_score: number | null;
  team2_score: number | null;
};

export type SwissOverviewStanding = {
  team_id: string;
  team: SwissTeamMini | null;
  rank: number;
  wins: number;
  losses: number;
  draws: number;
  points: number;
  /** Manches gagnées / perdues (scores des matchs, BYE exclus). */
  games_won: number;
  games_lost: number;
  /** Matchs nuls (aucune manche nulle n'est stockée). */
  games_drawn: number;
  /** Somme des points des adversaires rencontrés (BYE exclus). */
  buchholz: number | null;
  /** Même somme, exposée sous ce nom pour l'écran (historique). */
  opp_score_sum: number | null;
  /** Moyenne des taux de victoire des adversaires (0 → 1). */
  opp_winrate: number | null;
  /** Matchs comptés, BYE compris. */
  match_count: number;
  disqualified?: boolean;
  disqualificationMode?: DisqualificationMode;
};

export type SwissOverviewRound = {
  round_number: number;
  matches: (Omit<SwissOverviewMatch, 'status'> & {
    status: MatchStatus;
    team1: SwissTeamMini | null;
    team2: SwissTeamMini | null;
  })[];
};

type TeamAgg = {
  gamesWon: number;
  gamesLost: number;
  matchCount: number;
  opponents: string[];
};

/**
 * Colonnes suisses du classement, dans l'ordre de `standings`. PURE.
 * `standings` : sortie de computeStageStandings (rang, disqualification).
 */
export function buildSwissOverviewStandings(
  standings: StageStanding[],
  allMatches: SwissOverviewMatch[],
  teams: Map<string, SwissTeamMini>,
  dq: DisqualificationMap
): SwissOverviewStanding[] {
  const counted = excludeAnnulledMatches(
    allMatches.filter((m) => isCountedMatch(m)),
    dq
  );
  const agg = new Map<string, TeamAgg>();
  const aggOf = (id: string) => {
    let a = agg.get(id);
    if (!a) {
      a = { gamesWon: 0, gamesLost: 0, matchCount: 0, opponents: [] };
      agg.set(id, a);
    }
    return a;
  };
  for (const m of counted) {
    if (!m.team1_id) continue;
    if (m.is_bye || !m.team2_id) {
      aggOf(m.team1_id).matchCount += 1;
      continue;
    }
    const s1 = m.team1_score ?? 0;
    const s2 = m.team2_score ?? 0;
    const a1 = aggOf(m.team1_id);
    const a2 = aggOf(m.team2_id);
    a1.matchCount += 1;
    a2.matchCount += 1;
    a1.gamesWon += s1;
    a1.gamesLost += s2;
    a2.gamesWon += s2;
    a2.gamesLost += s1;
    a1.opponents.push(m.team2_id);
    a2.opponents.push(m.team1_id);
  }

  const byId = new Map(standings.map((s) => [s.teamId, s]));
  const winrate = (id: string): number | null => {
    const s = byId.get(id);
    if (!s) return null;
    const played = s.wins + s.losses + s.draws;
    return played > 0 ? s.wins / played : null;
  };

  return standings.map((s) => {
    const a = agg.get(s.teamId);
    const opponents = a?.opponents ?? [];
    let buchholz: number | null = null;
    let oppWinrate: number | null = null;
    if (opponents.length > 0) {
      buchholz = opponents.reduce(
        (sum, id) => sum + (byId.get(id)?.score ?? 0),
        0
      );
      const rates = opponents
        .map(winrate)
        .filter((r): r is number => r !== null);
      oppWinrate =
        rates.length > 0
          ? rates.reduce((x, y) => x + y, 0) / rates.length
          : null;
    }
    const team = teams.get(s.teamId) ?? null;
    return {
      team_id: s.teamId,
      team:
        team ??
        (s.teamName
          ? { id: s.teamId, name: s.teamName, short_name: null, logo_url: null }
          : null),
      rank: s.rank,
      wins: s.wins,
      losses: s.losses,
      draws: s.draws,
      points: s.score,
      games_won: a?.gamesWon ?? 0,
      games_lost: a?.gamesLost ?? 0,
      games_drawn: s.draws,
      buchholz,
      opp_score_sum: buchholz,
      opp_winrate: oppWinrate,
      match_count: a?.matchCount ?? 0,
      ...(s.disqualified
        ? {
            disqualified: true,
            disqualificationMode: s.disqualificationMode,
          }
        : {}),
    };
  });
}

/** Matchs groupés par ronde (croissante), équipes jointes. PURE. */
export function buildSwissRounds(
  allMatches: SwissOverviewMatch[],
  teams: Map<string, SwissTeamMini>
): SwissOverviewRound[] {
  const rounds = new Map<number, SwissOverviewRound['matches']>();
  for (const m of allMatches) {
    const n = m.round_number ?? 0;
    const list = rounds.get(n) ?? [];
    list.push({
      ...m,
      status: m.status as MatchStatus,
      team1: m.team1_id ? (teams.get(m.team1_id) ?? null) : null,
      team2: m.team2_id ? (teams.get(m.team2_id) ?? null) : null,
    });
    rounds.set(n, list);
  }
  return [...rounds.entries()]
    .sort(([a], [b]) => a - b)
    .map(([round_number, list]) => ({ round_number, matches: list }));
}

export async function swissOverview(ctx: ServiceContext, id: string) {
  const { row: stage, error: stageErr } = await stages.getStageCore(
    ctx.db,
    ctx.tenantId,
    id
  );
  if (stageErr || !stage) throw stageNotFound();
  if (stage.stage_type !== 'swiss') {
    throw fail(400, 'This endpoint is only for swiss stages.');
  }

  const [tournament, teamRes, matchRes, standings, dq] = await Promise.all([
    related.tournamentSummary(ctx.db, ctx.tenantId, stage.tournament_id),
    stages.stageTeamsWithTeam(ctx.db, ctx.tenantId, id),
    matches.swissOverviewMatches(ctx.db, ctx.tenantId, id),
    computeStageStandings(ctx.tenantId, id, 'swiss'),
    readDisqualificationMap(ctx.tenantId, id),
  ]);
  if (teamRes.error || matchRes.error) {
    ctx.logger.error(
      '[swiss] lecture équipes / matchs',
      teamRes.error ?? matchRes.error
    );
    throw fail(500, 'Failed to fetch swiss stage data');
  }

  const teams = new Map<string, SwissTeamMini>();
  for (const row of teamRes.rows ?? []) {
    const team = oneRelation(row.team as Relation<SwissTeamMini>);
    if (team) teams.set(row.team_id, team);
  }
  const allMatches = (matchRes.rows ?? []) as SwissOverviewMatch[];

  return {
    stage: { id: stage.id, name: stage.name, stage_type: stage.stage_type },
    tournament: tournament ?? null,
    standings: buildSwissOverviewStandings(standings, allMatches, teams, dq),
    rounds: buildSwissRounds(allMatches, teams),
  };
}
