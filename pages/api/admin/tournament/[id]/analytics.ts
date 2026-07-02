// pages/api/admin/tournament/[id]/analytics.ts
// Admin: analytics agregees d'un tournoi (lecture seule, aucune nouvelle table).
// - GET : agrege matches / games / vetos / drafts en un rapport analytique.
//
// Le calcul vit dans le reducteur pur utils/analytics/tournamentAnalytics.ts ;
// ce handler ne fait que charger les rows (scopees tenant) et appeler le
// reducteur.

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, AuthenticatedStaffContext } from '@/utils/staff';
import { isValidUUID } from '@/utils/apiHelpers';
import {
  computeTournamentAnalytics,
  type AnalyticsMatch,
  type AnalyticsGame,
  type AnalyticsVeto,
  type AnalyticsDraftStep,
  type AnalyticsTeamRef,
  type AnalyticsHeroRef,
} from '@/utils/analytics/tournamentAnalytics';
import { logger } from '../../../../../utils/logger';

export default withStaffRoute(handler, 'manager');

type DraftRow = { id: string; match_id: string; game_index: number };
type DraftStepRow = {
  draft_id: string;
  action: 'ban' | 'pick';
  side: 'team1' | 'team2';
  hero_id: string | null;
  phase: string | null;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  const { id } = req.query;

  if (!id || Array.isArray(id) || !isValidUUID(id)) {
    return res.status(400).json({ error: 'Invalid tournament id' });
  }

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const tournamentId = String(id);

  try {
    // 1) Tournoi existe + scope tenant.
    const { data: tournament, error: tErr } = await supabaseAdmin
      .from('tournaments')
      .select('id, name, slug')
      .eq('id', tournamentId)
      .eq('tenant_id', ctx.tenantId)
      .maybeSingle();

    if (tErr) {
      logger.error('[admin/tournament/analytics] tournament error:', tErr);
      return res.status(500).json({ error: 'Failed to fetch tournament' });
    }
    if (!tournament) {
      return res.status(404).json({ error: 'Tournament not found' });
    }

    // 2) Matches du tournoi (scope tenant).
    const { data: matchesData, error: mErr } = await supabaseAdmin
      .from('matches')
      .select('id, team1_id, team2_id, winner_team_id, status, is_bye')
      .eq('tournament_id', tournamentId)
      .eq('tenant_id', ctx.tenantId);

    if (mErr) {
      logger.error('[admin/tournament/analytics] matches error:', mErr);
      return res.status(500).json({ error: 'Failed to fetch matches' });
    }
    const matches = (matchesData ?? []) as AnalyticsMatch[];
    const matchIds = matches.map((m) => m.id);

    // Rows dependant des match_ids (batch .in()).
    let games: AnalyticsGame[] = [];
    let vetos: AnalyticsVeto[] = [];
    let draftSteps: AnalyticsDraftStep[] = [];

    if (matchIds.length > 0) {
      const [gamesRes, vetosRes, draftsRes] = await Promise.all([
        supabaseAdmin
          .from('games')
          .select(
            'match_id, map_name, map_order, team1_score, team2_score, winner_team_id, duration_minutes, is_tiebreaker, went_overtime'
          )
          .in('match_id', matchIds)
          .eq('tenant_id', ctx.tenantId),
        supabaseAdmin
          .from('match_map_vetos')
          .select('match_id, step_number, action, team_id, map_name')
          .in('match_id', matchIds)
          .eq('tenant_id', ctx.tenantId),
        supabaseAdmin
          .from('match_drafts')
          .select('id, match_id, game_index')
          .in('match_id', matchIds)
          .eq('tenant_id', ctx.tenantId),
      ]);

      if (gamesRes.error) {
        logger.error(
          '[admin/tournament/analytics] games error:',
          gamesRes.error
        );
        return res.status(500).json({ error: 'Failed to fetch games' });
      }
      if (vetosRes.error) {
        logger.error(
          '[admin/tournament/analytics] vetos error:',
          vetosRes.error
        );
        return res.status(500).json({ error: 'Failed to fetch vetos' });
      }
      if (draftsRes.error) {
        logger.error(
          '[admin/tournament/analytics] drafts error:',
          draftsRes.error
        );
        return res.status(500).json({ error: 'Failed to fetch drafts' });
      }

      games = (gamesRes.data ?? []) as AnalyticsGame[];
      vetos = (vetosRes.data ?? []) as AnalyticsVeto[];

      // Draft steps : join via draft_id -> (match_id, game_index).
      const drafts = (draftsRes.data ?? []) as DraftRow[];
      if (drafts.length > 0) {
        const draftIds = drafts.map((d) => d.id);
        const draftMeta = new Map<
          string,
          { match_id: string; game_index: number }
        >();
        drafts.forEach((d) =>
          draftMeta.set(d.id, {
            match_id: d.match_id,
            game_index: d.game_index,
          })
        );

        const { data: stepsData, error: stepsErr } = await supabaseAdmin
          .from('match_draft_steps')
          .select('draft_id, action, side, hero_id, phase')
          .in('draft_id', draftIds);

        if (stepsErr) {
          logger.error(
            '[admin/tournament/analytics] draft steps error:',
            stepsErr
          );
          return res.status(500).json({ error: 'Failed to fetch draft steps' });
        }

        draftSteps = ((stepsData ?? []) as DraftStepRow[])
          .map((s): AnalyticsDraftStep | null => {
            const meta = draftMeta.get(s.draft_id);
            if (!meta) return null;
            return {
              match_id: meta.match_id,
              game_index: meta.game_index,
              action: s.action,
              side: s.side,
              hero_id: s.hero_id,
              phase: s.phase,
            };
          })
          .filter((s): s is AnalyticsDraftStep => s !== null);
      }
    }

    // Teams (id -> name) scope tenant.
    const teamsById = new Map<string, AnalyticsTeamRef>();
    const teamIds = Array.from(
      new Set(
        matches
          .flatMap((m) => [m.team1_id, m.team2_id])
          .filter((v): v is string => Boolean(v))
      )
    );
    if (teamIds.length > 0) {
      const { data: teamsData } = await supabaseAdmin
        .from('teams')
        .select('id, name')
        .eq('tenant_id', ctx.tenantId)
        .in('id', teamIds);
      for (const t of (teamsData ?? []) as AnalyticsTeamRef[]) {
        teamsById.set(t.id, t);
      }
    }

    // Heroes (id -> name).
    const heroesById = new Map<string, AnalyticsHeroRef>();
    const heroIds = Array.from(
      new Set(
        draftSteps.map((s) => s.hero_id).filter((v): v is string => Boolean(v))
      )
    );
    if (heroIds.length > 0) {
      const { data: heroesData } = await supabaseAdmin
        .from('game_heroes')
        .select('id, name')
        .in('id', heroIds);
      for (const h of (heroesData ?? []) as AnalyticsHeroRef[]) {
        heroesById.set(h.id, h);
      }
    }

    const analytics = computeTournamentAnalytics({
      matches,
      games,
      vetos,
      draftSteps,
      heroesById,
      teamsById,
    });

    return res.status(200).json({ tournament, analytics });
  } catch (err: unknown) {
    logger.error('[admin/tournament/analytics] internal error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
