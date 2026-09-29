// features/admin/tournaments/service/insights.ts — écrans d'analyse d'un
// tournoi : dashboard, historique staff, analytics, aperçu du podium.
//
// Les calculs vivent dans les réducteurs purs existants
// (utils/dashboard/buildTournamentDashboard, utils/analytics/*) : ce service
// charge les lignes (scopées tenant) et les leur passe.

import type { ServiceContext } from '@/utils/admin/serviceContext';
import { fetchDashboardData } from '@/utils/dashboard/buildTournamentDashboard';
import { formatStaffLog } from '@/utils/staffLogs';
import type { StaffLog } from '@/types/staffLogs';
import {
  computeTeamDuels,
  computeTeamTiers,
} from '@/utils/analytics/teamTiers';
import {
  computeTournamentAnalytics,
  type AnalyticsMatch,
  type AnalyticsGame,
  type AnalyticsVeto,
  type AnalyticsDraftStep,
  type AnalyticsTeamRef,
  type AnalyticsHeroRef,
} from '@/utils/analytics/tournamentAnalytics';
import { oneRelation, type Relation } from '@/utils/supabase/relation';
import * as tRepo from '../repository/tournaments';
import * as repo from '../repository/insights';
import { fail } from './common';

/* ---------------------------------------------------------------------------
 * Dashboard (hub unique)
 * ------------------------------------------------------------------------ */

export async function dashboard(ctx: ServiceContext, tournamentId: string) {
  // Défense en profondeur : un tournoi d'un autre tenant est refusé avant de
  // déléguer au helper (lui-même tenant-aware, S5c).
  const { data: row } = await tRepo.findTournament(
    ctx.db,
    ctx.tenantId,
    tournamentId
  );
  if (!row) fail(404, 'Tournament not found');
  const result = await fetchDashboardData(tournamentId, ctx.tenantId);
  if (!result.ok) fail(result.status, result.error);
  return result.data;
}

const nonEmptyString = (v: unknown) => (typeof v === 'string' && v ? v : null);

/* ---------------------------------------------------------------------------
 * Historique staff du tournoi
 * ------------------------------------------------------------------------ */

export async function history(
  ctx: ServiceContext,
  tournamentId: string,
  query: Record<string, unknown>,
  limit: number
) {
  const { data, error } = await repo.tournamentLogs(
    ctx.db,
    ctx.tenantId,
    tournamentId,
    {
      // Un paramètre répété (tableau) était ignoré, pas réduit au premier.
      entityType: nonEmptyString(query.entityType),
      action: nonEmptyString(query.action),
      limit,
    }
  );
  if (error) {
    ctx.logger.error('tournament history logs error:', error);
    fail(500, 'Failed to fetch tournament history');
  }
  const logs = ((data ?? []) as unknown as StaffLog[]).map(formatStaffLog);
  return { tournamentId, logs };
}

/* ---------------------------------------------------------------------------
 * Analytics (matchs / jeux / vetos / drafts)
 * ------------------------------------------------------------------------ */

