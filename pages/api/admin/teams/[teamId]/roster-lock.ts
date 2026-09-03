// pages/api/admin/teams/[teamId]/roster-lock.ts
//
// État du verrou de roster d'une ÉQUIPE, et dérogation par équipe.
//
// GET    : pour chaque tournoi auquel l'équipe est inscrite, dit s'il verrouille
//          et quelles fenêtres sont ouvertes (celle du tournoi, la sienne).
// POST   : ouvre une fenêtre POUR CETTE ÉQUIPE sur un tournoi donné.
// DELETE : la referme.
//
// Pourquoi une portée par équipe. Le tableau de bord du tournoi ouvre une
// fenêtre pour TOUTES ses équipes : c'est le bon outil quand le motif est
// collectif (report, format annoncé tard). Ce n'en est pas un quand le motif
// tient à une seule équipe — « une joueuse s'est blessée chez les Alpha » n'est
// pas une raison de rouvrir le roster de tout le monde la veille des matchs.
//
// La dérogation vit donc sur l'inscription (`tournament_teams`), là où la
// décision se prend, et se cumule avec celle du tournoi au sens le plus
// permissif (cf. `utils/teams/rosterLock.ts`).
//
// Portée : `manage_teams` — l'écran d'édition d'équipe, d'où ce geste se fait.

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, type AuthenticatedStaffContext } from '@/utils/staff';
import { withAdminIdempotency } from '@/utils/adminIdempotency';
import { applyRateLimit } from '@/utils/rateLimit';
import { isValidUUID } from '@/utils/apiHelpers';
import { logStaffAction } from '@/utils/staffLogs';
import { logger } from '@/utils/logger';

/** Mêmes bornes que la fenêtre collective : cf. tournament/[id]/roster-unlock. */
const MIN_MINUTES = 5;
const MAX_MINUTES = 24 * 60;
const DEFAULT_MINUTES = 60;

type Registration = {
  tournament_id: string;
  roster_unlocked_until: string | null;
};

type TournamentRow = {
  id: string;
  name: string | null;
  status: string | null;
  roster_locked_at: string | null;
  roster_unlocked_until: string | null;
};

/**
 * Un tournoi verrouille-t-il, et qu'est-ce qui l'en empêche ?
 *
 * Le calcul reproduit celui de `isTeamRosterLocked` — mais là où ce dernier
 * répond « verrouillé ou non » pour agir, celui-ci détaille POURQUOI, ce dont
 * l'écran a besoin pour proposer le bon geste.
 */
