// features/player/dashboard/service/sections.ts — les sections du tableau de
// bord. Chacune rend sa tranche et NE LÈVE JAMAIS (sauf le compte des
// invitations, comme avant) : une section en échec se dégrade seule au lieu
// d'emporter tout l'écran.

import { CHECKIN_OPEN_MINUTES } from '@/utils/checkin';
import {
  applyCheckinPermission,
  exposesCheckin,
  loadCheckinPermission,
} from '@/utils/teams/canCheckIn';
import { readScrimNego } from '@/utils/teams/scrimNegotiation';
import { loadScrimsAwaitingTeam } from '@/utils/teams/scrimsAwaitingTeam';
import { fetchAdminUserProfiles } from '@/utils/adminUserProfiles';
import type { AdminDb } from '@/utils/admin/serviceContext';
import type { Logger } from '@/utils/logger';
import * as repo from '../repository';
import {
  EMPTY_NEXT_MATCH,
  type Demande,
  type NextMatchSection,
  type PendingScrim,
} from '../schemas';

export type DashboardCtx = {
  db: AdminDb;
  tenantId: string;
  logger: Logger;
  /** Le sujet (l'appelante, ou la joueuse inspectée). */
  userId: string;
};

export async function loadDemandes(
  ctx: DashboardCtx,
  type: 'captain_request' | 'join'
): Promise<Demande[]> {
  try {
    const { rows, error } = await repo.listOwnDemandes(
      ctx.db,
      ctx.userId,
      ctx.tenantId,
      type
    );
    if (error) {
      ctx.logger.error(`[player/dashboard] demandes ${type} error:`, error);
      return [];
    }
    return rows;
  } catch (err) {
    ctx.logger.error(`[player/dashboard] demandes ${type} error:`, err);
    return [];
  }
}

export async function loadPendingScrims(
  ctx: DashboardCtx,
  teamId: string
): Promise<PendingScrim[]> {
  try {
    // Scrims EN ATTENTE DE MOI, dans les deux sens — la règle vit dans
    // utils/teams/scrimsAwaitingTeam.ts, partagée avec la cloche.
    const demandes = await loadScrimsAwaitingTeam(teamId, ctx.tenantId);
    // Expéditeurs résolus en UN appel (ids inconnus → userInfo null).
    const profiles = await fetchAdminUserProfiles(
      demandes.map((d) => d.user_id)
    );
    return demandes.map((d) => {
      let userInfo: PendingScrim['user'] = null;
      if (d.user_id) {
        const p = profiles.get(d.user_id);
        if (p) {
          userInfo = {
            id: d.user_id,
            email: p.email || null,
            display_name: p.display_name || p.full_name || null,
            discord: p.discord || null,
          };
        }
      } else if (d.source === 'public' && d.payload) {
        const p = d.payload;
        userInfo = {
          id: null,
          email: (p.requester_email as string) || null,
          display_name: (p.requester_name as string) || null,
          discord: (p.requester_discord as string) || null,
        };
      }
      const payload = d.payload ?? null;
      const nego = readScrimNego(payload || {});
      const fromTeamId = (payload?.from_team_id as string | null) ?? null;
      return {
        id: d.id,
        user_id: d.user_id ?? null,
        source: d.source ?? null,
        status: d.status,
        comment: d.comment ?? null,
        payload,
        created_at: d.created_at,
        user: userInfo,
        scrimNego: {
          slots: nego.slots,
          proposedBy: nego.proposed_by,
          rounds: nego.rounds,
          agreedSlot: nego.agreed_slot,
        },
        iAmRequester: teamId === fromTeamId,
        myTeamId: teamId,
      };
    });
  } catch (err) {
    ctx.logger.error('[player/dashboard] pendingScrims error:', err);
    return [];
  }
}

/** Messages d'équipe non lus (un `count` en `head`, sans transférer de ligne). */
export async function loadUnreadMessages(
  ctx: DashboardCtx,
  teamId: string
): Promise<number> {
  try {
    const { count, error } = await repo.countUnreadTeamMessages(
      ctx.db,
      teamId,
      ctx.tenantId
    );
    if (error) {
      ctx.logger.error('[player/dashboard] unreadMessages error:', error);
      return 0;
    }
    return count;
  } catch (err) {
    ctx.logger.error('[player/dashboard] unreadMessages error:', err);
    return 0;
  }
}