export async function analytics(ctx: ServiceContext, tournamentId: string) {
  const { data: t, error: tErr } = await tRepo.findTournament(
    ctx.db,
    ctx.tenantId,
    tournamentId
  );
  if (tErr) {
    ctx.logger.error('[admin/tournament/analytics] tournament error:', tErr);
    fail(500, 'Failed to fetch tournament');
  }
  if (!t) fail(404, 'Tournament not found');
  const tournament = { id: t.id, name: t.name, slug: t.slug };

  const { data: matchesData, error: mErr } = await repo.matchesForAnalytics(
    ctx.db,
    ctx.tenantId,
    tournamentId
  );
  if (mErr) {
    ctx.logger.error('[admin/tournament/analytics] matches error:', mErr);
    fail(500, 'Failed to fetch matches');
  }
  const matches = (matchesData ?? []) as AnalyticsMatch[];
  const matchIds = matches.map((m) => m.id);

  let games: AnalyticsGame[] = [];
  let vetos: AnalyticsVeto[] = [];
  let steps: AnalyticsDraftStep[] = [];
  if (matchIds.length > 0) {
    const [gamesRes, vetosRes, draftsRes] = await Promise.all([
      repo.gamesForAnalytics(ctx.db, ctx.tenantId, matchIds),
      repo.vetosForAnalytics(ctx.db, ctx.tenantId, matchIds),
      repo.draftsForAnalytics(ctx.db, ctx.tenantId, matchIds),
    ]);
    const failures = [
      [gamesRes.error, 'games', 'Failed to fetch games'],
      [vetosRes.error, 'vetos', 'Failed to fetch vetos'],
      [draftsRes.error, 'drafts', 'Failed to fetch drafts'],
    ] as const;
    for (const [err, what, message] of failures) {
      if (err) {
        ctx.logger.error(`[admin/tournament/analytics] ${what} error:`, err);
        fail(500, message);
      }
    }
    games = (gamesRes.data ?? []) as AnalyticsGame[];
    vetos = (vetosRes.data ?? []) as AnalyticsVeto[];

    // Étapes de draft : jointure draft_id → (match_id, game_index).
    const drafts = draftsRes.data ?? [];
    if (drafts.length > 0) {
      const meta = new Map(
        drafts.map((d) => [
          d.id,
          { match_id: d.match_id, game_index: d.game_index },
        ])
      );
      const { data: stepsData, error: stepsErr } = await repo.draftSteps(
        ctx.db,
        drafts.map((d) => d.id)
      );
      if (stepsErr) {
        ctx.logger.error(
          '[admin/tournament/analytics] draft steps error:',
          stepsErr
        );
        fail(500, 'Failed to fetch draft steps');
      }
      steps = (stepsData ?? [])
        .map((s): AnalyticsDraftStep | null => {
          const m = meta.get(s.draft_id);
          if (!m) return null;
          return {
            match_id: m.match_id,
            game_index: m.game_index,
            action: s.action as AnalyticsDraftStep['action'],
            side: s.side as AnalyticsDraftStep['side'],
            hero_id: s.hero_id,
            phase: s.phase,
          };
        })
        .filter((s): s is AnalyticsDraftStep => s !== null);
    }
  }

  const teamsById = new Map<string, AnalyticsTeamRef>();
  const teamIds = [
    ...new Set(
      matches
        .flatMap((m) => [m.team1_id, m.team2_id])
        .filter((v): v is string => Boolean(v))
    ),
  ];
  if (teamIds.length > 0) {
    const { data } = await repo.teamNames(ctx.db, ctx.tenantId, teamIds);
    for (const team of data ?? []) teamsById.set(team.id, team);
  }
  const heroesById = new Map<string, AnalyticsHeroRef>();
  const heroIds = [
    ...new Set(
      steps.map((s) => s.hero_id).filter((v): v is string => Boolean(v))
    ),
  ];
  if (heroIds.length > 0) {
    const { data } = await repo.heroNames(ctx.db, heroIds);
    for (const h of data ?? []) heroesById.set(h.id, h);
  }

  const result = computeTournamentAnalytics({
    matches,
    games,
    vetos,
    draftSteps: steps,
    heroesById,
    teamsById,
  });
  // Tier list et duels : préparation d'un tournoi, écran staff seulement.
  return {
    tournament,
    analytics: result,
    tiers: computeTeamTiers(result.teams),
    duels: computeTeamDuels({ matches, games }),
  };
}

/* ---------------------------------------------------------------------------
 * Aperçu du podium (pré-remplissage de la clôture)
 * ------------------------------------------------------------------------ */

type Candidate = {
  team_id: string;
  team_name: string;
  team_short_name: string | null;
  team_logo_url: string | null;
  proposed_rank: number | null;
  source: 'bracket_final' | 'bracket_semi' | 'manual' | null;
};