function describe(
  t: TournamentRow,
  teamWindow: string | null,
  nowMs: number
) {
  const archived = t.status === 'archived' || t.status === 'completed';
  const lockedAtMs = t.roster_locked_at ? Date.parse(t.roster_locked_at) : NaN;
  const lockApplies =
    !archived && Number.isFinite(lockedAtMs) && lockedAtMs <= nowMs;

  const open = (iso: string | null) => {
    if (!iso) return null;
    const ms = Date.parse(iso);
    return Number.isFinite(ms) && ms > nowMs ? iso : null;
  };
  const tournamentWindow = open(t.roster_unlocked_until);
  const ownWindow = open(teamWindow);

  return {
    tournamentId: t.id,
    tournamentName: t.name,
    status: t.status,
    rosterLockedAt: t.roster_locked_at,
    /** Le verrou de ce tournoi s'applique-t-il (avant dérogation) ? */
    lockApplies,
    /** Fenêtre ouverte pour TOUTES les équipes du tournoi. */
    tournamentUnlockedUntil: tournamentWindow,
    /** Fenêtre ouverte pour CETTE équipe seulement. */
    teamUnlockedUntil: ownWindow,
    /** Verrouille-t-il effectivement cette équipe, tout compris ? */
    locks: lockApplies && !tournamentWindow && !ownWindow,
  };
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  if (
    applyRateLimit(
      req,
      res,
      { max: 60, windowMs: 60_000 },
      'admin-team-roster-lock'
    )
  ) {
    return;
  }
  res.setHeader('Cache-Control', 'no-store');

  switch (req.method) {
    case 'GET':
    case 'POST':
    case 'DELETE':
      break;
    default:
      res.setHeader('Allow', 'GET, POST, DELETE');
      return res.status(405).json({ error: 'Method not allowed' });
  }

  const { teamId } = req.query;
  if (!teamId || typeof teamId !== 'string' || !isValidUUID(teamId)) {
    return res
      .status(400)
      .json({ error: 'Invalid team id.', code: 'INVALID_TEAM_ID' });
  }

  const { data: team, error: teamErr } = await supabaseAdmin
    .from('teams')
    .select('id, name')
    .eq('tenant_id', ctx.tenantId)
    .eq('id', teamId)
    .maybeSingle();
  if (teamErr) {
    logger.error('[admin/team-roster-lock] team load error', teamErr);
    return res.status(500).json({ error: 'Server error.' });
  }
  if (!team) {
    return res
      .status(404)
      .json({ error: 'Team not found.', code: 'UNKNOWN_TEAM' });
  }

  const { data: regRows, error: regErr } = await supabaseAdmin
    .from('tournament_teams')
    .select('tournament_id, roster_unlocked_until')
    .eq('tenant_id', ctx.tenantId)
    .eq('team_id', teamId);
  if (regErr) {
    logger.error('[admin/team-roster-lock] registrations error', regErr);
    return res.status(500).json({ error: 'Server error.' });
  }
  const registrations = (regRows ?? []) as Registration[];
  const tournamentIds = registrations
    .map((r) => r.tournament_id)
    .filter((x): x is string => !!x);

  if (req.method === 'GET') {
    if (tournamentIds.length === 0) {
      return res.status(200).json({ tournaments: [] });
    }
    const { data: tournaments, error: tErr } = await supabaseAdmin
      .from('tournaments')
      .select('id, name, status, roster_locked_at, roster_unlocked_until')
      .eq('tenant_id', ctx.tenantId)
      .in('id', tournamentIds);
    if (tErr) {
      logger.error('[admin/team-roster-lock] tournaments error', tErr);
      return res.status(500).json({ error: 'Server error.' });
    }

    const windowByTournament = new Map(
      registrations.map((r) => [r.tournament_id, r.roster_unlocked_until])
    );
    const nowMs = Date.now();
    const rows = ((tournaments ?? []) as TournamentRow[])
      .map((t) => describe(t, windowByTournament.get(t.id) ?? null, nowMs))
      // Ce qui bloque d'abord : c'est là que l'écran doit porter le regard.
      .sort((a, b) => Number(b.locks) - Number(a.locks));

    return res.status(200).json({ tournaments: rows });
  }

  // POST / DELETE : les deux ciblent UNE inscription.
  const body = (req.body ?? {}) as Record<string, unknown>;
  const tournamentId =
    typeof body.tournamentId === 'string' ? body.tournamentId : '';
  if (!isValidUUID(tournamentId) || !tournamentIds.includes(tournamentId)) {
    return res.status(400).json({
      error: 'tournamentId doit désigner un tournoi où l’équipe est inscrite.',
      code: 'NOT_REGISTERED',
    });
  }

  if (req.method === 'DELETE') {
    const { error } = await supabaseAdmin
      .from('tournament_teams')
      .update({ roster_unlocked_until: null })
      .eq('tenant_id', ctx.tenantId)
      .eq('team_id', teamId)
      .eq('tournament_id', tournamentId);
    if (error) {
      logger.error('[admin/team-roster-lock] relock error', error);
      return res.status(500).json({ error: 'Failed to re-lock the roster.' });
    }

    try {
      await logStaffAction({
        staff_id: ctx.staff.id,
        action: 'update_team',
        entity_type: 'team',
        entity_id: teamId,
        tenant_id: ctx.tenantId,
        payload: {
          action: 'team_roster_relock',
          teamName: team.name,
          tournamentId,
        },
      });
    } catch (logErr) {
      logger.error('logStaffAction(team_roster_relock) error:', logErr);
    }

    return res.status(200).json({ rosterUnlockedUntil: null, tournamentId });
  }

  const rawMinutes =
    body.minutes === undefined ? DEFAULT_MINUTES : Number(body.minutes);
  if (
    !Number.isFinite(rawMinutes) ||
    !Number.isInteger(rawMinutes) ||
    rawMinutes < MIN_MINUTES ||
    rawMinutes > MAX_MINUTES
  ) {
    return res.status(400).json({
      error: `minutes doit être un entier entre ${MIN_MINUTES} et ${MAX_MINUTES}.`,
      code: 'INVALID_MINUTES',
    });
  }

  // Comme la fenêtre collective : on part de maintenant, on ne cumule pas avec
  // un reste éventuel.
  const until = new Date(Date.now() + rawMinutes * 60_000).toISOString();

  const { error } = await supabaseAdmin
    .from('tournament_teams')
    .update({ roster_unlocked_until: until })
    .eq('tenant_id', ctx.tenantId)
    .eq('team_id', teamId)
    .eq('tournament_id', tournamentId);
  if (error) {
    logger.error('[admin/team-roster-lock] unlock error', error);
    return res.status(500).json({ error: 'Failed to unlock the roster.' });
  }

  try {
    await logStaffAction({
      staff_id: ctx.staff.id,
      action: 'update_team',
      entity_type: 'team',
      entity_id: teamId,
      tenant_id: ctx.tenantId,
      payload: {
        action: 'team_roster_unlock',
        teamName: team.name,
        tournamentId,
        minutes: rawMinutes,
        until,
      },
    });
  } catch (logErr) {
    logger.error('logStaffAction(team_roster_unlock) error:', logErr);
  }

  return res
    .status(200)
    .json({ rosterUnlockedUntil: until, minutes: rawMinutes, tournamentId });
}

export default withStaffRoute(
  withAdminIdempotency(handler, { key: 'admin-team-roster-lock' }),
  { permission: 'manage_teams' }
);
