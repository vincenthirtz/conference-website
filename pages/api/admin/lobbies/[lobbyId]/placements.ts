// pages/api/admin/lobbies/[lobbyId]/placements.ts
// Admin: saisie des placements d'un lobby FFA.
// - PUT : body { entries: { team_id, placement, score? }[], status? }
//         Charge le lobby → sa phase → points_table (ffaSettingsSchema).
//         Calcule les points (computeLobbyPoints), UPSERT lobby_placements sur
//         (lobby_id, team_id), supprime les lignes des équipes retirées, et met
//         éventuellement à jour lobbies.status. Retourne le lobby mis à jour +
//         le classement frais de la phase.
//
// FFA est isolé du moteur match team-vs-team. Rien ici ne touche `matches`.

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, AuthenticatedStaffContext } from '@/utils/staff';
import { withAdminIdempotency } from '@/utils/adminIdempotency';
import { logStaffAction } from '@/utils/staffLogs';
import { isValidUUID } from '@/utils/apiHelpers';
import { validateStageSettings } from '@/utils/stageSettings';
import { computeLobbyPoints } from '@/utils/ffa/scoring';
import type { FfaPointsTable } from '@/utils/ffa/scoring';
import { computeFfaStandings } from '@/utils/ffa/standings';
import type { FfaStandingRow, FfaTiebreak } from '@/utils/ffa/standings';

import { logger } from '../../../../../utils/logger';

const LOBBY_STATUSES = ['pending', 'in_progress', 'completed'] as const;
type LobbyStatus = (typeof LOBBY_STATUSES)[number];

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

type StandingDto = FfaStandingRow & {
  teamName: string | null;
  teamShortName: string | null;
  teamLogoUrl: string | null;
};

type EntryInput = {
  team_id: string;
  placement: number | null;
  score?: number | null;
};

type ApiResponse =
  | {
      lobby: LobbyRow;
      standings: StandingDto[];
      tiebreak: FfaTiebreak;
    }
  | { error: string };

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

