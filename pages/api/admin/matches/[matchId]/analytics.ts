// pages/api/admin/matches/[matchId]/analytics.ts
// Admin: vue analytique d'un seul match (lecture seule, aucune nouvelle table).
// - GET : games + sequence de veto + drafts par game + score de maps agrege.
//
// Le calcul vit dans le reducteur pur utils/analytics/matchAnalytics.ts.

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, AuthenticatedStaffContext } from '@/utils/staff';
import { isValidUUID } from '@/utils/apiHelpers';
import {
  computeMatchAnalytics,
  type AnalyticsGame,
  type AnalyticsVeto,
} from '@/utils/analytics/matchAnalytics';
import type {
  AnalyticsDraftStep,
  AnalyticsHeroRef,
} from '@/utils/analytics/tournamentAnalytics';
import { logger } from '../../../../../utils/logger';

export default withStaffRoute(handler, { permission: 'arbitrate_matches' });

type DraftRow = { id: string; game_index: number };
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
  const { matchId } = req.query;

  if (!matchId || Array.isArray(matchId) || !isValidUUID(matchId)) {
    return res.status(400).json({ error: 'Invalid matchId' });
  }

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // 1) Match existe + scope tenant (fournit team1_id/team2_id pour le calcul).
    const { data: match, error: mErr } = await supabaseAdmin
      .from('matches')
      .select('id, team1_id, team2_id, winner_team_id, status')
      .eq('id', matchId)
      .eq('tenant_id', ctx.tenantId)
      .maybeSingle();

    if (mErr) {
      logger.error('[admin/matches/analytics] match error:', mErr);
      return res.status(500).json({ error: 'Failed to fetch match' });
    }
    if (!match) {
      return res.status(404).json({ error: 'Match not found' });
    }

    // 2) Games / vetos / drafts du match (scope tenant).
    const [gamesRes, vetosRes, draftsRes] = await Promise.all([
      supabaseAdmin
        .from('games')
        .select(
          'match_id, map_name, map_order, team1_score, team2_score, winner_team_id, duration_minutes, is_tiebreaker, went_overtime'
        )
        .eq('match_id', matchId)
        .eq('tenant_id', ctx.tenantId),
      supabaseAdmin
        .from('match_map_vetos')
        .select('match_id, step_number, action, team_id, map_name')
        .eq('match_id', matchId)
        .eq('tenant_id', ctx.tenantId),
      supabaseAdmin
        .from('match_drafts')
        .select('id, game_index')
        .eq('match_id', matchId)
        .eq('tenant_id', ctx.tenantId),
    ]);

    if (gamesRes.error) {
      logger.error('[admin/matches/analytics] games error:', gamesRes.error);
      return res.status(500).json({ error: 'Failed to fetch games' });
    }
    if (vetosRes.error) {
      logger.error('[admin/matches/analytics] vetos error:', vetosRes.error);
      return res.status(500).json({ error: 'Failed to fetch vetos' });
    }
    if (draftsRes.error) {
      logger.error('[admin/matches/analytics] drafts error:', draftsRes.error);
      return res.status(500).json({ error: 'Failed to fetch drafts' });
    }

    const games = (gamesRes.data ?? []) as AnalyticsGame[];
    const vetos = (vetosRes.data ?? []) as AnalyticsVeto[];

    // Draft steps : join via draft_id -> game_index.
    let draftSteps: AnalyticsDraftStep[] = [];
    const drafts = (draftsRes.data ?? []) as DraftRow[];
    if (drafts.length > 0) {
      const draftIds = drafts.map((d) => d.id);
      const gameIndexByDraft = new Map<string, number>();
      drafts.forEach((d) => gameIndexByDraft.set(d.id, d.game_index));

      const { data: stepsData, error: stepsErr } = await supabaseAdmin
        .from('match_draft_steps')
        .select('draft_id, action, side, hero_id, phase')
        .in('draft_id', draftIds);

      if (stepsErr) {
        logger.error('[admin/matches/analytics] draft steps error:', stepsErr);
        return res.status(500).json({ error: 'Failed to fetch draft steps' });
      }

      draftSteps = ((stepsData ?? []) as DraftStepRow[])
        .map((s): AnalyticsDraftStep | null => {
          const gameIndex = gameIndexByDraft.get(s.draft_id);
          if (gameIndex === undefined) return null;
          return {
            match_id: String(matchId),
            game_index: gameIndex,
            action: s.action,
            side: s.side,
            hero_id: s.hero_id,
            phase: s.phase,
          };
        })
        .filter((s): s is AnalyticsDraftStep => s !== null);
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

    const analytics = computeMatchAnalytics({
      team1Id: match.team1_id,
      team2Id: match.team2_id,
      games,
      vetos,
      draftSteps,
      heroesById,
    });

    return res.status(200).json({ analytics });
  } catch (err: unknown) {
    logger.error('[admin/matches/analytics] internal error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
