// pages/api/admin/stages/[stageId]/lobbies.ts
// Admin: gestion des lobbies d'une phase FFA (Free-For-All / classement par points).
// - GET  : liste les lobbies de la phase avec leurs placements (join teams) +
//          le classement agrégé (computeFfaStandings) selon le tiebreak de la phase.
// - POST : crée un lobby { name?, round_number? } (tenant_id + tournament_id
//          dérivés de la phase ; status 'pending').
//
// FFA est volontairement isolé du moteur match team-vs-team (bracket/swiss/
// groups). Rien ici ne touche la table `matches`.

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, AuthenticatedStaffContext } from '@/utils/staff';
import { withAdminIdempotency } from '@/utils/adminIdempotency';
import { logStaffAction } from '@/utils/staffLogs';
import { isValidUUID } from '@/utils/apiHelpers';
import { validateStageSettings } from '@/utils/stageSettings';
import { computeFfaStandings } from '@/utils/ffa/standings';
import type { FfaStandingRow, FfaTiebreak } from '@/utils/ffa/standings';

import { logger } from '../../../../../utils/logger';

type TeamJoin = {
  id: string;
  name: string | null;
  logo_url: string | null;
  short_name: string | null;
};

type PlacementRow = {
  id: string;
  lobby_id: string;
  team_id: string;
  placement: number | null;
  points: number | null;
  score: number | null;
  team: TeamJoin | TeamJoin[] | null;
};

type LobbyRow = {
  id: string;
  tenant_id: string;
  tournament_id: string;
  stage_id: string;
  name: string | null;
  round_number: number | null;
  best_of: number | null;
  status: string;
  created_at: string;
};

type LobbyPlacementDto = {
  id: string;
  teamId: string;
  teamName: string | null;
  teamShortName: string | null;
  teamLogoUrl: string | null;
  placement: number | null;
  points: number | null;
  score: number | null;
};

type LobbyDto = LobbyRow & {
  placements: LobbyPlacementDto[];
};

type StandingDto = FfaStandingRow & {
  teamName: string | null;
  teamShortName: string | null;
  teamLogoUrl: string | null;
};

type ApiResponse =
  | {
      stageId: string;
      lobbies: LobbyDto[];
      standings: StandingDto[];
      tiebreak: FfaTiebreak;
    }
  | { lobby: LobbyRow }
  | { error: string };

function normalizeTeam(team: TeamJoin | TeamJoin[] | null): TeamJoin | null {
  if (!team) return null;
  return Array.isArray(team) ? (team[0] ?? null) : team;
}

