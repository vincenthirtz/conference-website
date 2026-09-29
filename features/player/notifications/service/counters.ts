// features/player/notifications/service/counters.ts — compteurs « en
// attente » de la joueuse, lus par la cloche et par l'écran Notifications
// (lot P15). Extrait tel quel de la route historique.
//
//   - unreadMessages / pendingJoinRequests : demandes `pending` adressées à
//     l'équipe GÉRÉE (une seule lecture, ventilée par type) ;
//   - pendingScrims : scrims où c'est AU TOUR de l'équipe de répondre, dans
//     les deux sens — MÊME règle que le tableau de bord
//     (utils/teams/scrimsAwaitingTeam.ts) ;
//   - pendingInvites : invitations adressées À la joueuse (vue invitée), même
//     source et même filtre d'expiration que la liste liée ;
//   - checkinPending : 1 si la fenêtre de check-in du prochain match est
//     ouverte et pas encore validée ;
//   - pendingPlannings : grilles ouvertes où elle n'a pas encore peint.
// Chaque bloc retombe sur zéro en cas d'échec : un compteur en panne ne fait
// jamais tomber la réponse.

import { CHECKIN_OPEN_MINUTES } from '@/utils/checkin';
import { getStaffRole } from '@/utils/staff';
import { getManagedTeam } from '@/utils/teams/managementAccess';
import { resolveMembership } from '@/utils/teams/memberships';
import { listPendingInvitationsForUser } from '@/utils/teams/invitations';
import { loadScrimsAwaitingTeam } from '@/utils/teams/scrimsAwaitingTeam';
import * as repo from '../repository';
import type { PlayerNotificationsPayload } from '../schemas';
import type { NotificationsCtx } from './context';

/** Un bloc en panne vaut son zéro. */
async function orZero<T>(run: () => Promise<T>, zero: T): Promise<T> {
  try {
    return await run();
  } catch {
    return zero;
  }
}

async function countInbox(ctx: NotificationsCtx, teamId: string) {
  const rows = await repo.listPendingInboxTypes(ctx.db, teamId, ctx.tenantId);
  let unreadMessages = 0;
  let pendingJoinRequests = 0;
  for (const row of rows) {
    if (row.type === 'captain_message') unreadMessages += 1;
    else if (row.type === 'join') pendingJoinRequests += 1;
  }
  return { unreadMessages, pendingJoinRequests };
}

async function computeCheckinPending(
  ctx: NotificationsCtx,
  memberTeamId: string
): Promise<0 | 1> {
  const now = Date.now();
  const since = new Date(now - CHECKIN_OPEN_MINUTES * 60_000).toISOString();
  const next = await repo.readNextMatchForCheckin(
    ctx.db,
    memberTeamId,
    ctx.tenantId,
    since
  );
  if (!next?.scheduled_at) return 0;
  const scheduledMs = new Date(next.scheduled_at).getTime();
  const opensMs = scheduledMs - CHECKIN_OPEN_MINUTES * 60_000;
  const isOpen = now >= opensMs && now <= scheduledMs;
  const checkedInAt =
    next.team1_id === memberTeamId
      ? next.team1_checked_in_at
      : next.team2_checked_in_at;
  return isOpen && !checkedInAt ? 1 : 0;
}

/**
 * Le staff peut peindre sur toute grille ouverte du tenant ; une
 * capitaine/manager seulement sur celles de son équipe.
 */
async function countPendingPlannings(
  ctx: NotificationsCtx,
  managedTeamId: string | null,
  staffRole: unknown
): Promise<number> {
  if (!managedTeamId && !staffRole) return 0;
  const ids = await repo.listOpenPlanningIds(
    ctx.db,
    ctx.tenantId,
    staffRole ? null : managedTeamId
  );
  if (ids.length === 0) return 0;
  const painted = await repo.listPaintedPlanningIds(ctx.db, ctx.userId, ids);
  return ids.filter((id) => !painted.has(id)).length;
}

export async function readNotificationCounters(
  ctx: NotificationsCtx,
  requestedTeamId: string | null
): Promise<PlayerNotificationsPayload> {
  const { userId, tenantId } = ctx;

  // Phase 1 — QUELLE équipe et quels droits s'appliquent (indépendants).
  // Un manager peut appartenir à plusieurs équipes : celle que l'écran a
  // désignée, à défaut la sienne.
  const [access, staffRole, membershipTeamId] = await Promise.all([
    getManagedTeam(userId, tenantId, requestedTeamId),
    getStaffRole(userId),
    orZero(
      async () =>
        (await resolveMembership(userId, tenantId, requestedTeamId))?.team_id ??
        null,
      null as string | null
    ),
  ]);

  const managedTeamId = access?.teamId ?? null;
  const memberTeamId = managedTeamId ?? membershipTeamId;
  const hasTeam = !!memberTeamId;
  const canManageInbox = !!access && !!managedTeamId;

  // Phase 2 — blocs indépendants, en parallèle.
  const [
    pendingInvites,
    inbox,
    pendingScrims,
    checkinPending,
    pendingPlannings,
  ] = await Promise.all([
    orZero(async () => {
      const result = await listPendingInvitationsForUser(tenantId, userId);
      return result.ok ? result.data.length : 0;
    }, 0),
    canManageInbox
      ? orZero(() => countInbox(ctx, managedTeamId), {
          unreadMessages: 0,
          pendingJoinRequests: 0,
        })
      : { unreadMessages: 0, pendingJoinRequests: 0 },
    canManageInbox
      ? orZero(
          async () =>
            (await loadScrimsAwaitingTeam(managedTeamId, tenantId)).length,
          0
        )
      : 0,
    memberTeamId
      ? orZero(() => computeCheckinPending(ctx, memberTeamId), 0 as 0 | 1)
      : (0 as 0 | 1),
    orZero(() => countPendingPlannings(ctx, managedTeamId, staffRole), 0),
  ]);

  const { unreadMessages, pendingJoinRequests } = inbox;
  return {
    hasTeam,
    isCaptain: !!access?.isCaptain,
    isManager: !!access?.isManager,
    captainTeamId: managedTeamId,
    memberTeamId: memberTeamId ?? null,
    unreadMessages,
    pendingScrims,
    pendingJoinRequests,
    pendingInvites,
    checkinPending,
    pendingPlannings,
    total:
      unreadMessages +
      pendingScrims +
      pendingJoinRequests +
      pendingInvites +
      checkinPending +
      pendingPlannings,
  };
}