export default withStaffRoute(
  withAdminIdempotency(handler, { key: 'admin-lobby-placements' }),
  'manager'
);

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse>,
  ctx: AuthenticatedStaffContext
) {
  if (req.method !== 'PUT') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { lobbyId } = req.query;
  if (!lobbyId || Array.isArray(lobbyId) || !isValidUUID(lobbyId)) {
    return res.status(400).json({ error: 'Invalid lobbyId' });
  }

  if (!supabaseAdmin) {
    return res
      .status(500)
      .json({ error: 'Database service unavailable (missing service role).' });
  }

  try {
    return await handlePut(String(lobbyId), req, res, ctx);
  } catch (err: unknown) {
    logger.error('[/api/admin/lobbies/[lobbyId]/placements] error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}

async function handlePut(
  lobbyId: string,
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse>,
  ctx: AuthenticatedStaffContext
) {
  const body = (req.body ?? {}) as { entries?: unknown; status?: unknown };

  if (!Array.isArray(body.entries)) {
    return res.status(400).json({ error: 'entries must be an array' });
  }

  // --- Validation des entries ---
  const seenTeams = new Set<string>();
  const entries: EntryInput[] = [];
  for (const raw of body.entries) {
    if (!raw || typeof raw !== 'object') {
      return res.status(400).json({ error: 'Invalid entry' });
    }
    const e = raw as {
      team_id?: unknown;
      placement?: unknown;
      score?: unknown;
    };

    if (typeof e.team_id !== 'string' || !isValidUUID(e.team_id)) {
      return res.status(400).json({ error: 'Invalid team_id in entries' });
    }
    if (seenTeams.has(e.team_id)) {
      return res.status(400).json({ error: 'Duplicate team_id in entries' });
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
        return res
          .status(400)
          .json({ error: 'placement must be a positive integer or null' });
      }
      placement = p;
    }

    let score: number | null = null;
    if (e.score !== null && e.score !== undefined && e.score !== '') {
      const s = Number(e.score);
      if (!Number.isFinite(s)) {
        return res
          .status(400)
          .json({ error: 'score must be a number or null' });
      }
      score = s;
    }

    entries.push({ team_id: e.team_id, placement, score });
  }

  let newStatus: LobbyStatus | null = null;
  if (body.status !== undefined && body.status !== null) {
    if (!LOBBY_STATUSES.includes(body.status as LobbyStatus)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    newStatus = body.status as LobbyStatus;
  }

  // --- Charge le lobby ---
  const { data: lobby, error: lobbyErr } = await supabaseAdmin!
    .from('lobbies')
    .select(
      'id, tenant_id, tournament_id, stage_id, name, round_number, best_of, status, created_at'
    )
    .eq('id', lobbyId)
    .eq('tenant_id', ctx.tenantId)
    .maybeSingle();

  if (lobbyErr || !lobby) {
    return res.status(404).json({ error: 'Lobby not found' });
  }

  // --- Charge la phase (settings → points_table + tiebreak) ---
  const { data: stage, error: stageErr } = await supabaseAdmin!
    .from('tournament_stages')
    .select('id, tournament_id, stage_type, settings')
    .eq('id', lobby.stage_id)
    .eq('tenant_id', ctx.tenantId)
    .maybeSingle();

  if (stageErr || !stage) {
    return res.status(404).json({ error: 'Stage not found' });
  }

  if ((stage.stage_type || '') !== 'ffa') {
    return res
      .status(400)
      .json({ error: 'This lobby does not belong to an ffa stage.' });
  }

  const pointsTable = resolvePointsTable(stage.settings);
  const tiebreak = resolveTiebreak(stage.settings);

  // --- Best-effort: filtre les équipes non inscrites au tournoi ---
  if (entries.length > 0) {
    const { data: registered } = await supabaseAdmin!
      .from('tournament_teams')
      .select('team_id')
      .eq('tenant_id', ctx.tenantId)
      .eq('tournament_id', lobby.tournament_id)
      .in(
        'team_id',
        entries.map((e) => e.team_id)
      );

    const registeredIds = new Set(
      (registered ?? []).map((r: { team_id: string }) => r.team_id)
    );

    // Si la table tournament_teams renvoie des lignes, on exige l'appartenance.
    // Sinon (aucune inscription connue), on reste permissif (best-effort).
    if (registeredIds.size > 0) {
      const unknownTeam = entries.find((e) => !registeredIds.has(e.team_id));
      if (unknownTeam) {
        return res.status(400).json({
          error: 'One or more teams are not registered in this tournament',
        });
      }
    }
  }

  // --- Calcule les points ---
  const computed = computeLobbyPoints(
    pointsTable,
    entries.map((e) => ({
      teamId: e.team_id,
      placement: e.placement,
      score: e.score,
    }))
  );
  const pointsByTeam = new Map(computed.map((c) => [c.teamId, c.points]));

  // --- Supprime les équipes retirées du lobby ---
  const keepIds = entries.map((e) => e.team_id);
  if (keepIds.length > 0) {
    const { error: delErr } = await supabaseAdmin!
      .from('lobby_placements')
      .delete()
      .eq('tenant_id', ctx.tenantId)
      .eq('lobby_id', lobbyId)
      .not('team_id', 'in', `(${keepIds.join(',')})`);
    if (delErr) {
      logger.error('placements cleanup error:', delErr);
    }
  } else {
    // Aucune entrée → on vide le lobby.
    const { error: delAllErr } = await supabaseAdmin!
      .from('lobby_placements')
      .delete()
      .eq('tenant_id', ctx.tenantId)
      .eq('lobby_id', lobbyId);
    if (delAllErr) {
      logger.error('placements clear error:', delAllErr);
    }
  }

  // --- UPSERT lobby_placements sur (lobby_id, team_id) ---
  if (entries.length > 0) {
    const rows = entries.map((e) => ({
      tenant_id: ctx.tenantId,
      lobby_id: lobbyId,
      team_id: e.team_id,
      placement: e.placement,
      points: pointsByTeam.get(e.team_id) ?? 0,
      score: e.score,
    }));

    const { error: upsertErr } = await supabaseAdmin!
      .from('lobby_placements')
      .upsert(rows, { onConflict: 'lobby_id,team_id' });

    if (upsertErr) {
      logger.error('placements upsert error:', upsertErr);
      return res.status(500).json({ error: 'Failed to save placements' });
    }
  }

  // --- Met à jour le statut du lobby si demandé ---
  let updatedLobby: LobbyRow = lobby as LobbyRow;
  if (newStatus && newStatus !== lobby.status) {
    const { data: updated, error: updErr } = await supabaseAdmin!
      .from('lobbies')
      .update({ status: newStatus })
      .eq('id', lobbyId)
      .eq('tenant_id', ctx.tenantId)
      .select(
        'id, tenant_id, tournament_id, stage_id, name, round_number, best_of, status, created_at'
      )
      .maybeSingle();
    if (updErr) {
      logger.error('lobby status update error:', updErr);
    } else if (updated) {
      updatedLobby = updated as LobbyRow;
    }
  }

  // --- Recalcule le classement frais de la phase ---
  const standings = await computeStageStandings(
    ctx.tenantId,
    lobby.stage_id,
    tiebreak
  );

  if (ctx?.staff?.id) {
    await logStaffAction({
      staff_id: ctx.staff.id,
      action: 'update_scores',
      entity_type: 'lobby',
      entity_id: lobbyId,
      tournament_id: lobby.tournament_id,
      payload: {
        action: 'save_placements',
        stageId: lobby.stage_id,
        entryCount: entries.length,
        status: newStatus,
      },
    });
  }

  return res.status(200).json({
    lobby: updatedLobby,
    standings,
    tiebreak,
  });
}

/* -----------------------------------------------------------
 * Recalcule le classement agrégé de la phase FFA.
 * ---------------------------------------------------------*/

async function computeStageStandings(
  tenantId: string,
  stageId: string,
  tiebreak: FfaTiebreak
): Promise<StandingDto[]> {
  const { data: lobbiesData } = await supabaseAdmin!
    .from('lobbies')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('stage_id', stageId);

  const lobbyIds = (lobbiesData ?? []).map((l: { id: string }) => l.id);
  if (lobbyIds.length === 0) return [];

  const { data: placementsData } = await supabaseAdmin!
    .from('lobby_placements')
    .select(
      'team_id, placement, points, score, team:team_id(id, name, logo_url, short_name)'
    )
    .eq('tenant_id', tenantId)
    .in('lobby_id', lobbyIds);

  const placements = (placementsData ?? []) as unknown as PlacementRow[];

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