export async function podiumPreview(ctx: ServiceContext, tournamentId: string) {
  const { data: tournament } = await tRepo.findTournament(
    ctx.db,
    ctx.tenantId,
    tournamentId
  );
  if (!tournament) fail(404, 'Tournament not found');

  const [ttRes, stagesRes, existingRes] = await Promise.all([
    repo.entrantIds(ctx.db, ctx.tenantId, tournamentId),
    repo.lastStage(ctx.db, ctx.tenantId, tournamentId),
    repo.frozenRankings(ctx.db, tournamentId),
  ]);

  const teamIds = (ttRes.data ?? []).map((r) => r.team_id);
  const teamsById = new Map<
    string,
    { name: string; short_name: string | null; logo_url: string | null }
  >();
  if (teamIds.length > 0) {
    const { data } = await repo.teamCards(ctx.db, ctx.tenantId, teamIds);
    for (const t of data ?? []) teamsById.set(t.id, t);
  }

  const candidates = new Map<string, Candidate>();
  for (const tid of teamIds) {
    const team = teamsById.get(tid);
    candidates.set(tid, {
      team_id: tid,
      team_name: team?.name ?? 'Équipe inconnue',
      team_short_name: team?.short_name ?? null,
      team_logo_url: team?.logo_url ?? null,
      proposed_rank: null,
      source: null,
    });
  }

  const last = (stagesRes.data ?? [])[0] ?? null;
  // Suggestion best-effort à partir du dernier bracket ; autres types de
  // phase (swiss, round robin, groupes) : l'admin remplit.
  if (last && last.stage_type === 'bracket') {
    const { data: bm } = await repo.finishedStageMatches(
      ctx.db,
      ctx.tenantId,
      last.id
    );
    const bracketMatches = bm ?? [];
    const finals = bracketMatches
      .filter((m) => m.bracket_side !== 'lower' && m.winner_team_id)
      .sort((a, b) => (b.round_number ?? 0) - (a.round_number ?? 0));
    const grandFinal = finals[0];
    if (grandFinal?.winner_team_id) {
      const winnerId = grandFinal.winner_team_id;
      const loserId =
        grandFinal.team1_id === winnerId
          ? grandFinal.team2_id
          : grandFinal.team1_id;
      const winner = candidates.get(winnerId);
      if (winner) {
        winner.proposed_rank = 1;
        winner.source = 'bracket_final';
      }
      const loser = loserId ? candidates.get(loserId) : undefined;
      if (loser) {
        loser.proposed_rank = 2;
        loser.source = 'bracket_final';
      }
      const semiRound = (grandFinal.round_number ?? 0) - 1;
      if (semiRound > 0) {
        const semiLosers = bracketMatches
          .filter(
            (m) =>
              m.bracket_side !== 'lower' &&
              m.round_number === semiRound &&
              m.winner_team_id
          )
          .map((m) =>
            m.winner_team_id === m.team1_id ? m.team2_id : m.team1_id
          )
          .filter((id): id is string => Boolean(id))
          .filter((id) => id !== winnerId && id !== loserId);
        // V1 : rangs 3 et 4 (ex æquo non géré, l'admin ajuste).
        let nextRank = 3;
        for (const sid of semiLosers) {
          const t = candidates.get(sid);
          if (t && t.proposed_rank === null) {
            t.proposed_rank = nextRank++;
            t.source = 'bracket_semi';
          }
        }
      }
    }
  }

  const existing = (existingRes.data ?? []).map((r) => ({
    team_id: r.team_id,
    team_name:
      oneRelation(r.teams as Relation<{ name: string }>)?.name ??
      'Équipe inconnue',
    rank: r.rank,
    prize: r.prize,
    notes: r.notes,
    frozen_at: r.frozen_at,
  }));

  return {
    tournament: {
      id: tournament.id,
      name: tournament.name,
      status: tournament.status ?? 'draft',
    },
    candidates: [...candidates.values()].sort((a, b) => {
      if (a.proposed_rank === null && b.proposed_rank === null) {
        return a.team_name.localeCompare(b.team_name);
      }
      if (a.proposed_rank === null) return 1;
      if (b.proposed_rank === null) return -1;
      return a.proposed_rank - b.proposed_rank;
    }),
    existing,
    last_stage_type: last?.stage_type ?? null,
  };
}
