// features/admin/stages/service/lobbies.ts — lobbies d'une phase FFA
// (Free-For-All, classement par points) : liste + placements + classement
// agrégé (utils/ffa/standings), et création d'un lobby.
//
// FFA reste isolé du moteur team-vs-team : rien ici ne touche `matches`.

import type { ServiceContext } from '@/utils/admin/serviceContext';
import { validateStageSettings } from '@/utils/stageSettings';
import { computeFfaStandings, type FfaTiebreak } from '@/utils/ffa/standings';
import type { Audited } from '../../_shared/audited';
import * as stages from '../repository/stages';
import * as related from '../repository/related';
import { fail, stageNotFound } from './common';

type TeamJoin = {
  id: string;
  name: string | null;
  logo_url: string | null;
  short_name: string | null;
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

function normalizeTeam(team: TeamJoin | TeamJoin[] | null): TeamJoin | null {
  if (!team) return null;
  return Array.isArray(team) ? (team[0] ?? null) : team;
}

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

async function loadFfaStage(ctx: ServiceContext, stageId: string) {
  const { row: stage, error } = await stages.getStageCore(
    ctx.db,
    ctx.tenantId,
    stageId
  );
  if (error || !stage) throw stageNotFound();
  if ((stage.stage_type || '') !== 'ffa') {
    throw fail(400, 'This endpoint is only for ffa stages.');
  }
  return stage;
}

export async function listLobbies(ctx: ServiceContext, stageId: string) {
  const stage = await loadFfaStage(ctx, stageId);
  const tiebreak = resolveTiebreak(stage.settings);

  const { rows, error: lobbiesErr } = await related.stageLobbies(
    ctx.db,
    ctx.tenantId,
    stageId
  );
  if (lobbiesErr) {
    ctx.logger.error('GET lobbies error:', lobbiesErr);
    throw fail(500, 'Failed to fetch lobbies');
  }
  const lobbies = rows ?? [];
  const lobbyIds = lobbies.map((l) => l.id);

  let placements: Array<{
    id: string;
    lobby_id: string;
    team_id: string;
    placement: number | null;
    points: number | null;
    score: number | null;
    team: TeamJoin | TeamJoin[] | null;
  }> = [];
  if (lobbyIds.length > 0) {
    const p = await related.lobbyPlacements(ctx.db, ctx.tenantId, lobbyIds);
    if (p.error) {
      ctx.logger.error('GET lobby_placements error:', p.error);
      throw fail(500, 'Failed to fetch placements');
    }
    placements = (p.rows ?? []) as unknown as typeof placements;
  }

  const byLobby = new Map<string, LobbyPlacementDto[]>();
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
    const list = byLobby.get(p.lobby_id);
    if (list) list.push(dto);
    else byLobby.set(p.lobby_id, [dto]);
  }

  const lobbyDtos = lobbies.map((l) => ({
    ...l,
    placements: (byLobby.get(l.id) ?? []).sort(
      (a, b) =>
        (a.placement ?? Number.POSITIVE_INFINITY) -
        (b.placement ?? Number.POSITIVE_INFINITY)
    ),
  }));

  const standings = computeFfaStandings(
    placements.map((p) => ({
      teamId: p.team_id,
      placement: p.placement,
      points: p.points === null ? 0 : Number(p.points),
    })),
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

  return { stageId, lobbies: lobbyDtos, standings, tiebreak };
}

export async function createLobby(
  ctx: ServiceContext,
  stageId: string,
  body: Record<string, unknown>
): Promise<Audited<{ lobby: unknown }>> {
  const stage = await loadFfaStage(ctx, stageId);

  const name =
    typeof body.name === 'string' && body.name.trim()
      ? body.name.trim().slice(0, 200)
      : null;

  let roundNumber: number | null = null;
  if (body.round_number !== undefined && body.round_number !== null) {
    const rn = Number(body.round_number);
    if (!Number.isInteger(rn) || rn < 1) {
      throw fail(400, 'round_number must be a positive integer');
    }
    roundNumber = rn;
  }

  const { row, error } = await related.insertLobby(ctx.db, {
    tenant_id: ctx.tenantId,
    tournament_id: stage.tournament_id,
    stage_id: stageId,
    name,
    round_number: roundNumber,
    status: 'pending',
  });
  if (error || !row) {
    ctx.logger.error('POST lobby error:', error);
    throw fail(500, 'Failed to create lobby');
  }

  return {
    result: { lobby: row },
    audit: {
      entity_type: 'lobby',
      entity_id: row.id,
      tournament_id: stage.tournament_id,
      payload: { action: 'create_lobby', stageId, name, roundNumber },
    },
  };
}
