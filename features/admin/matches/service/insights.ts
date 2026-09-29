// features/admin/matches/service/insights.ts — lectures staff autour d'un
// match : historique du journal, analytique (réducteur pur
// utils/analytics/matchAnalytics), pool de cartes jouables, recherche.

import { LegacyAdminError } from '@/utils/admin/errors';
import type { ServiceContext } from '@/utils/admin/serviceContext';
import { formatStaffLog, type StaffLog } from '@/utils/staffLogs';
import {
  computeMatchAnalytics,
  type AnalyticsGame,
  type AnalyticsVeto,
} from '@/utils/analytics/matchAnalytics';
import type {
  AnalyticsDraftStep,
  AnalyticsHeroRef,
} from '@/utils/analytics/tournamentAnalytics';
import { resolveEffectiveMapPool, toOne } from '@/utils/maps/pool';
import { parisDayKey } from '@/utils/maps/roundPools';
import { escapePostgrestValue, sanitizeSearch } from '@/utils/apiHelpers';
import * as repo from '../repository/reads';
import { withInternalError } from './internal';

/* ---- Historique staff d'un match ---- */

export async function getMatchHistory(ctx: ServiceContext, matchId: string) {
  return withInternalError(
    ctx,
    '[/api/admin/matches/[matchId]/history] error:',
    async () => {
      const { matchLogs, gameLogs, moveLogs } = await repo.listMatchHistoryLogs(
        ctx.db,
        ctx.tenantId,
        matchId
      );
      // Une source en échec n'empêche pas les autres (comportement d'origine).
      if (matchLogs.error) {
        ctx.logger.error('match history: matchLogs error:', matchLogs.error);
      }
      if (gameLogs.error) {
        ctx.logger.error('match history: gameLogs error:', gameLogs.error);
      }
      if (moveLogs.error) {
        ctx.logger.error('match history: moveLogs error:', moveLogs.error);
      }

      const rawLogs = [
        ...((matchLogs.data ?? []) as unknown as StaffLog[]),
        ...((gameLogs.data ?? []) as unknown as StaffLog[]),
        ...((moveLogs.data ?? []) as unknown as StaffLog[]),
      ];
      rawLogs.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));

      return { matchId, logs: rawLogs.map((log) => formatStaffLog(log)) };
    }
  );
}

/* ---- Analytique d'un match ---- */

export async function getMatchAnalytics(ctx: ServiceContext, matchId: string) {
  return withInternalError(
    ctx,
    '[admin/matches/analytics] internal error:',
    async () => {
      const { row: match, error: mErr } = await repo.getMatchTeams(
        ctx.db,
        ctx.tenantId,
        matchId
      );
      if (mErr) {
        ctx.logger.error('[admin/matches/analytics] match error:', mErr);
        throw new LegacyAdminError(500, 'Failed to fetch match');
      }
      if (!match) throw new LegacyAdminError(404, 'Match not found');

      const { games, vetos, drafts } = await repo.readMatchAnalyticsSources(
        ctx.db,
        ctx.tenantId,
        matchId
      );
      const failures = [
        [games.error, 'games', 'Failed to fetch games'],
        [vetos.error, 'vetos', 'Failed to fetch vetos'],
        [drafts.error, 'drafts', 'Failed to fetch drafts'],
      ] as const;
      for (const [error, what, message] of failures) {
        if (error) {
          ctx.logger.error(`[admin/matches/analytics] ${what} error:`, error);
          throw new LegacyAdminError(500, message);
        }
      }

      // Étapes de draft : draft_id → game_index.
      let draftSteps: AnalyticsDraftStep[] = [];
      const draftRows = drafts.data ?? [];
      if (draftRows.length > 0) {
        const gameIndexByDraft = new Map<string, number>(
          draftRows.map((d) => [d.id, d.game_index])
        );
        const { rows: steps, error: stepsErr } = await repo.listDraftSteps(
          ctx.db,
          draftRows.map((d) => d.id)
        );
        if (stepsErr) {
          ctx.logger.error(
            '[admin/matches/analytics] draft steps error:',
            stepsErr
          );
          throw new LegacyAdminError(500, 'Failed to fetch draft steps');
        }
        draftSteps = (steps ?? [])
          .map((s): AnalyticsDraftStep | null => {
            const gameIndex = gameIndexByDraft.get(s.draft_id);
            if (gameIndex === undefined) return null;
            return {
              match_id: matchId,
              game_index: gameIndex,
              action: s.action as AnalyticsDraftStep['action'],
              side: s.side as AnalyticsDraftStep['side'],
              hero_id: s.hero_id,
              phase: s.phase,
            };
          })
          .filter((s): s is AnalyticsDraftStep => s !== null);
      }

      // Héros (id → nom).
      const heroesById = new Map<string, AnalyticsHeroRef>();
      const heroIds = Array.from(
        new Set(
          draftSteps
            .map((s) => s.hero_id)
            .filter((v): v is string => Boolean(v))
        )
      );
      if (heroIds.length > 0) {
        for (const h of await repo.listHeroNames(ctx.db, heroIds)) {
          heroesById.set(h.id, h);
        }
      }

      const analytics = computeMatchAnalytics({
        team1Id: match.team1_id,
        team2Id: match.team2_id,
        games: (games.data ?? []) as AnalyticsGame[],
        vetos: (vetos.data ?? []) as AnalyticsVeto[],
        draftSteps,
        heroesById,
      });
      return { analytics };
    }
  );
}

