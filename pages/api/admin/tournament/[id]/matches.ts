// pages/api/admin/tournament/[id]/matches.ts
// Admin: gestion des matchs d'un tournoi
// - GET  : liste des matchs du tournoi (avec filtres + pagination)
// - POST : création de 1..N matchs pour ce tournoi

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute } from '@/utils/staff';
import { logStaffAction } from '@/utils/staffLogs';

export type MatchStatus = 'pending' | 'ongoing' | 'finished' | 'cancelled';

export type BracketSide = 'wb' | 'lb' | 'final' | 'none';

export type MatchRow = {
  id: string;
  tournament_id: string;
  stage_id: string | null;
  status: MatchStatus;
  is_bye: boolean | null;
  match_format: string | null;
  round_name: string | null;
  round_number: number | null;
  bracket_side: BracketSide | null;
  group_key: string | null;
  team1_id: string | null;
  team2_id: string | null;
  team1_score: number | null;
  team2_score: number | null;
  winner_team_id: string | null;
  scheduled_at: string | null;
  completed_at: string | null;
  stream_url: string | null;
  lobby_code: string | null;
  notes: string | null;
  next_match_win_id: string | null;
  next_match_win_slot: 1 | 2 | null;
  next_match_lose_id: string | null;
  next_match_lose_slot: 1 | 2 | null;
  created_at: string;
  updated_at: string | null;
};

export type MatchCreateInput = {
  stage_id?: string | null;
  status?: MatchStatus;
  is_bye?: boolean;
  match_format?: string | null;
  round_name?: string | null;
  round_number?: number | null;
  bracket_side?: BracketSide | null;
  group_key?: string | null;
  team1_id?: string | null;
  team2_id?: string | null;
  scheduled_at?: string | null;
  stream_url?: string | null;
  lobby_code?: string | null;
  notes?: string | null;
  next_match_win_id?: string | null;
  next_match_win_slot?: 1 | 2 | null;
  next_match_lose_id?: string | null;
  next_match_lose_slot?: 1 | 2 | null;
};

// Rôle minimum : manager
export default withStaffRoute(handler, 'manager');

