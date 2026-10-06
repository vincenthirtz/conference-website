// features/player/team/hooks/useTeamQueries.ts — lectures et gestes de
// « Gérer mon équipe » sur le cache joueuse (lot P10).
//
// Clés `playerKey(scope, 'team', …)` : changer de sujet ou d'équipe active
// relit. Un geste invalide SA liste (invitations, demandes) ; la tranche
// équipe (roster) vit dans le cache partagé `useManagedTeam`, que l'écran
// recharge après un geste qui touche le roster — tous ses consommateurs
// montés (dashboard, messages, demandes…) voient alors le nouvel état.

import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryKey,
} from '@tanstack/react-query';
import type { PlayerScope } from '@/utils/player/playerHttp';
import {
  PLAYER_QUERY_OPTIONS,
  playerKey,
  usePlayerScope,
} from '../../_shared/query';
import { teamClient } from '../client';
import type {
  InviteRoleChoice,
  TeamInfoPatchInput,
  TeamSpecialty,
} from '../schemas';

export const teamKeys = {
  all: (scope: PlayerScope) => playerKey(scope, 'team'),
  invitations: (scope: PlayerScope) => playerKey(scope, 'team', 'invitations'),
  joinRequests: (scope: PlayerScope) =>
    playerKey(scope, 'team', 'join-requests'),
  memberRights: (scope: PlayerScope) =>
    playerKey(scope, 'team', 'member-rights'),
};

/**
 * 403 = « tu ne gères pas cette équipe » : une RÉPONSE, pas une panne. La
 * traiter en échec basculait tout l'écran en « Impossible de charger
 * l'équipe » pour une joueuse simple dont l'équipe se chargeait très bien.
 */
export function isNotManagerResponse(err: unknown): boolean {
  return (err as { status?: number } | null)?.status === 403;
}

/** Invitations SORTANTES en attente. Échec toléré par l'écran. */
export function useSentInvitations(enabled: boolean) {
  const scope = usePlayerScope();
  return useQuery({
    queryKey: teamKeys.invitations(scope),
    queryFn: async () => {
      try {
        return await teamClient.listInvitations(scope);
      } catch (err) {
        if (isNotManagerResponse(err)) return [];
        throw err;
      }
    },
    enabled,
    ...PLAYER_QUERY_OPTIONS,
  });
}

/** Demandes ENTRANTES. Un échec (hors 403) met l'écran en erreur. */
export function useJoinRequests(enabled: boolean) {
  const scope = usePlayerScope();
  return useQuery({
    queryKey: teamKeys.joinRequests(scope),
    queryFn: async () => {
      try {
        return await teamClient.listJoinRequests(scope);
      } catch (err) {
        if (isNotManagerResponse(err)) return [];
        throw err;
      }
    },
    enabled,
    ...PLAYER_QUERY_OPTIONS,
  });
}

/** Geste d'équipe : portée courante + invalidation des listes touchées. */
function useTeamMutation<V, R>(
  run: (scope: PlayerScope, vars: V) => Promise<R>,
  touched: (scope: PlayerScope) => QueryKey[]
) {
  const scope = usePlayerScope();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: V) => run(scope, vars),
    onSuccess: () =>
      Promise.all(
        touched(scope).map((queryKey) =>
          queryClient.invalidateQueries({ queryKey })
        )
      ),
  });
}

const invitationsOnly = (s: PlayerScope) => [teamKeys.invitations(s)];
const joinRequestsOnly = (s: PlayerScope) => [teamKeys.joinRequests(s)];
const nothing = () => [] as QueryKey[];

export const useInviteMember = () =>
  useTeamMutation(
    (s, v: { email: string; role: InviteRoleChoice }) =>
      teamClient.invite(s, v),
    invitationsOnly
  );

export const useResendInvitation = () =>
  useTeamMutation(
    (s, id: string) => teamClient.resendInvitation(s, id),
    invitationsOnly
  );

export const useCancelInvitation = () =>
  useTeamMutation(
    (s, id: string) => teamClient.cancelInvitation(s, id),
    invitationsOnly
  );

export const useDecideJoinRequest = () =>
  useTeamMutation(
    (
      s,
      v: {
        demandeId: string;
        action: 'approve' | 'reject';
        battleTag?: string;
        reason?: string;
      }
    ) => teamClient.decideJoinRequest(s, v),
    joinRequestsOnly
  );

export const useRemoveMember = () =>
  useTeamMutation(
    (s, v: { teamId: string; memberId: string }) =>
      teamClient.removeMember(s, v.teamId, v.memberId),
    nothing
  );

export const useUpdateMemberRole = () =>
  useTeamMutation(
    (s, v: { memberId: string; role: string }) =>
      teamClient.updateMemberRole(s, v.memberId, v.role),
    nothing
  );

export const useUpdateMemberSpecialty = () =>
  useTeamMutation(
    (s, v: { memberId: string; specialty: TeamSpecialty }) =>
      teamClient.updateMemberSpecialty(s, v.memberId, v.specialty),
    nothing
  );

export const useUpdateMember = () =>
  useTeamMutation(
    (
      s,
      v: {
        memberId: string;
        battle_tag?: string | null;
        skill_rating?: number | null;
      }
    ) => teamClient.updateMember(s, v),
    nothing
  );

export const useTransferCaptain = () =>
  useTeamMutation(
    (s, newCaptainUserId: string) =>
      teamClient.transferCaptain(s, newCaptainUserId),
    // Le capitanat change les droits : les listes de gestion se relisent.
    (s) => [teamKeys.all(s)]
  );

export const usePatchTeamInfo = () =>
  useTeamMutation(
    (s, body: TeamInfoPatchInput) => teamClient.patchInfo(s, body),
    nothing
  );

/** Droits délégués de l'équipe (un seul appel pour tous les membres). */
export function useMemberRights() {
  const scope = usePlayerScope();
  return useQuery({
    queryKey: teamKeys.memberRights(scope),
    queryFn: () => teamClient.memberRights(scope),
    ...PLAYER_QUERY_OPTIONS,
  });
}

export const useSetMemberRight = () =>
  useTeamMutation(
    (s, v: { userId: string; permission: string; grant: boolean }) =>
      teamClient.setMemberRight(s, v),
    (s) => [teamKeys.memberRights(s)]
  );
