// features/admin/lobbies/service.ts — lobbies FFA côté staff : suppression
// d'un lobby, saisie de ses placements.
//
// PUT placements : charge le lobby → sa phase → `points_table`
// (ffaSettingsSchema), calcule les points (computeLobbyPoints), UPSERT
// `lobby_placements` sur (lobby_id, team_id), supprime les lignes des équipes
// retirées, met éventuellement à jour `lobbies.status`, et rend le lobby à
// jour + le classement frais de la phase.
//
// FFA est isolé du moteur match team-vs-team : rien ici ne touche `matches`.
// Messages d'erreur d'origine (anglais) conservés.

import type { ServiceContext } from '@/utils/admin/serviceContext';
import {
  AdminError,
  NotFoundError,
  ValidationError,
} from '@/utils/admin/errors';
import { isValidUUID } from '@/utils/apiHelpers';
import { validateStageSettings } from '@/utils/stageSettings';
import { computeLobbyPoints, type FfaPointsTable } from '@/utils/ffa/scoring';
import {
  computeFfaStandings,
  type FfaStandingRow,
  type FfaTiebreak,
} from '@/utils/ffa/standings';
import type { Audited } from '../_shared/audited';
import * as repo from './repository';

const LOBBY_STATUSES = ['pending', 'in_progress', 'completed'] as const;
type LobbyStatus = (typeof LOBBY_STATUSES)[number];

type LobbyRow = NonNullable<Awaited<ReturnType<typeof repo.findLobby>>['row']>;

type TeamJoin = {
  id: string;
  name: string | null;
  logo_url: string | null;
  short_name: string | null;
};

type PlacementRow = {
  team_id: string;
  placement: number | null;
  points: number | null;
  score: number | null;
  team: TeamJoin | TeamJoin[] | null;
};

export type StandingDto = FfaStandingRow & {
  teamName: string | null;
  teamShortName: string | null;
  teamLogoUrl: string | null;
};

type EntryInput = {
  team_id: string;
  placement: number | null;
  score: number | null;
};

const internal = (message: string) => new AdminError(500, 'internal', message);

/* ---------------------------------------------------------------------------
 * DELETE /api/admin/lobbies/[lobbyId]
 * ------------------------------------------------------------------------ */

export async function deleteLobby(
  ctx: ServiceContext,
  lobbyId: string
): Promise<Audited<{ success: true }>> {
  const { row: lobby, error: lobbyErr } = await repo.findLobbyRef(
    ctx.db,
    ctx.tenantId,
    lobbyId
  );
  if (lobbyErr || !lobby) throw new NotFoundError('Lobby not found');

  // Best-effort : retire explicitement les placements au cas où la cascade
  // ne serait pas active côté DB.
  await repo.deletePlacements(ctx.db, ctx.tenantId, lobbyId);

  const { error: delErr } = await repo.deleteLobby(
    ctx.db,
    ctx.tenantId,
    lobbyId
  );
  if (delErr) {
    ctx.logger.error('DELETE lobby error:', delErr);
    throw internal('Failed to delete lobby');
  }

  return {
    result: { success: true },
    audit: {
      entity_type: 'lobby',
      entity_id: lobbyId,
      tournament_id: lobby.tournament_id,
      payload: { action: 'delete_lobby', stageId: lobby.stage_id },
    },
  };
}

/* ---------------------------------------------------------------------------
 * PUT /api/admin/lobbies/[lobbyId]/placements
 * ------------------------------------------------------------------------ */

function normalizeTeam(team: TeamJoin | TeamJoin[] | null): TeamJoin | null {
  if (!team) return null;
  return Array.isArray(team) ? (team[0] ?? null) : team;
}