export default withStaffRoute(
  withAdminIdempotency(handler, { key: 'admin-stage-lobbies' }),
  'admin'
);

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse>,
  ctx: AuthenticatedStaffContext
) {
  const { stageId } = req.query;

  if (!stageId || Array.isArray(stageId) || !isValidUUID(stageId)) {
    return res.status(400).json({ error: 'Invalid stageId' });
  }

  if (!supabaseAdmin) {
    return res
      .status(500)
      .json({ error: 'Database service unavailable (missing service role).' });
  }

  try {
    switch (req.method) {
      case 'GET':
        return await handleGet(String(stageId), res, ctx);
      case 'POST':
        return await handlePost(String(stageId), req, res, ctx);
      default:
        return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (err: unknown) {
    logger.error('[/api/admin/stages/[stageId]/lobbies] error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

/* -----------------------------------------------------------
 * GET : lobbies + placements + classement agrégé
 * ---------------------------------------------------------*/

async function handleGet(
  stageId: string,
  res: NextApiResponse<ApiResponse>,
  ctx: AuthenticatedStaffContext
) {
  const { data: stage, error: stageErr } = await supabaseAdmin!
    .from('tournament_stages')
    .select('id, tournament_id, stage_type, settings')
    .eq('id', stageId)
    .eq('tenant_id', ctx.tenantId)
    .maybeSingle();

  if (stageErr || !stage) {
    return res.status(404).json({ error: 'Stage not found' });
  }

  if ((stage.stage_type || '') !== 'ffa') {
    return res
      .status(400)
      .json({ error: 'This endpoint is only for ffa stages.' });
  }

  const tiebreak = resolveTiebreak(stage.settings);

  // Lobbies de la phase
  const { data: lobbiesData, error: lobbiesErr } = await supabaseAdmin!
    .from('lobbies')
    .select(
      'id, tenant_id, tournament_id, stage_id, name, round_number, best_of, status, created_at'
    )
    .eq('tenant_id', ctx.tenantId)
    .eq('stage_id', stageId)
    .order('round_number', { ascending: true, nullsFirst: true })
    .order('created_at', { ascending: true });

  if (lobbiesErr) {
    logger.error('GET lobbies error:', lobbiesErr);
    return res.status(500).json({ error: 'Failed to fetch lobbies' });
  }

  const lobbies = (lobbiesData ?? []) as LobbyRow[];
  const lobbyIds = lobbies.map((l) => l.id);

  // Placements de tous les lobbies de la phase (join teams)
  let placements: PlacementRow[] = [];
  if (lobbyIds.length > 0) {
    const { data: placementsData, error: placementsErr } = await supabaseAdmin!
      .from('lobby_placements')
      .select(
        'id, lobby_id, team_id, placement, points, score, team:team_id(id, name, logo_url, short_name)'
      )
      .eq('tenant_id', ctx.tenantId)
      .in('lobby_id', lobbyIds);

    if (placementsErr) {
      logger.error('GET lobby_placements error:', placementsErr);
      return res.status(500).json({ error: 'Failed to fetch placements' });
    }
    placements = (placementsData ?? []) as unknown as PlacementRow[];
  }

  // Regroupe les placements par lobby + garde une map team pour le classement
  const placementsByLobby = new Map<string, LobbyPlacementDto[]>();
  const teamInfo = new Map<string, TeamJoin>();

  for (const p of placements) {
    const team = normalizeTeam(p.team);
    if (team) teamInfo.set(p.team_id, team);

    const dto: LobbyPlacementDto = {
      id: p.id,
      teamId: p.team_id,
      teamName: team?.name ?? null,
      teamShortName: team?.short_name ?? null,
      teamLogoUrl: team?.logo_url ?? null,
      placement: p.placement,
      points: p.points === null ? null : Number(p.points),
      score: p.score === null ? null : Number(p.score),
    };

    const list = placementsByLobby.get(p.lobby_id);
    if (list) list.push(dto);
    else placementsByLobby.set(p.lobby_id, [dto]);
  }

  const lobbyDtos: LobbyDto[] = lobbies.map((l) => ({
    ...l,
    placements: (placementsByLobby.get(l.id) ?? []).sort((a, b) => {
      const ap = a.placement ?? Number.POSITIVE_INFINITY;
      const bp = b.placement ?? Number.POSITIVE_INFINITY;
      return ap - bp;
    }),
  }));

  // Classement agrégé de la phase.
  const standingInput = placements.map((p) => ({
    teamId: p.team_id,
    placement: p.placement,
    points: p.points === null ? 0 : Number(p.points),
  }));

  const standings: StandingDto[] = computeFfaStandings(
    standingInput,
    tiebreak
  ).map((row) => {
    const team = teamInfo.get(row.teamId) ?? null;
    return {
      ...row,
      teamName: team?.name ?? null,
      teamShortName: team?.short_name ?? null,
      teamLogoUrl: team?.logo_url ?? null,
    };
  });

  return res.status(200).json({
    stageId,
    lobbies: lobbyDtos,
    standings,
    tiebreak,
  });
}

/* -----------------------------------------------------------
 * POST : crée un lobby
 * Body : { name?: string, round_number?: number }
 * ---------------------------------------------------------*/

async function handlePost(
  stageId: string,
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse>,
  ctx: AuthenticatedStaffContext
) {
  const body = (req.body ?? {}) as { name?: unknown; round_number?: unknown };

  const { data: stage, error: stageErr } = await supabaseAdmin!
    .from('tournament_stages')
    .select('id, tournament_id, stage_type')
    .eq('id', stageId)
    .eq('tenant_id', ctx.tenantId)
    .maybeSingle();

  if (stageErr || !stage) {
    return res.status(404).json({ error: 'Stage not found' });
  }

  if ((stage.stage_type || '') !== 'ffa') {
    return res
      .status(400)
      .json({ error: 'This endpoint is only for ffa stages.' });
  }

  const name =
    typeof body.name === 'string' && body.name.trim()
      ? body.name.trim().slice(0, 200)
      : null;

  let roundNumber: number | null = null;
  if (body.round_number !== undefined && body.round_number !== null) {
    const rn = Number(body.round_number);
    if (!Number.isInteger(rn) || rn < 1) {
      return res
        .status(400)
        .json({ error: 'round_number must be a positive integer' });
    }
    roundNumber = rn;
  }

  const { data: inserted, error: insertErr } = await supabaseAdmin!
    .from('lobbies')
    .insert({
      tenant_id: ctx.tenantId,
      tournament_id: stage.tournament_id,
      stage_id: stageId,
      name,
      round_number: roundNumber,
      status: 'pending',
    })
    .select(
      'id, tenant_id, tournament_id, stage_id, name, round_number, best_of, status, created_at'
    )
    .maybeSingle();

  if (insertErr || !inserted) {
    logger.error('POST lobby error:', insertErr);
    return res.status(500).json({ error: 'Failed to create lobby' });
  }

  if (ctx?.staff?.id) {
    await logStaffAction({
      staff_id: ctx.staff.id,
      action: 'update_stage',
      entity_type: 'lobby',
      entity_id: inserted.id,
      tournament_id: stage.tournament_id,
      payload: { action: 'create_lobby', stageId, name, roundNumber },
    });
  }

  return res.status(201).json({ lobby: inserted as LobbyRow });
}

/* -----------------------------------------------------------
 * Helpers
 * ---------------------------------------------------------*/

function resolveTiebreak(settings: unknown): FfaTiebreak {
  const result = validateStageSettings('ffa', settings ?? {});
  if (result.valid) {
    const tb = (result.data as { tiebreak?: unknown }).tiebreak;
    if (
      tb === 'total_points' ||
      tb === 'best_placement' ||
      tb === 'most_firsts'
    ) {
      return tb;
    }
  }
  return 'best_placement';
}
