// features/player/dashboard/service/index.ts — l'agrégat du tableau de bord
// joueuse (lot P12). UNE lecture qui remplace l'ancienne cascade en deux
// vagues côté client : l'équipe gérée est résolue une fois
// (loadManagedTeamSlice — même source que /api/admin/teams/my), puis chaque
// section part en parallèle. Les sections réservées à l'encadrement suivent
// chacune la permission EFFECTIVE qui permet d'y répondre (J3) — scrims =
// manage_scrims, messages = send_captain_messages, adhésions =
// manage_join_requests — et non « capitaine ou manager » : une coach à qui
// l'on a délégué un droit voit ce qui l'attend, les autres reçoivent vide/zéro.

import { loadManagedTeamSlice } from '@/utils/teams/managedTeamSlice';
import type { TeamPermission } from '@/utils/teamRoles';
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
  loadPendingJoinRequests,
  loadPendingScrims,
  loadScoresToConfirm,
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
  const { isCaptain, isManager, permissions } = teamSlice;
  const canManage = isCaptain || isManager;
  const can = (p: TeamPermission) => permissions.includes(p);
  const rosterSize = teamSlice.members.length;
  const teamId = teamSlice.teamId;

  const [
    demandesCaptain,
    demandesJoin,
    pendingScrims,
    unreadMessages,
    nextMatch,
    pendingInvitations,
    pendingJoinRequests,
    scoresToConfirm,
  ] = await Promise.all([
    loadDemandes(ctx, 'captain_request'),
    loadDemandes(ctx, 'join'),
    can('manage_scrims') && teamId
      ? loadPendingScrims(ctx, teamId)
      : Promise.resolve([] as PendingScrim[]),
    can('send_captain_messages') && teamId
      ? loadUnreadMessages(ctx, teamId)
      : Promise.resolve(0),
    teamId
      ? loadNextMatch(ctx, teamId, rosterSize)
      : Promise.resolve(EMPTY_NEXT_MATCH),
    // Le bandeau « à faire » n'a besoin que du compte des invitations.
    loadPendingInvitationCount(ctx),
    can('manage_join_requests') && teamId
      ? loadPendingJoinRequests(ctx, teamId)
      : Promise.resolve(0),
    // Droit de déclarer = capitaine ou manager d'équipe (reportRight.ts),
    // vérifié dans la section : ce n'est pas une permission déléguable.
    teamId ? loadScoresToConfirm(ctx, teamId) : Promise.resolve([] as string[]),
  ]);

  const todo = buildTodo({
    userId,
    nextMatch,
    pendingScrims,
    unreadMessages,
    pendingInvitations,
    pendingJoinRequests,
    scoresToConfirm,
    members: teamSlice.members,
    canManage,
    permissions,
  });

  return {
    team: teamSlice.team,
    members: teamSlice.members,
    isCaptain,
    isManager,
    permissions,
    managedTeams: teamSlice.managedTeams,
    todo,
    demandesCaptain,
    demandesJoin,
    pendingScrims,
    unreadMessages,
    nextMatch,
  };
}