/* ---- Pool de cartes applicable (écran d'arbitrage) ---- */

type MapPoolClient = Parameters<typeof resolveEffectiveMapPool>[0];

export async function getMatchMapPool(ctx: ServiceContext, matchId: string) {
  return withInternalError(
    ctx,
    '[admin/matches/:id/map-pool] error:',
    async () => {
      const { row, error } = await repo.getMatchForMapPool(
        ctx.db,
        ctx.tenantId,
        matchId
      );
      if (error) {
        ctx.logger.error('[admin/matches/:id/map-pool] lookup error:', error);
        throw new LegacyAdminError(500, 'Failed to load match');
      }
      if (!row) throw new LegacyAdminError(404, 'Match not found');

      const { maps, source } = await resolveEffectiveMapPool(
        ctx.db as MapPoolClient,
        {
          tenantId: ctx.tenantId,
          tournamentId: row.tournament_id,
          game: toOne(row.tournament)?.game ?? toOne(row.scrim)?.game ?? null,
          // Pool de la date de jeu, sinon de la journée, sinon du tournoi :
          // l'arbitre voit les cartes réellement jouables CE jour-là.
          roundNumber: row.round_number,
          playDate: parisDayKey(row.scheduled_at),
        }
      );
      return { maps, source };
    }
  );
}

/* ---- Recherche staff (autocomplete du Director) ---- */

export type AdminMatchSearchResult = {
  id: string;
  kickoffAt: string | null;
  tournamentName: string | null;
  teamAName: string | null;
  teamBName: string | null;
  status: string | null;
};

function pickRel(rel: unknown): { id: string; name: string | null } | null {
  if (!rel) return null;
  const obj = Array.isArray(rel) ? rel[0] : rel;
  if (!obj || typeof obj !== 'object') return null;
  const o = obj as Record<string, unknown>;
  if (typeof o.id !== 'string') return null;
  return { id: o.id, name: typeof o.name === 'string' ? o.name : null };
}

/**
 * `q` (≥ 2 caractères utiles) cherche dans les noms d'équipes, de tournoi et
 * les champs texte du match ; `upcoming` (défaut vrai) garde les matchs à
 * venir ou non planifiés ; `limit` 1–50 (défaut 20).
 */
export async function searchAdminMatches(
  ctx: ServiceContext,
  raw: Record<string, unknown>
) {
  const q = sanitizeSearch(raw.q as string | string[] | undefined, 100);
  const upcoming =
    raw.upcoming === undefined ||
    raw.upcoming === '1' ||
    raw.upcoming === 'true';
  const rawLimit = Array.isArray(raw.limit) ? raw.limit[0] : raw.limit;
  const parsedLimit = Number.parseInt(
    (rawLimit as string | undefined) ?? '20',
    10
  );
  const limit = Math.max(
    1,
    Math.min(50, Number.isFinite(parsedLimit) ? parsedLimit : 20)
  );

  return withInternalError(
    ctx,
    '[admin/matches/search] unexpected error',
    async () => {
      let orClauses: string | null = null;
      if (q && q.length >= 2) {
        // PostgREST ne fait pas de .or() sur une table jointe : on résout
        // d'abord les ids d'équipes et de tournois qui correspondent.
        const pattern = `%${escapePostgrestValue(q)}%`;
        const { teams, tournaments } = await repo.findTeamAndTournamentIds(
          ctx.db,
          ctx.tenantId,
          pattern
        );
        if (teams.error) {
          ctx.logger.error(
            '[admin/matches/search] teams lookup error',
            teams.error
          );
        }
        if (tournaments.error) {
          ctx.logger.error(
            '[admin/matches/search] tournaments lookup error',
            tournaments.error
          );
        }
        const teamIds = (teams.data ?? []).map((r) => r.id).filter(Boolean);
        const tournamentIds = (tournaments.data ?? [])
          .map((r) => r.id)
          .filter(Boolean);

        const clauses = [
          `round_name.ilike.${pattern}`,
          `lobby_code.ilike.${pattern}`,
          `notes.ilike.${pattern}`,
        ];
        if (teamIds.length > 0) {
          const list = teamIds.join(',');
          clauses.push(`team1_id.in.(${list})`, `team2_id.in.(${list})`);
        }
        if (tournamentIds.length > 0) {
          clauses.push(`tournament_id.in.(${tournamentIds.join(',')})`);
        }
        orClauses = clauses.join(',');
      }

      const { rows, error } = await repo.searchMatches(ctx.db, ctx.tenantId, {
        upcomingSince: upcoming ? new Date().toISOString() : null,
        orClauses,
        limit,
      });
      if (error) {
        ctx.logger.error('[admin/matches/search] error', error);
        throw new LegacyAdminError(500, 'Echec de la recherche');
      }

      const matches: AdminMatchSearchResult[] = (rows ?? []).map((r) => {
        const t1 = pickRel(r.team1);
        const t2 = pickRel(r.team2);
        const tn = pickRel(r.tournament);
        return {
          id: String(r.id),
          kickoffAt: r.scheduled_at ?? null,
          tournamentName: tn?.name ?? null,
          teamAName: t1?.name ?? null,
          teamBName: t2?.name ?? null,
          status: r.status ?? null,
        };
      });
      return { matches };
    },
    'Erreur serveur'
  );
}