/** Combien d'invitations d'équipe attendent une réponse. */
export async function loadPendingInvitationCount(
  ctx: DashboardCtx
): Promise<number> {
  const { count, error } = await repo.countPendingInvitations(
    ctx.db,
    ctx.userId,
    ctx.tenantId
  );
  if (error) {
    ctx.logger.error('[player/dashboard] invitations count error:', error);
    return 0;
  }
  return count;
}

type TeamPair = { id: string; name: string } | null;
const one = <T>(v: unknown): T | null =>
  ((Array.isArray(v) ? v[0] : v) ?? null) as T | null;

/**
 * Le prochain match de l'équipe. Le jeton de check-in ne sort que pour qui
 * peut pointer (capitaine, coach, manager — utils/teams/canCheckIn.ts) :
 * c'est `ctx.userId` (le sujet) qui en décide.
 */
export async function loadNextMatch(
  ctx: DashboardCtx,
  teamId: string,
  rosterSize: number
): Promise<NextMatchSection> {
  try {
    const cutoffISO = new Date(Date.now() - 60 * 60_000).toISOString();
    const { match, error } = await repo.readNextTeamMatch(
      ctx.db,
      teamId,
      ctx.tenantId,
      cutoffISO
    );
    if (error) {
      ctx.logger.error('[player/dashboard] nextMatch error:', error);
      return EMPTY_NEXT_MATCH;
    }
    if (!match) return EMPTY_NEXT_MATCH;

    const isTeam1 = match.team1_id === teamId;
    const slot: 1 | 2 = isTeam1 ? 1 : 2;
    const team1 = one<NonNullable<TeamPair>>(match.team1);
    const team2 = one<NonNullable<TeamPair>>(match.team2);
    const myTeam = isTeam1 ? team1 : team2;
    const opponent = isTeam1 ? team2 : team1;
    const tn = one<{
      id: string;
      name: string;
      slug: string | null;
      min_players: number | null;
    }>(match.tournament);

    const token = isTeam1
      ? (match.team1_checkin_token as string | null)
      : (match.team2_checkin_token as string | null);
    const checkedInAt = isTeam1
      ? (match.team1_checked_in_at as string | null)
      : (match.team2_checked_in_at as string | null);

    const scheduledAt = (match.scheduled_at as string | null) ?? null;
    const opensAt = scheduledAt
      ? new Date(
          new Date(scheduledAt).getTime() - CHECKIN_OPEN_MINUTES * 60_000
        ).toISOString()
      : null;
    const closesAt = scheduledAt;

    const now = Date.now();
    const isOpen =
      !!opensAt &&
      !!closesAt &&
      now >= new Date(opensAt).getTime() &&
      now <= new Date(closesAt).getTime();
    const isPassed = !!closesAt && now > new Date(closesAt).getTime();

    const formatStr = (match.match_format as string | null) ?? null;
    const bestOf = formatStr
      ? Number.parseInt(formatStr.replace(/[^\d]/g, ''), 10) || null
      : null;

    const minPlayers = tn?.min_players ?? null;
    const shortfall =
      typeof minPlayers === 'number' && minPlayers > rosterSize
        ? minPlayers - rosterSize
        : 0;

    return {
      match: {
        id: match.id as string,
        scheduledAt,
        status: match.status as string,
        format: formatStr,
        roundName: (match.round_name as string | null) ?? null,
        streamUrl: (match.stream_url as string | null) ?? null,
        bestOf,
      },
      team: myTeam ? { id: myTeam.id, name: myTeam.name, slot } : null,
      opponent: opponent ? { id: opponent.id, name: opponent.name } : null,
      tournament: tn
        ? { id: tn.id, name: tn.name, slug: tn.slug ?? null }
        : null,
      // Jeton réservé à la capitaine / coach / manager ; l'état reste visible
      // de toute l'équipe. Lecture en échec → comportement d'avant.
      checkin: applyCheckinPermission(
        {
          token: token ?? null,
          alreadyCheckedIn: !!checkedInAt,
          checkedInAt: checkedInAt ?? null,
          opensAt,
          closesAt,
          isOpen,
          isPassed,
        },
        exposesCheckin(
          await loadCheckinPermission(ctx.userId, ctx.tenantId, teamId)
        )
      ),
      readiness: { minPlayers, rosterSize, shortfall },
    };
  } catch (err) {
    ctx.logger.error('[player/dashboard] nextMatch error:', err);
    return EMPTY_NEXT_MATCH;
  }
}
