// features/player/tournamentRules/hooks/useTournamentRules.ts — lectures et
// gestes du règlement à valider (liseuse, bandeau, carte capitaine).
//
// UNE clé par tournoi pour la lecture de la joueuse (`rulesKey`) : la liseuse,
// le bandeau du tableau de bord et la carte capitaine lisent la même entrée.
// Valider dans la liseuse met donc le bandeau à jour sans relecture.
//
// Jamais en inspection : ces écrans ne s'affichent pas sous `?as=` (le
// bandeau et la carte se taisent, la liseuse est une page joueuse). La portée
// est donc fixe (« moi »), sauf l'équipe active des appels capitaine.

import {
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { SELF_SCOPE } from '@/utils/player/playerHttp';
import { PLAYER_QUERY_OPTIONS, playerKey } from '../../_shared/query';
import {
  tournamentRulesClient,
  type PlayerRulesView,
  type PublicTournamentLite,
} from '../client';

/** Au plus autant de tournois interrogés par le bandeau (un appel chacun). */
export const MAX_BANNER_TOURNAMENTS = 4;

const FIVE_MINUTES = 5 * 60_000;

export const rulesKeys = {
  all: () => playerKey(SELF_SCOPE, 'tournament-rules'),
  one: (tournamentId: string) =>
    playerKey(SELF_SCOPE, 'tournament-rules', tournamentId),
  team: (tournamentId: string, teamId: string | null) =>
    playerKey(SELF_SCOPE, 'tournament-rules', tournamentId, 'team', teamId),
  activeTournaments: () =>
    playerKey(SELF_SCOPE, 'tournament-rules', 'active-tournaments'),
};

/** `GET /api/player/tournaments/[id]/rules`. */
export function useTournamentRules(
  tournamentId: string | null,
  options: { enabled?: boolean } = {}
) {
  return useQuery({
    queryKey: rulesKeys.one(tournamentId ?? ''),
    queryFn: () => tournamentRulesClient.get(tournamentId as string),
    enabled: !!tournamentId && options.enabled !== false,
    staleTime: FIVE_MINUTES,
    ...PLAYER_QUERY_OPTIONS,
  });
}

/**
 * « J'ai bien lu le règlement » : POST de la version LUE. Un succès écrit la
 * validation dans le cache (liseuse, bandeau et carte capitaine la voient
 * aussitôt) ; la carte capitaine est relue pour son compteur.
 */
export function useAcceptTournamentRules(tournamentId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (versionId: string) =>
      tournamentRulesClient.accept(tournamentId, versionId),
    onSuccess: ({ acceptedAt }) => {
      qc.setQueryData<PlayerRulesView>(rulesKeys.one(tournamentId), (prev) =>
        prev?.me
          ? { ...prev, me: { ...prev.me, accepted: true, acceptedAt } }
          : prev
      );
      void qc.invalidateQueries({
        queryKey: [...rulesKeys.one(tournamentId), 'team'],
      });
    },
  });
}

/** Le décompte de l'équipe (capitaine, manager). */
export function useTeamTournamentRules(
  tournamentId: string,
  teamId: string | null,
  enabled: boolean
) {
  return useQuery({
    queryKey: rulesKeys.team(tournamentId, teamId),
    queryFn: () => tournamentRulesClient.team(tournamentId, teamId),
    enabled: enabled && !!tournamentId,
    staleTime: 30_000,
    ...PLAYER_QUERY_OPTIONS,
  });
}

/** « Relancer » : notification site aux membres qui n'ont pas validé. */
export function useRemindTeamRules(
  tournamentId: string,
  teamId: string | null
) {
  return useMutation({
    mutationFn: () => tournamentRulesClient.remind(tournamentId, teamId),
  });
}

/** Tournois publics ouverts (inscriptions ou en cours), lus une fois. */
export function useActiveTournaments(enabled: boolean) {
  return useQuery({
    queryKey: rulesKeys.activeTournaments(),
    queryFn: () => tournamentRulesClient.activeTournaments(),
    enabled,
    staleTime: FIVE_MINUTES,
    ...PLAYER_QUERY_OPTIONS,
  });
}

export type PendingRulesValidation = {
  tournament: PublicTournamentLite;
  rules: PlayerRulesView;
};

/** Le bandeau doit-il parler pour cette lecture ? */
export function needsValidation(rules: PlayerRulesView | undefined): boolean {
  return Boolean(
    rules?.required && rules.me?.mustValidate && !rules.me.accepted
  );
}

/**
 * Les règlements qui attendent la validation de la joueuse : tournois ouverts
 * (au plus `MAX_BANNER_TOURNAMENTS`), puis la lecture joueuse de chacun. Une
 * lecture en échec se tait (le bandeau n'invente rien).
 */
export function usePendingRulesValidations(enabled: boolean) {
  const tournaments = useActiveTournaments(enabled);
  const list = (tournaments.data ?? []).slice(0, MAX_BANNER_TOURNAMENTS);
  const reads = useQueries({
    queries: list.map((t) => ({
      queryKey: rulesKeys.one(t.id),
      queryFn: () => tournamentRulesClient.get(t.id),
      enabled,
      staleTime: FIVE_MINUTES,
      ...PLAYER_QUERY_OPTIONS,
    })),
  });
  const pending: PendingRulesValidation[] = [];
  list.forEach((t, i) => {
    const rules = reads[i]?.data;
    if (rules && needsValidation(rules)) pending.push({ tournament: t, rules });
  });
  return pending;
}
