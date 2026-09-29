// features/player/dashboard/service/index.ts — l'agrégat du tableau de bord
// joueuse (lot P12). UNE lecture qui remplace l'ancienne cascade en deux
// vagues côté client : l'équipe gérée est résolue une fois
// (loadManagedTeamSlice — même source que /api/admin/teams/my), puis chaque
// section part en parallèle. Les sections réservées à l'encadrement
// (scrims en attente, messages non lus) rendent vide/zéro aux autres.

import { loadManagedTeamSlice } from '@/utils/teams/managedTeamSlice';
import {
  EMPTY_NEXT_MATCH,
  type PendingScrim,
  type PlayerDashboardPayload,
} from '../schemas';
import {
  type DashboardCtx,
  loadDemandes,
  loadNextMatch,
  loadPendingInvitationCount,
  loadPendingScrims,
  loadUnreadMessages,
} from './sections';
import { buildTodo } from './todo';

export type { DashboardCtx } from './sections';
export { buildTodo } from './todo';

export async function getPlayerDashboard(
  ctx: DashboardCtx,
  requestedTeamId: string | null
): Promise<PlayerDashboardPayload> {
  const { userId, tenantId } = ctx;
  const teamSlice = await loadManagedTeamSlice(userId, tenantId, {
    teamId: requestedTeamId,
  });
  const { isCaptain, isManager } = teamSlice;
  const canManage = isCaptain || isManager;
  const rosterSize = teamSlice.members.length;
  const teamId = teamSlice.teamId;

  const [
    demandesCaptain,
    demandesJoin,
    pendingScrims,
    unreadMessages,
    nextMatch,
    pendingInvitations,
  ] = await Promise.all([
    loadDemandes(ctx, 'captain_request'),
    loadDemandes(ctx, 'join'),
    canManage && teamId
      ? loadPendingScrims(ctx, teamId)
      : Promise.resolve([] as PendingScrim[]),
    canManage && teamId ? loadUnreadMessages(ctx, teamId) : Promise.resolve(0),
    teamId
      ? loadNextMatch(ctx, teamId, rosterSize)
      : Promise.resolve(EMPTY_NEXT_MATCH),
    // Le bandeau « à faire » n'a besoin que du compte des invitations.
    loadPendingInvitationCount(ctx),
  ]);

  const todo = buildTodo({
    userId,
    nextMatch,
    pendingScrims,
    unreadMessages,
    pendingInvitations,
    members: teamSlice.members,
    canManage,
    permissions: teamSlice.permissions,
  });

  return {
    team: teamSlice.team,
    members: teamSlice.members,
    isCaptain,
    isManager,
    permissions: teamSlice.permissions,
    managedTeams: teamSlice.managedTeams,
    todo,
    demandesCaptain,
    demandesJoin,
    pendingScrims,
    unreadMessages,
    nextMatch,
  };
}