async function handler(req: NextApiRequest, res: NextApiResponse, ctx: any) {
  const { id } = req.query;

  if (!id || Array.isArray(id)) {
    return res.status(400).json({ error: 'Invalid tournament id' });
  }

  const tournamentId = String(id);

  try {
    switch (req.method) {
      case 'GET':
        return await handleGet(tournamentId, req, res);
      case 'POST':
        return await handlePost(tournamentId, req, res, ctx);
      default:
        return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (err: any) {
    console.error('[/api/admin/tournament/[id]/matches] internal error:', err);
    return res.status(500).json({
      error: 'Internal server error',
      detail: err?.message,
    });
  }
}

/* -----------------------------------------------------------
 * GET : liste des matchs du tournoi
 *
 * Query params possibles :
 *  - stageId?: string
 *  - status?: string
 *  - bracketSide?: "wb" | "lb" | "final" | "none"
 *  - groupKey?: string
 *  - includeTeams?: "1" | "true"
 *  - includeGames?: "1" | "true"
 *  - orderBy?: "round_number" | "scheduled_at" | "created_at"
 *  - orderDir?: "asc" | "desc"
 *  - limit?: number (par défaut 200)
 *  - offset?: number (par défaut 0)
 * ---------------------------------------------------------*/

async function handleGet(
  tournamentId: string,
  req: NextApiRequest,
  res: NextApiResponse
) {
  const {
    stageId,
    status,
    bracketSide,
    groupKey,
    includeTeams,
    includeGames,
    orderBy,
    orderDir,
    limit,
    offset,
    result,
    dateFrom,
    dateTo,
  } = req.query;

  const limitNum = parseInt(
    (Array.isArray(limit) ? limit[0] : limit) ?? '200',
    10
  );
  const offsetNum = parseInt(
    (Array.isArray(offset) ? offset[0] : offset) ?? '0',
    10
  );

  const orderField =
    orderBy === 'scheduled_at'
      ? 'scheduled_at'
      : orderBy === 'round_number'
        ? 'round_number'
        : 'created_at';

  const ascending = orderDir === 'asc' ? true : false;

  const withTeams = includeTeams === '1' || includeTeams === 'true';
  const withGames = includeGames === '1' || includeGames === 'true';

  let baseSelect = `
    id,
    tournament_id,
    stage_id,
    status,
    is_bye,
    match_format,
    round_name,
    round_number,
    bracket_side,
    group_key,
    team1_id,
    team2_id,
    team1_score,
    team2_score,
    winner_team_id,
    scheduled_at,
    completed_at,
    stream_url,
    lobby_code,
    notes,
    next_match_win_id,
    next_match_win_slot,
    next_match_lose_id,
    next_match_lose_slot,
    created_at,
    updated_at
  `;

  if (withTeams) {
    baseSelect += `,
      team1:team1_id(id, name, short_name, logo_url),
      team2:team2_id(id, name, short_name, logo_url)
    `;
  }

  if (withGames) {
    baseSelect += `,
      games:games(*)
    `;
  }

  let query = supabaseAdmin
    .from('matches')
    .select(baseSelect)
    .eq('tournament_id', tournamentId);

  if (stageId && !Array.isArray(stageId)) {
    query = query.eq('stage_id', stageId);
  }

  if (status && !Array.isArray(status)) {
    query = query.eq('status', status);
  }

  if (bracketSide && !Array.isArray(bracketSide)) {
    query = query.eq('bracket_side', bracketSide);
  }

  if (groupKey && !Array.isArray(groupKey)) {
    query = query.eq('group_key', groupKey);
  }

  // Result filter: win (has winner), bye, no_result (finished without winner)
  if (result && !Array.isArray(result)) {
    if (result === 'bye') {
      query = query.eq('is_bye', true);
    } else if (result === 'win') {
      query = query.not('winner_team_id', 'is', null);
    } else if (result === 'no_result') {
      query = query.eq('status', 'finished').is('winner_team_id', null);
    }
  }

  if (dateFrom && !Array.isArray(dateFrom)) {
    query = query.gte('scheduled_at', dateFrom);
  }

  if (dateTo && !Array.isArray(dateTo)) {
    query = query.lte('scheduled_at', dateTo);
  }

  query = query
    .order(orderField, { ascending })
    .range(offsetNum, offsetNum + limitNum - 1);

  const { data, error } = await query;

  if (error) {
    console.error('admin GET tournament matches error:', error);
    return res.status(500).json({
      error: 'Failed to fetch matches',
    });
  }

  return res.status(200).json({
    matches: (data || []) as unknown as MatchRow[],
  });
}

/* -----------------------------------------------------------
 * POST : création d'1..N matchs pour le tournoi
 *
 * Body :
 *  {
 *    matches: MatchCreateInput[]
 *  }
 * ---------------------------------------------------------*/

async function handlePost(
  tournamentId: string,
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: any
) {
  const { matches } = req.body as {
    matches: MatchCreateInput[];
  };

  if (!Array.isArray(matches) || matches.length === 0) {
    return res.status(400).json({
      error: "Body must include non-empty array 'matches'",
    });
  }

  const nowIso = new Date().toISOString();

  const payload = matches.map((m) => ({
    tournament_id: tournamentId,
    stage_id: m.stage_id ?? null,
    status: m.status ?? 'pending',
    is_bye: m.is_bye ?? false,
    match_format: m.match_format ?? null,
    round_name: m.round_name ?? null,
    round_number: typeof m.round_number === 'number' ? m.round_number : null,
    bracket_side: m.bracket_side ?? null,
    group_key: m.group_key ?? null,
    team1_id: m.team1_id ?? null,
    team2_id: m.team2_id ?? null,
    team1_score: null,
    team2_score: null,
    winner_team_id: null,
    scheduled_at: m.scheduled_at ?? null,
    completed_at: null,
    stream_url: m.stream_url ?? null,
    lobby_code: m.lobby_code ?? null,
    notes: m.notes ?? null,
    next_match_win_id: m.next_match_win_id ?? null,
    next_match_win_slot: m.next_match_win_slot ?? null,
    next_match_lose_id: m.next_match_lose_id ?? null,
    next_match_lose_slot: m.next_match_lose_slot ?? null,
    created_at: nowIso,
    updated_at: null,
  }));

  const { data, error } = await supabaseAdmin
    .from('matches')
    .insert(payload)
    .select('*');

  if (error) {
    console.error('admin POST tournament matches error:', error);
    return res.status(500).json({
      error: 'Failed to create matches',
    });
  }

  const inserted = (data || []) as MatchRow[];

  // Log staff (une entrée globale pour le batch)
  if (ctx?.staff?.id) {
    try {
      await logStaffAction({
        staff_id: ctx.staff.id,
        action: 'create_match',
        entity_type: 'match',
        entity_id: inserted.length === 1 ? inserted[0].id : null,
        tournament_id: tournamentId,
        payload: {
          batch: true,
          count: inserted.length,
          match_ids: inserted.map((m) => m.id),
        },
      });
    } catch (e) {
      console.error('admin POST tournament matches logStaffAction error:', e);
    }
  }

  return res.status(201).json({
    matches: inserted,
  });
}
