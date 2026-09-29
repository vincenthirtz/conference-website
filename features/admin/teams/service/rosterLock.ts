// features/admin/teams/service/rosterLock.ts — verrou de roster d'une ÉQUIPE
// et dérogation par équipe (`/api/admin/teams/[teamId]/roster-lock`).
//
// La fenêtre du tournoi rouvre le roster de TOUTES ses équipes ; celle-ci,
// posée sur l'inscription (`tournament_teams`), n'en rouvre qu'une — « une
// joueuse s'est blessée chez les Alpha » n'est pas un motif pour rouvrir
// tout le monde. Les deux se cumulent au sens le plus permissif (cf.
// utils/teams/rosterLock.ts).

import type { ServiceContext } from '@/utils/admin/serviceContext';
import { isValidUUID } from '@/utils/apiHelpers';
import type { Audited } from '../../_shared/audited';
import * as roster from '../repository/roster';
import * as teams from '../repository/teams';
import { fail } from './common';

/** Mêmes bornes que la fenêtre collective : cf. tournament/[id]/roster-unlock. */
const MIN_MINUTES = 5;
const MAX_MINUTES = 24 * 60;
const DEFAULT_MINUTES = 60;

type TournamentLockRow = {
  id: string;
  name: string | null;
  status: string | null;
  roster_locked_at: string | null;
  roster_unlocked_until: string | null;
};

/**
 * Un tournoi verrouille-t-il, et qu'est-ce qui l'en empêche ? Même calcul
 * que `isTeamRosterLocked`, détaillé pour proposer le bon geste à l'écran.
 */
function describeLock(
  t: TournamentLockRow,
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
    lockApplies,
    tournamentUnlockedUntil: tournamentWindow,
    teamUnlockedUntil: ownWindow,
    locks: lockApplies && !tournamentWindow && !ownWindow,
  };
}

/** Équipe (dans l'espace) + ses inscriptions : commun aux trois méthodes. */
async function loadTeamRegistrations(ctx: ServiceContext, rawTeamId: unknown) {
  const teamId = typeof rawTeamId === 'string' ? rawTeamId : '';
  if (!teamId || !isValidUUID(teamId)) {
    throw fail(400, 'Invalid team id.', 'INVALID_TEAM_ID');
  }

  const { row: team, error: teamErr } = await teams.getTeamName(
    ctx.db,
    ctx.tenantId,
    teamId
  );
  if (teamErr) {
    ctx.logger.error('[admin/team-roster-lock] team load error', teamErr);
    throw fail(500, 'Server error.');
  }
  if (!team) throw fail(404, 'Team not found.', 'UNKNOWN_TEAM');

  const { rows, error: regErr } = await roster.listTeamRegistrationWindows(
    ctx.db,
    ctx.tenantId,
    teamId
  );
  if (regErr) {
    ctx.logger.error('[admin/team-roster-lock] registrations error', regErr);
    throw fail(500, 'Server error.');
  }
  const tournamentIds = rows
    .map((r) => r.tournament_id)
    .filter((x): x is string => !!x);

  return { teamId, team, registrations: rows, tournamentIds };
}

export async function getTeamRosterLock(
  ctx: ServiceContext,
  rawTeamId: unknown
) {
  const { registrations, tournamentIds } = await loadTeamRegistrations(
    ctx,
    rawTeamId
  );
  if (tournamentIds.length === 0) return { tournaments: [] };

  const { rows, error } = await roster.listTournamentLocks(
    ctx.db,
    ctx.tenantId,
    tournamentIds
  );
  if (error) {
    ctx.logger.error('[admin/team-roster-lock] tournaments error', error);
    throw fail(500, 'Server error.');
  }

  const windowByTournament = new Map(
    registrations.map((r) => [r.tournament_id, r.roster_unlocked_until])
  );
  const nowMs = Date.now();
  const tournaments = (rows as TournamentLockRow[])
    .map((t) => describeLock(t, windowByTournament.get(t.id) ?? null, nowMs))
    // Ce qui bloque d'abord : c'est là que l'écran doit porter le regard.
    .sort((a, b) => Number(b.locks) - Number(a.locks));

  return { tournaments };
}

/** L'inscription visée par POST / DELETE (`tournamentId` du corps). */
function targetTournament(
  body: Record<string, unknown>,
  tournamentIds: string[]
): string {
  const tournamentId =
    typeof body.tournamentId === 'string' ? body.tournamentId : '';
  if (!isValidUUID(tournamentId) || !tournamentIds.includes(tournamentId)) {
    throw fail(
      400,
      'tournamentId doit désigner un tournoi où l’équipe est inscrite.',
      'NOT_REGISTERED'
    );
  }
  return tournamentId;
}

export async function unlockTeamRoster(
  ctx: ServiceContext,
  rawTeamId: unknown,
  body: Record<string, unknown>
): Promise<
  Audited<{
    rosterUnlockedUntil: string;
    minutes: number;
    tournamentId: string;
  }>
> {
  const { teamId, team, tournamentIds } = await loadTeamRegistrations(
    ctx,
    rawTeamId
  );
  const tournamentId = targetTournament(body, tournamentIds);

  const rawMinutes =
    body.minutes === undefined ? DEFAULT_MINUTES : Number(body.minutes);
  if (
    !Number.isFinite(rawMinutes) ||
    !Number.isInteger(rawMinutes) ||
    rawMinutes < MIN_MINUTES ||
    rawMinutes > MAX_MINUTES
  ) {
    throw fail(
      400,
      `minutes doit être un entier entre ${MIN_MINUTES} et ${MAX_MINUTES}.`,
      'INVALID_MINUTES'
    );
  }

  // Comme la fenêtre collective : on part de maintenant, sans cumul.
  const until = new Date(Date.now() + rawMinutes * 60_000).toISOString();

  const { error } = await roster.setTeamRegistrationWindow(
    ctx.db,
    ctx.tenantId,
    teamId,
    tournamentId,
    until
  );
  if (error) {
    ctx.logger.error('[admin/team-roster-lock] unlock error', error);
    throw fail(500, 'Failed to unlock the roster.');
  }

  return {
    result: { rosterUnlockedUntil: until, minutes: rawMinutes, tournamentId },
    audit: {
      entity_type: 'team',
      entity_id: teamId,
      payload: {
        action: 'team_roster_unlock',
        teamName: team.name,
        tournamentId,
        minutes: rawMinutes,
        until,
      },
    },
  };
}

export async function relockTeamRoster(
  ctx: ServiceContext,
  rawTeamId: unknown,
  body: Record<string, unknown>
): Promise<Audited<{ rosterUnlockedUntil: null; tournamentId: string }>> {
  const { teamId, team, tournamentIds } = await loadTeamRegistrations(
    ctx,
    rawTeamId
  );
  const tournamentId = targetTournament(body, tournamentIds);

  const { error } = await roster.setTeamRegistrationWindow(
    ctx.db,
    ctx.tenantId,
    teamId,
    tournamentId,
    null
  );
  if (error) {
    ctx.logger.error('[admin/team-roster-lock] relock error', error);
    throw fail(500, 'Failed to re-lock the roster.');
  }

  return {
    result: { rosterUnlockedUntil: null, tournamentId },
    audit: {
      entity_type: 'team',
      entity_id: teamId,
      payload: {
        action: 'team_roster_relock',
        teamName: team.name,
        tournamentId,
      },
    },
  };
}
