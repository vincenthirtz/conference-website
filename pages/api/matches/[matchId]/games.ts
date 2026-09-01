// pages/api/matches/[matchId]/games.ts

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, AuthenticatedStaffContext } from '@/utils/staff';
import { applyMatchScore } from '@/utils/matches/applyScore';
import { logStaffAction } from '@/utils/staffLogs';

import { logger } from '../../../../utils/logger';
export default withStaffRoute(handler, { permission: 'arbitrate_matches' });

/* -----------------------------------------------------------
 * Types
 * ---------------------------------------------------------*/

type GameRow = {
  id: string;
  match_id: string;
  map_name: string | null;
  map_order: number | null;
  team1_score: number | null;
  team2_score: number | null;
  winner_team_id: string | null;
  duration_minutes: number | null;
  is_tiebreaker: boolean | null;
  went_overtime: boolean | null;
  created_at: string;
};

type GameInput = {
  id?: string;
  map_name?: string | null;
  map_order?: number | null;
  team1_score?: number | null;
  team2_score?: number | null;
  winner_team_id?: string | null;
  duration_minutes?: number | null;
  is_tiebreaker?: boolean | null;
  went_overtime?: boolean | null;
};

type RecomputeMode = 'none' | 'from_games';

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  const { matchId } = req.query;

  if (!matchId || Array.isArray(matchId)) {
    return res.status(400).json({ error: 'Invalid matchId' });
  }

  try {
    switch (req.method) {
      case 'GET':
        return await handleGet(matchId, res, ctx);
      case 'POST':
        return await handlePost(matchId, req, res, ctx);
      case 'PUT':
      case 'PATCH':
        return await handlePut(matchId, req, res, ctx);
      case 'DELETE':
        return await handleDelete(matchId, res, ctx);
      default:
        return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (err: unknown) {
    logger.error('[/api/matches/[matchId]/games] error:', err);
    return res.status(500).json({
      error: 'Internal server error',
    });
  }
}

/* -----------------------------------------------------------
 * GET : liste des games d'un match
 * ---------------------------------------------------------*/

async function handleGet(
  matchId: string,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  const { data, error } = await supabaseAdmin
    .from('games')
    .select('*')
    .eq('match_id', matchId)
    .eq('tenant_id', ctx.tenantId)
    .order('map_order', { ascending: true });

  if (error) {
    logger.error('GET games error:', error);
    return res.status(500).json({ error: 'Failed to fetch games' });
  }

  return res.status(200).json({
    games: (data || []) as GameRow[],
  });
}

/* -----------------------------------------------------------
 * POST : créer une nouvelle game pour le match
 * body: GameInput (sans id)
 * ---------------------------------------------------------*/

async function handlePost(
  matchId: string,
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  const body = req.body as GameInput;

  const payload = {
    match_id: matchId,
    map_name: body.map_name ?? null,
    map_order: body.map_order ?? null,
    team1_score: body.team1_score ?? 0,
    team2_score: body.team2_score ?? 0,
    winner_team_id: body.winner_team_id ?? null,
    duration_minutes: body.duration_minutes ?? null,
    is_tiebreaker: body.is_tiebreaker ?? false,
    went_overtime: body.went_overtime ?? false,
    tenant_id: ctx.tenantId,
  };

  const { data, error } = await supabaseAdmin
    .from('games')
    .insert(payload)
    .select('*')
    .maybeSingle();

  if (error || !data) {
    logger.error('POST game error:', error);
    return res.status(500).json({ error: 'Failed to create game' });
  }

  // log staff
  if (ctx?.staff?.id) {
    await logStaffAction({
      staff_id: ctx.staff.id,
      action: 'update_match',
      entity_type: 'game',
      entity_id: data.id,
      tournament_id: null,
      tenant_id: ctx.tenantId,
      payload: {
        match_id: matchId,
        created: true,
      },
    });
  }

  return res.status(201).json({ game: data as GameRow });
}

/* -----------------------------------------------------------
 * PUT/PATCH : remplacer la liste des games du match
 * body: { games: GameInput[], recomputeMode?: "none" | "from_games" }
 * ---------------------------------------------------------*/

async function handlePut(
  matchId: string,
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  const { games, recomputeMode } = req.body as {
    games: GameInput[];
    recomputeMode?: RecomputeMode;
  };

  if (!Array.isArray(games)) {
    return res
      .status(400)
      .json({ error: "Body must include an array 'games'" });
  }

  // 1) On supprime les games existantes du match (remplacement complet)
  const { error: delErr } = await supabaseAdmin
    .from('games')
    .delete()
    .eq('match_id', matchId)
    .eq('tenant_id', ctx.tenantId);

  if (delErr) {
    logger.error('DELETE existing games error:', delErr);
    return res.status(500).json({
      error: 'Failed to clear existing games',
    });
  }

  // 2) On insère les nouvelles games
  const insertPayload = games.map((g, idx) => ({
    match_id: matchId,
    map_name: g.map_name ?? null,
    map_order: typeof g.map_order === 'number' ? g.map_order : idx,
    team1_score: g.team1_score ?? 0,
    team2_score: g.team2_score ?? 0,
    winner_team_id: g.winner_team_id ?? null,
    duration_minutes: g.duration_minutes ?? null,
    is_tiebreaker: g.is_tiebreaker ?? false,
    went_overtime: g.went_overtime ?? false,
    tenant_id: ctx.tenantId,
  }));

  let newGames: GameRow[] = [];

  if (insertPayload.length > 0) {
    const { data: inserted, error: insErr } = await supabaseAdmin
      .from('games')
      .insert(insertPayload)
      .select('*');

    if (insErr) {
      logger.error('INSERT games error:', insErr);
      return res.status(500).json({
        error: 'Failed to insert games',
      });
    }

    newGames = (inserted || []) as GameRow[];
  }

  // 3) Optionnel : recalcul du score du match à partir des games
  let recomputeResult: any = null;

  if (recomputeMode === 'from_games') {
    // Fetch match to know team IDs for winner deduction per game
    const { data: matchRow } = await supabaseAdmin
      .from('matches')
      .select('team1_id, team2_id')
      .eq('id', matchId)
      .eq('tenant_id', ctx.tenantId)
      .maybeSingle();

    const team1Id = matchRow?.team1_id ?? null;
    const team2Id = matchRow?.team2_id ?? null;

    // Auto-fill winner_team_id on games that don't have one set
    if (team1Id && team2Id && newGames.length > 0) {
      const updates: { id: string; winner_team_id: string }[] = [];
      for (const g of newGames) {
        if (
          !g.winner_team_id &&
          g.team1_score != null &&
          g.team2_score != null
        ) {
          const w =
            g.team1_score > g.team2_score
              ? team1Id
              : g.team2_score > g.team1_score
                ? team2Id
                : null;
          if (w) {
            (g as any).winner_team_id = w;
            updates.push({ id: g.id, winner_team_id: w });
          }
        }
      }
      // Batch-update winner_team_id on games rows
      for (const u of updates) {
        await supabaseAdmin
          .from('games')
          .update({ winner_team_id: u.winner_team_id })
          .eq('id', u.id)
          .eq('tenant_id', ctx.tenantId);
      }
    }

    const total = computeMapWinsFromGames(newGames, team1Id, team2Id);
    try {
      recomputeResult = await applyMatchScore({
        tenantId: ctx.tenantId,
        matchId,
        team1Score: total.team1,
        team2Score: total.team2,
        markFinished: true,
        propagateBracket: true,
        staffId: ctx.staff?.id ?? null,
      });
    } catch (e) {
      logger.error('Recompute match from games error:', e);
      // On ne bloque pas forcément pour ça, les games sont quand même sauvegardées
    }
  }

  // 4) Log staff
  if (ctx?.staff?.id) {
    await logStaffAction({
      staff_id: ctx.staff.id,
      action: 'update_match',
      entity_type: 'game',
      entity_id: null,
      tournament_id: null,
      tenant_id: ctx.tenantId,
      payload: {
        match_id: matchId,
        replaced_all_games: true,
        games_count: newGames.length,
        recompute_mode: recomputeMode ?? 'none',
      },
    });
  }

  return res.status(200).json({
    games: newGames,
    matchRecomputed: recomputeResult,
  });
}

/* -----------------------------------------------------------
 * DELETE : supprimer toutes les games du match
 * ---------------------------------------------------------*/

async function handleDelete(
  matchId: string,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  const { error } = await supabaseAdmin
    .from('games')
    .delete()
    .eq('match_id', matchId)
    .eq('tenant_id', ctx.tenantId);

  if (error) {
    logger.error('DELETE games error:', error);
    return res.status(500).json({
      error: 'Failed to delete games',
    });
  }

  if (ctx?.staff?.id) {
    await logStaffAction({
      staff_id: ctx.staff.id,
      action: 'update_match',
      entity_type: 'game',
      entity_id: null,
      tournament_id: null,
      tenant_id: ctx.tenantId,
      payload: {
        match_id: matchId,
        deleted_all_games: true,
      },
    });
  }

  return res.status(200).json({ success: true });
}

/* -----------------------------------------------------------
 * Helpers
 * ---------------------------------------------------------*/

/**
 * Count map wins per team (for BO scoring: 2-1 in a BO3, not round sums).
 * A game is won by the team with more rounds in that game.
 */
function computeMapWinsFromGames(
  games: GameRow[],
  team1Id: string | null,
  team2Id: string | null
): { team1: number; team2: number } {
  let t1 = 0;
  let t2 = 0;

  for (const g of games) {
    const s1 = g.team1_score ?? 0;
    const s2 = g.team2_score ?? 0;
    if (s1 > s2) t1 += 1;
    else if (s2 > s1) t2 += 1;
    // ties don't count as a map win for either side
  }

  return { team1: t1, team2: t2 };
}
