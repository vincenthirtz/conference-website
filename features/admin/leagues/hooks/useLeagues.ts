// features/admin/leagues/hooks/useLeagues.ts — lectures et gestes des écrans
// ligues sur le cache de l'admin (lot L10).
//
// Les écritures restent sur `useIdempotentMutation`, enveloppé dans
// `useMutation` : même clé d'idempotence qu'avant, même FILE HORS LIGNE
// (`BgSyncQueuedError` / réponse 202 synthétique), plus l'état « en cours »
// et l'invalidation ciblée du cache.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation';
import type {
  League,
  LeagueStandingsResponse,
  LeaguesListResponse,
} from '@/types/leagues';
import { logger } from '@/utils/logger';
import { adminKey, EDITOR_QUERY_OPTIONS } from '../../_shared/query';
import { leaguesClient, leaguesUrls } from '../client';

export const leaguesKeys = {
  all: adminKey('leagues'),
  list: () => [...leaguesKeys.all, 'list'] as const,
  detail: (id: string) => [...leaguesKeys.all, 'detail', id] as const,
  standings: (id: string) => [...leaguesKeys.all, 'standings', id] as const,
  tournamentOptions: () => [...leaguesKeys.all, 'tournament-options'] as const,
};

const EMPTY_STANDINGS: LeagueStandingsResponse = {
  standings: [],
  tournaments: [],
};

export function useLeaguesList() {
  return useQuery({
    queryKey: leaguesKeys.list(),
    queryFn: leaguesClient.list,
    // Même rafraîchissement qu'avant : au montage de la page seulement.
    refetchOnWindowFocus: false,
  });
}

export function useLeague(id: string) {
  return useQuery({
    queryKey: leaguesKeys.detail(id),
    queryFn: () => leaguesClient.get(id),
    enabled: !!id,
    ...EDITOR_QUERY_OPTIONS,
  });
}

/**
 * Standings + tournois liés (endpoint ADMIN, visible même pour une ligue
 * brouillon). Un échec n'est pas une erreur d'écran : listes vides, journal.
 */
export function useLeagueStandings(id: string) {
  return useQuery({
    queryKey: leaguesKeys.standings(id),
    queryFn: async () => {
      try {
        const detail = await leaguesClient.standings(id);
        return {
          tournaments: detail.tournaments ?? [],
          standings: detail.standings ?? [],
        };
      } catch (err: unknown) {
        logger.error('load league standings error', err);
        return EMPTY_STANDINGS;
      }
    },
    enabled: !!id,
    ...EDITOR_QUERY_OPTIONS,
  });
}

export function useLeagueTournamentOptions() {
  return useQuery({
    queryKey: leaguesKeys.tournamentOptions(),
    queryFn: async () => {
      try {
        const data = await leaguesClient.tournamentOptions();
        return data.tournaments ?? [];
      } catch (err: unknown) {
        logger.error('load tournament options error', err);
        return [];
      }
    },
  });
}

type CreateLeagueBody = {
  name: string;
  slug: string;
  description?: string;
  game?: string;
  start_date?: string;
  end_date?: string;
  points_table?: Record<string, number>;
  is_public: boolean;
};

export function useCreateLeague() {
  const { mutateJson } = useIdempotentMutation();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateLeagueBody) =>
      mutateJson<League>(leaguesUrls.collection, {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () =>
      void qc.invalidateQueries({ queryKey: leaguesKeys.list() }),
  });
}

/** Réponse brute : l'écran lit le statut (204 / 202 mis en file). */
export function useDeleteLeagueFromList() {
  const { mutate } = useIdempotentMutation();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      mutate(leaguesUrls.byId(id), { method: 'DELETE' }),
    onSuccess: (res, id) => {
      if (!res.ok && res.status !== 204) return;
      // Retrait immédiat de la ligne ; le serveur fait foi au rechargement.
      qc.setQueryData<LeaguesListResponse>(leaguesKeys.list(), (prev) =>
        prev
          ? { ...prev, leagues: prev.leagues.filter((l) => l.id !== id) }
          : prev
      );
    },
  });
}

type LeaguePatch = {
  name: string;
  slug: string;
  description: string | null;
  game: string | null;
  status: League['status'];
  start_date: string | null;
  end_date: string | null;
  points_table: Record<string, number>;
  is_public: boolean;
};

/**
 * Gestes de la fiche ligue. Une seule instance d'idempotence pour
 * enregistrer / supprimer / lier / délier (comme avant), une à part pour le
 * recalcul.
 */
export function useLeagueActions(leagueId: string) {
  const { mutate, mutateJson } = useIdempotentMutation();
  const recomputeIdem = useIdempotentMutation();
  const qc = useQueryClient();

  const refreshStandings = () =>
    qc.invalidateQueries({ queryKey: leaguesKeys.standings(leagueId) });

  const save = useMutation({
    mutationFn: (patch: LeaguePatch) =>
      mutateJson<League>(leaguesUrls.byId(leagueId), {
        method: 'PATCH',
        body: JSON.stringify(patch),
      }),
    onSuccess: (updated) => {
      qc.setQueryData(leaguesKeys.detail(leagueId), updated);
      void qc.invalidateQueries({ queryKey: leaguesKeys.list() });
    },
  });

  const remove = useMutation({
    mutationFn: () => mutate(leaguesUrls.byId(leagueId), { method: 'DELETE' }),
    onSuccess: () =>
      void qc.invalidateQueries({ queryKey: leaguesKeys.list() }),
  });

  const link = useMutation({
    mutationFn: (body: { tournament_id: string; weight: number }) =>
      mutateJson(leaguesUrls.tournaments(leagueId), {
        method: 'POST',
        body: JSON.stringify(body),
      }),
  });

  const unlink = useMutation({
    mutationFn: (tournamentId: string) =>
      mutate(leaguesUrls.tournament(leagueId, tournamentId), {
        method: 'DELETE',
      }),
  });

  const recompute = useMutation({
    mutationFn: () =>
      recomputeIdem.mutateJson<{ standings_count: number }>(
        leaguesUrls.recompute(leagueId),
        { method: 'POST' }
      ),
  });

  return { save, remove, link, unlink, recompute, refreshStandings };
}
