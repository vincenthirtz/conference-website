// features/player/team/hooks/useTeamOpening.ts — l'annonce de recrutement de
// l'équipe gérée (lot P8) : lecture + publication / mise à jour / clôture sur
// /api/teams/opening.
//
// Les écritures sont `subject: 'self'` côté route (le contact enregistré est
// l'email de la SESSION) : sous inspection staff, l'écran les masque, et le
// client ne les enverrait de toute façon pas avec `?as=`.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { playerRequest, type PlayerScope } from '@/utils/player/playerHttp';
import {
  PLAYER_QUERY_OPTIONS,
  playerKey,
  usePlayerScope,
} from '../../_shared/query';
import type {
  TeamOpeningResponse,
  TeamOpeningUpsertInput,
} from '../openingSchemas';

export const TEAM_OPENING_URL = '/api/teams/opening';

const openingKey = (scope: PlayerScope) => playerKey(scope, 'team', 'opening');

/** Portée d'écriture : l'équipe active, jamais le sujet inspecté. */
const writeScope = (scope: PlayerScope): PlayerScope => ({
  subjectId: null,
  actAs: false,
  teamId: scope.teamId,
});

export function useTeamOpening(enabled: boolean) {
  const scope = usePlayerScope();
  return useQuery({
    queryKey: openingKey(scope),
    queryFn: () =>
      playerRequest<TeamOpeningResponse>(TEAM_OPENING_URL, { scope }),
    enabled,
    ...PLAYER_QUERY_OPTIONS,
  });
}

function useOpeningMutation<V>(
  run: (scope: PlayerScope, vars: V) => Promise<TeamOpeningResponse>
) {
  const scope = usePlayerScope();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (vars: V) => run(writeScope(scope), vars),
    onSuccess: (data) => {
      queryClient.setQueryData(openingKey(scope), data);
    },
  });
}

export const useSaveTeamOpening = () =>
  useOpeningMutation((scope, body: TeamOpeningUpsertInput) =>
    playerRequest<TeamOpeningResponse>(TEAM_OPENING_URL, {
      method: 'PUT',
      json: body,
      idempotent: true,
      scope,
    })
  );

export const useCloseTeamOpening = () =>
  useOpeningMutation((scope, _: undefined) =>
    playerRequest<TeamOpeningResponse>(TEAM_OPENING_URL, {
      method: 'DELETE',
      idempotent: true,
      scope,
    })
  );
