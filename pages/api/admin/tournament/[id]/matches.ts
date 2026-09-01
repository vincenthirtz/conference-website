// pages/api/admin/tournament/[id]/matches.ts
// Admin: gestion des matchs d'un tournoi
// - GET  : liste des matchs du tournoi (avec filtres + pagination)
// - POST : création de 1..N matchs pour ce tournoi

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, AuthenticatedStaffContext } from '@/utils/staff';
import { logStaffAction } from '@/utils/staffLogs';
import type {
  MatchStatus,
  BracketSide,
  StageSummary,
  TournamentMini,
} from '@/types/admin';
import {
  isValidUUID,
  parsePagination,
  sanitizeSearch,
  escapePostgrestValue,
} from '@/utils/apiHelpers';

import { logger } from '../../../../../utils/logger';
export type { MatchStatus } from '@/types/admin';
export type { BracketSide } from '@/types/admin';

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
export default withStaffRoute(handler, { permission: 'arbitrate_matches' });

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  const { id } = req.query;

  if (!id || Array.isArray(id) || !isValidUUID(id)) {
    return res.status(400).json({ error: 'Invalid tournament id' });
  }

  const tournamentId = String(id);

  try {
    switch (req.method) {
      case 'GET':
        return await handleGet(tournamentId, req, res, ctx);
      case 'POST':
        return await handlePost(tournamentId, req, res, ctx);
      default:
        return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (err: unknown) {
    logger.error('[/api/admin/tournament/[id]/matches] internal error:', err);
    return res.status(500).json({
      error: 'Internal server error',
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
 *  - roundNumber?: number       filtre .eq('round_number', N) (ignoré si non numérique)
 *  - result?: "win" | "bye" | "no_result"
 *  - dateFrom?, dateTo?: ISO    borne scheduled_at
 *  - search?: string            recherche texte (voir périmètre ci-dessous)
 *  - includeTeams?: "1" | "true"
 *  - includeGames?: "1" | "true"
 *  - includeStages?: "1" | "true"   ajoute `stages` (StageSummary[]) à la réponse
 *  - includeTotal?: "1" | "true"    ajoute `total` (count exact, mêmes filtres, sans range)
 *  - orderBy?: "round_number" | "scheduled_at" | "created_at"
 *  - orderDir?: "asc" | "desc"
 *  - limit?: number (par défaut 200)
 *  - offset?: number (par défaut 0)
 *
 * Réponse : `{ matches }` TOUJOURS présent (forme inchangée). Champs additifs
 * uniquement quand demandés :
 *  - `stages` : présent ssi includeStages.
 *  - `total`  : présent ssi includeTotal (compte exact avec les MÊMES filtres).
 *  - `tournament` : entête tournoi (id, name, slug, status) présent ssi
 *    includeStages OU includeTotal (utilisé par la page admin/matches).
 *
 * Périmètre de `search` : on résout d'abord les équipes dont name/short_name
 * matchent (ILIKE), puis on filtre les matchs sur team1_id/team2_id de ces
 * équipes OU round_name/lobby_code/notes ILIKE OU id exact (si UUID). Le
 * placeholder UI est « Équipe, ID… » — la recherche couvre donc bien le nom
 * d'équipe (via lookup, pas de jointe PostgREST) et l'identifiant du match.
 * ---------------------------------------------------------*/

async function handleGet(
  tournamentId: string,
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  const {
    stageId,
    status,
    bracketSide,
    groupKey,
    includeTeams,
    includeGames,
    includeStages,
    includeTotal,
    orderBy,
    orderDir,
    result,
    dateFrom,
    dateTo,
    roundNumber,
  } = req.query;

  const { limit: limitNum, offset: offsetNum } = parsePagination(req, {
    limit: 200,
    maxLimit: 512,
  });

  const orderField =
    orderBy === 'scheduled_at'
      ? 'scheduled_at'
      : orderBy === 'round_number'
        ? 'round_number'
        : 'created_at';

  const ascending = orderDir === 'asc' ? true : false;

  const withTeams = includeTeams === '1' || includeTeams === 'true';
  const withGames = includeGames === '1' || includeGames === 'true';
  const withStages = includeStages === '1' || includeStages === 'true';
  const withTotal = includeTotal === '1' || includeTotal === 'true';

  // roundNumber : valide que c'est un entier ; sinon on ignore le filtre.
  const roundRaw = Array.isArray(roundNumber) ? roundNumber[0] : roundNumber;
  const roundParsed =
    roundRaw !== undefined && roundRaw !== '' ? Number(roundRaw) : NaN;
  const roundFilter = Number.isInteger(roundParsed) ? roundParsed : null;

  // search : périmètre résolu en amont (team ids matchants), réutilisé par la
  // requête de données ET la requête de count.
  const searchTerm = sanitizeSearch(req.query.search, 100);
  const searchSafe = searchTerm ? escapePostgrestValue(searchTerm) : '';
  let matchingTeamIds: string[] = [];
  if (searchSafe) {
    const pattern = `%${searchSafe}%`;
    const teamsRes = await supabaseAdmin
      .from('teams')
      .select('id')
      .eq('tenant_id', ctx.tenantId)
      .or(`name.ilike.${pattern},short_name.ilike.${pattern}`)
      .limit(50);
    if (teamsRes.error) {
      logger.error(
        'admin GET tournament matches teams lookup error:',
        teamsRes.error
      );
    }
    matchingTeamIds = (teamsRes.data ?? [])
      .map((r) => (r as { id: string }).id)
      .filter(Boolean);
  }

  // Applique tous les filtres (tenant, tournament, stage, status, ...) sur une
  // query — partagé entre la liste (avec range) et le count (head, sans range).
  type MatchesQuery = ReturnType<
    ReturnType<typeof supabaseAdmin.from>['select']
  >;
  const applyFilters = (q: MatchesQuery): MatchesQuery => {
    q = q.eq('tenant_id', ctx.tenantId).eq('tournament_id', tournamentId);

    if (stageId && !Array.isArray(stageId)) {
      q = q.eq('stage_id', stageId);
    }
    if (status && !Array.isArray(status)) {
      q = q.eq('status', status);
    }
    if (bracketSide && !Array.isArray(bracketSide)) {
      q = q.eq('bracket_side', bracketSide);
    }
    if (groupKey && !Array.isArray(groupKey)) {
      q = q.eq('group_key', groupKey);
    }
    if (roundFilter !== null) {
      q = q.eq('round_number', roundFilter);
    }

    // Result filter: win (has winner), bye, no_result (finished without winner)
    if (result && !Array.isArray(result)) {
      if (result === 'bye') {
        q = q.eq('is_bye', true);
      } else if (result === 'win') {
        q = q.not('winner_team_id', 'is', null);
      } else if (result === 'no_result') {
        q = q.eq('status', 'finished').is('winner_team_id', null);
      }
    }

    if (dateFrom && !Array.isArray(dateFrom)) {
      q = q.gte('scheduled_at', dateFrom);
    }
    if (dateTo && !Array.isArray(dateTo)) {
      q = q.lte('scheduled_at', dateTo);
    }

    if (searchSafe) {
      const pattern = `%${searchSafe}%`;
      const clauses: string[] = [
        `round_name.ilike.${pattern}`,
        `lobby_code.ilike.${pattern}`,
        `notes.ilike.${pattern}`,
      ];
      if (matchingTeamIds.length > 0) {
        const list = matchingTeamIds.join(',');
        clauses.push(`team1_id.in.(${list})`);
        clauses.push(`team2_id.in.(${list})`);
      }
      if (isValidUUID(searchTerm)) {
        clauses.push(`id.eq.${searchTerm}`);
      }
      q = q.or(clauses.join(','));
    }

    return q;
  };

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

  let query = applyFilters(supabaseAdmin.from('matches').select(baseSelect));

  query = query
    .order(orderField, { ascending })
    .range(offsetNum, offsetNum + limitNum - 1);

  const { data, error } = await query;

  if (error) {
    logger.error('admin GET tournament matches error:', error);
    return res.status(500).json({
      error: 'Failed to fetch matches',
    });
  }

  const body: {
    matches: MatchRow[];
    stages?: StageSummary[];
    total?: number;
    tournament?: TournamentMini | null;
  } = {
    matches: (data || []) as unknown as MatchRow[],
  };

  // total : count exact avec les MÊMES filtres, sans range.
  if (withTotal) {
    const { count, error: countErr } = await applyFilters(
      supabaseAdmin.from('matches').select('id', { count: 'exact', head: true })
    );
    if (countErr) {
      logger.error('admin GET tournament matches count error:', countErr);
    }
    body.total = typeof count === 'number' ? count : 0;
  }

  // stages : liste allégée pour le dropdown de filtre (StageSummary).
  if (withStages) {
    const { data: stagesData, error: stagesErr } = await supabaseAdmin
      .from('tournament_stages')
      .select(
        'id, name, stage_type, order_index, is_active, is_public, start_date, end_date'
      )
      .eq('tenant_id', ctx.tenantId)
      .eq('tournament_id', tournamentId)
      .order('order_index', { ascending: true });
    if (stagesErr) {
      logger.error('admin GET tournament matches stages error:', stagesErr);
    }
    body.stages = (stagesData || []) as unknown as StageSummary[];
  }

  // tournament : entête (id, name, slug, status). Chargé quand la page admin
  // demande stages ou total — les autres consommateurs (bracket/veto) ne le
  // reçoivent pas, la forme `{ matches }` reste intacte pour eux.
  if (withStages || withTotal) {
    const { data: tData, error: tErr } = await supabaseAdmin
      .from('tournaments')
      .select('id, name, slug, status')
      .eq('tenant_id', ctx.tenantId)
      .eq('id', tournamentId)
      .maybeSingle();
    if (tErr) {
      logger.error('admin GET tournament matches tournament error:', tErr);
    }
    body.tournament = (tData as TournamentMini | null) ?? null;
  }

  return res.status(200).json(body);
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
  ctx: AuthenticatedStaffContext
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
    tenant_id: ctx.tenantId,
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
    logger.error('admin POST tournament matches error:', error);
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
      logger.error('admin POST tournament matches logStaffAction error:', e);
    }
  }

  return res.status(201).json({
    matches: inserted,
  });
}
