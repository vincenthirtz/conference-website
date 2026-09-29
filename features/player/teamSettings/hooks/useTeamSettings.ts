// features/player/teamSettings/hooks/useTeamSettings.ts — bascules
// « ouverte au recrutement » / « ouverte aux scrims » (lot P5).
//
// Les écrans gardent leur état d'équipe et leur retour visuel (toast, bandeau
// de succès) : le hook ne fournit que le geste, son état « en cours » et la
// portée sujet + équipe. Aucune lecture joueuse en cache ne dépend encore de
// ces drapeaux — rien à invalider tant que la tranche équipe n'y est pas.

import { useMutation } from '@tanstack/react-query';
import type { ToggleJoinableInput, ToggleScrimOpenInput } from '../schemas';
import { usePlayerScope } from '../../_shared/query';
import { teamSettingsClient } from '../client';

export function useToggleJoinable() {
  const scope = usePlayerScope();
  return useMutation({
    mutationFn: (body: ToggleJoinableInput) =>
      teamSettingsClient.toggleJoinable(scope, body),
  });
}

export function useToggleScrimOpen() {
  const scope = usePlayerScope();
  return useMutation({
    mutationFn: (body: ToggleScrimOpenInput) =>
      teamSettingsClient.toggleScrimOpen(scope, body),
  });
}