function resolvePointsTable(settings: unknown): FfaPointsTable {
  const result = validateStageSettings('ffa', settings ?? {});
  if (result.valid) {
    const pt = (result.data as { points_table?: unknown }).points_table;
    if (pt && typeof pt === 'object' && !Array.isArray(pt)) {
      return pt as FfaPointsTable;
    }
  }
  return {};
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

/** Validation entrée par entrée, messages et ordre d'origine. */
function parsePlacements(body: { entries?: unknown; status?: unknown }): {
  entries: EntryInput[];
  newStatus: LobbyStatus | null;
} {
  if (!Array.isArray(body.entries)) {
    throw new ValidationError('entries must be an array');
  }

  const seenTeams = new Set<string>();
  const entries: EntryInput[] = [];
  for (const raw of body.entries) {
    if (!raw || typeof raw !== 'object') {
      throw new ValidationError('Invalid entry');
    }
    const e = raw as {
      team_id?: unknown;
      placement?: unknown;
      score?: unknown;
    };

    if (typeof e.team_id !== 'string' || !isValidUUID(e.team_id)) {
      throw new ValidationError('Invalid team_id in entries');
    }
    if (seenTeams.has(e.team_id)) {
      throw new ValidationError('Duplicate team_id in entries');
    }
    seenTeams.add(e.team_id);

    let placement: number | null = null;
    if (
      e.placement !== null &&
      e.placement !== undefined &&
      e.placement !== ''
    ) {
      const p = Number(e.placement);
      if (!Number.isInteger(p) || p < 1) {
        throw new ValidationError(
          'placement must be a positive integer or null'
        );
      }
      placement = p;
    }

    let score: number | null = null;
    if (e.score !== null && e.score !== undefined && e.score !== '') {
      const s = Number(e.score);
      if (!Number.isFinite(s)) {
        throw new ValidationError('score must be a number or null');
      }
      score = s;
    }

    entries.push({ team_id: e.team_id, placement, score });
  }

  let newStatus: LobbyStatus | null = null;
  if (body.status !== undefined && body.status !== null) {
    if (!LOBBY_STATUSES.includes(body.status as LobbyStatus)) {
      throw new ValidationError('Invalid status');
    }
    newStatus = body.status as LobbyStatus;
  }

  return { entries, newStatus };
}

export async function savePlacements(
  ctx: ServiceContext,
  lobbyId: string,
  body: { entries?: unknown; status?: unknown }
): Promise<
  Audited<{ lobby: LobbyRow; standings: StandingDto[]; tiebreak: FfaTiebreak }>
> {
  const { entries, newStatus } = parsePlacements(body);

  const { row: lobby, error: lobbyErr } = await repo.findLobby(
    ctx.db,
    ctx.tenantId,
    lobbyId
  );
  if (lobbyErr || !lobby) throw new NotFoundError('Lobby not found');

  // Phase (settings → points_table + tiebreak). Un lobby sans phase ne
  // trouve pas de phase : même 404 qu'avant.
  const stageId = lobby.stage_id;
  if (!stageId) throw new NotFoundError('Stage not found');
  const { row: stage, error: stageErr } = await repo.findStage(
    ctx.db,
    ctx.tenantId,
    stageId
  );
  if (stageErr || !stage) throw new NotFoundError('Stage not found');
  if ((stage.stage_type || '') !== 'ffa') {
    throw new ValidationError('This lobby does not belong to an ffa stage.');
  }

  const pointsTable = resolvePointsTable(stage.settings);
  const tiebreak = resolveTiebreak(stage.settings);

  // Best-effort : filtre les équipes non inscrites au tournoi. Si la table
  // tournament_teams renvoie des lignes, on exige l'appartenance ; sinon
  // (aucune inscription connue), on reste permissif.
  if (entries.length > 0) {
    const registered = await repo.listRegisteredTeamIds(
      ctx.db,
      ctx.tenantId,
      lobby.tournament_id,
      entries.map((e) => e.team_id)
    );
    if (
      registered.size > 0 &&
      entries.some((e) => !registered.has(e.team_id))
    ) {
      throw new ValidationError(
        'One or more teams are not registered in this tournament'
      );
    }
  }

  const computed = computeLobbyPoints(
    pointsTable,
    entries.map((e) => ({
      teamId: e.team_id,
      placement: e.placement,
      score: e.score,
    }))
  );
  const pointsByTeam = new Map(computed.map((c) => [c.teamId, c.points]));

  // Supprime les équipes retirées du lobby (aucune entrée → on vide le lobby).
  const keepIds = entries.map((e) => e.team_id);
  const cleanup = await repo.deletePlacements(
    ctx.db,
    ctx.tenantId,
    lobbyId,
    keepIds
  );
  if (cleanup.error) {
    ctx.logger.error(
      keepIds.length > 0
        ? 'placements cleanup error:'
        : 'placements clear error:',
      cleanup.error
    );
  }

  if (entries.length > 0) {
    const { error: upsertErr } = await repo.upsertPlacements(
      ctx.db,
      entries.map((e) => ({
        tenant_id: ctx.tenantId,
        lobby_id: lobbyId,
        team_id: e.team_id,
        placement: e.placement,
        points: pointsByTeam.get(e.team_id) ?? 0,
        score: e.score,
      }))
    );
    if (upsertErr) {
      ctx.logger.error('placements upsert error:', upsertErr);
      throw internal('Failed to save placements');
    }
  }

  let updatedLobby: LobbyRow = lobby;
  if (newStatus && newStatus !== lobby.status) {
    const { row: updated, error: updErr } = await repo.updateLobbyStatus(
      ctx.db,
      ctx.tenantId,
      lobbyId,
      newStatus
    );
    if (updErr) ctx.logger.error('lobby status update error:', updErr);
    else if (updated) updatedLobby = updated;
  }

  const standings = await computeStageStandings(ctx, stageId, tiebreak);

  return {
    result: { lobby: updatedLobby, standings, tiebreak },
    audit: {
      entity_type: 'lobby',
      entity_id: lobbyId,
      tournament_id: lobby.tournament_id,
      payload: {
        action: 'save_placements',
        stageId: lobby.stage_id,
        entryCount: entries.length,
        status: newStatus,
      },
    },
  };
}

/** Classement agrégé de la phase FFA, recalculé après écriture. */
async function computeStageStandings(
  ctx: ServiceContext,
  stageId: string,
  tiebreak: FfaTiebreak
): Promise<StandingDto[]> {
  const lobbyIds = await repo.listStageLobbyIds(ctx.db, ctx.tenantId, stageId);
  if (lobbyIds.length === 0) return [];

  const placements = (await repo.listStagePlacements(
    ctx.db,
    ctx.tenantId,
    lobbyIds
  )) as unknown as PlacementRow[];

  const teamInfo = new Map<string, TeamJoin>();
  for (const p of placements) {
    const team = normalizeTeam(p.team);
    if (team) teamInfo.set(p.team_id, team);
  }

  const rows = computeFfaStandings(
    placements.map((p) => ({
      teamId: p.team_id,
      placement: p.placement,
      points: p.points === null ? 0 : Number(p.points),
    })),
    tiebreak
  );

  return rows.map((row) => {
    const team = teamInfo.get(row.teamId) ?? null;
    return {
      ...row,
      teamName: team?.name ?? null,
      teamShortName: team?.short_name ?? null,
      teamLogoUrl: team?.logo_url ?? null,
    };
  });
}
