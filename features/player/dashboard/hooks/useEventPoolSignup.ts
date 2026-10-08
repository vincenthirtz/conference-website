// features/player/dashboard/hooks/useEventPoolSignup.ts — état et geste de
// l'encart « événement du moment » (components/player/EventSignupCard.tsx) :
// lecture de l'inscription regroupée, puis inscription en un clic.
//
// Remplace trois useState (vue, en cours, erreur) et un fetch à la main par
// une lecture en cache et une mutation, sans changer ce que voit la joueuse :
//   - pas de lecture sans session ni hors affiche (`enabled`) ;
//   - lecture en échec = encart muet (pas de donnée, pas d'erreur affichée),
//     sans nouvel essai, comme l'appel d'origine ;
//   - inscription réussie = la réponse remplace la vue ;
//   - inscription refusée = « inscriptions closes » sur REGISTRATION_CLOSED,
//     message générique sinon ; l'erreur s'efface au clic suivant.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiHttpError } from '@/utils/http/authedRequest';
import { SELF_SCOPE } from '@/utils/player/playerHttp';
import { playerKey } from '../../_shared/query';
import { dashboardClient, type EventPoolRegisterBody } from '../client';

export const eventPoolKey = (tournamentId: string) =>
  playerKey(SELF_SCOPE, 'event-pool', tournamentId);

/** Inscriptions closes, ou autre échec : la clé de message à afficher. */
export function eventPoolErrorKind(err: unknown): 'closed' | 'generic' {
  return err instanceof ApiHttpError && err.code === 'REGISTRATION_CLOSED'
    ? 'closed'
    : 'generic';
}

export function useEventPoolSignup(tournamentId: string, enabled: boolean) {
  const qc = useQueryClient();
  const key = eventPoolKey(tournamentId);
  const status = useQuery({
    queryKey: key,
    queryFn: () => dashboardClient.eventPoolStatus(tournamentId),
    enabled,
    retry: false,
  });
  const register = useMutation({
    mutationFn: (body: EventPoolRegisterBody) =>
      dashboardClient.eventPoolRegister(tournamentId, body),
    onSuccess: (view) => qc.setQueryData(key, view),
  });
  return {
    view: status.data ?? null,
    register: register.mutate,
    busy: register.isPending,
    errorKind: register.error ? eventPoolErrorKind(register.error) : null,
  };
}
