// hooks/useCasterTournaments.ts
//
// Source de données du match picker du cockpit caster web (lot 5) — port de la
// partie « chargement » de womenscup-caster/src/renderer/matchPicker.js.
//
// Lit les GET publics /api/caster/v1/* (utils/caster/tournamentsClient) : liste
// des tournois, matchs d'un tournoi, et map pool du tournoi. Le map pool est
// exposé tel quel pour alimenter le <select> map de l'éditeur match (mapOptions).
//
// Le tournoi sélectionné est mémorisé dans localStorage : au rechargement de la
// page en plein event, le caster retrouve sa liste de matchs sans re-piocher.

import { useCallback, useEffect, useRef, useState } from 'react';

import { logger } from '@/utils/logger';
import {
  fetchCasterTournamentMaps,
  fetchCasterTournamentMatches,
  fetchCasterTournaments,
} from '@/utils/caster/tournamentsClient';
import type {
  CasterApiMatch,
  CasterApiTournament,
  CasterApiTournamentMap,
} from '@/types/caster';

const STORAGE_KEY = 'caster.picker.tournamentId';

export type UseCasterTournaments = {
  tournaments: CasterApiTournament[];
  tournamentsLoading: boolean;
  tournamentId: string | null;
  matches: CasterApiMatch[];
  matchesLoading: boolean;
  /** Map pool du tournoi sélectionné ([] tant qu'aucun tournoi choisi). */
  maps: CasterApiTournamentMap[];
  /** Dernière erreur réseau (bandeau non bloquant côté panneau). */
  error: string | null;
  selectTournament: (id: string | null) => void;
  /** Recharge matchs + maps du tournoi courant (bouton « Rafraîchir »). */
  reloadMatches: () => void;
  reloadTournaments: () => void;
};

export function useCasterTournaments({
  enabled = true,
}: { enabled?: boolean } = {}): UseCasterTournaments {
  const [tournaments, setTournaments] = useState<CasterApiTournament[]>([]);
  const [tournamentsLoading, setTournamentsLoading] = useState(false);
  const [tournamentId, setTournamentId] = useState<string | null>(null);
  const [matches, setMatches] = useState<CasterApiMatch[]>([]);
  const [matchesLoading, setMatchesLoading] = useState(false);
  const [maps, setMaps] = useState<CasterApiTournamentMap[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Garde anti-course : ne pas appliquer une réponse arrivée après démontage.
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // Restauration du dernier tournoi (effet, pas d'initialiseur d'état : le SSR
  // n'a pas de localStorage).
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) setTournamentId(saved);
    } catch {
      /* localStorage indisponible (mode privé strict) : on ignore */
    }
  }, []);

  const reloadTournaments = useCallback(() => {
    setTournamentsLoading(true);
    void fetchCasterTournaments()
      .then((list) => {
        if (!alive.current) return;
        setTournaments(list);
        setError(null);
      })
      .catch((err: unknown) => {
        if (!alive.current) return;
        logger.error('[useCasterTournaments] tournaments error', err);
        setError((err as Error)?.message || 'error');
      })
      .finally(() => {
        if (alive.current) setTournamentsLoading(false);
      });
  }, []);

  useEffect(() => {
    if (!enabled) return;
    reloadTournaments();
  }, [enabled, reloadTournaments]);

  // Matchs + maps du tournoi courant. Les deux lectures partent en parallèle
  // (comme le desktop) ; un map pool vide n'est pas une erreur — l'éditeur
  // retombe alors sur le pool Overwatch par défaut.
  const loadForTournament = useCallback((id: string) => {
    setMatchesLoading(true);
    void Promise.allSettled([
      fetchCasterTournamentMatches(id),
      fetchCasterTournamentMaps(id),
    ])
      .then(([matchRes, mapRes]) => {
        if (!alive.current) return;
        if (mapRes.status === 'fulfilled') setMaps(mapRes.value);
        if (matchRes.status === 'fulfilled') {
          setMatches(matchRes.value);
          setError(null);
        } else {
          logger.error(
            '[useCasterTournaments] matches error',
            matchRes.reason as unknown
          );
          setMatches([]);
          setError((matchRes.reason as Error)?.message || 'error');
        }
      })
      .finally(() => {
        if (alive.current) setMatchesLoading(false);
      });
  }, []);

  useEffect(() => {
    if (!enabled) return;
    if (!tournamentId) {
      setMatches([]);
      setMaps([]);
      return;
    }
    loadForTournament(tournamentId);
  }, [enabled, tournamentId, loadForTournament]);

  const selectTournament = useCallback((id: string | null) => {
    setTournamentId(id);
    try {
      if (id) window.localStorage.setItem(STORAGE_KEY, id);
      else window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* localStorage indisponible : la sélection reste en mémoire */
    }
  }, []);

  const reloadMatches = useCallback(() => {
    if (tournamentId) loadForTournament(tournamentId);
  }, [tournamentId, loadForTournament]);

  return {
    tournaments,
    tournamentsLoading,
    tournamentId,
    matches,
    matchesLoading,
    maps,
    error,
    selectTournament,
    reloadMatches,
    reloadTournaments,
  };
}
