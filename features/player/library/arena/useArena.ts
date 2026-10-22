// features/player/library/arena/useArena.ts — les lectures et les gestes de
// l'arène (docs/PLAN-tcg-2.md, lot 12), chargées avec l'écran de l'arène (la
// porte de la Library, elle, est lue par `PlaceScreen`, comme pour tout lieu) :
//   - `useArenaLobby` / `useArenaDeck` / `useSaveArenaDeck` : le salon, le
//                       deck, son enregistrement (cache joueuse) ;
//   - `useArenaDuel`  : un duel — l'état projeté, les gestes, et le REJEU PAS À
//                       PAS des étapes rendues par le serveur (le tour de la
//                       gardienne), une phrase par étape dans le journal.
// Le serveur décide de tout ; un refus a son message, jamais un état inventé.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { PlayerScope } from '@/utils/player/playerHttp';
import {
  PLAYER_QUERY_OPTIONS,
  playerKey,
  usePlayerScope,
} from '../../_shared/query';
import { useArenaClient } from './clientContext';
import type { ArenaDuelResponse, ArenaFaces } from './responses';
import type { ArenaAction, ArenaBoardView, ArenaOpponentId } from './rules';
import { type EventWords, errorCodeOf, narrate } from './viewModel';

export const arenaKeys = {
  lobby: (scope: PlayerScope) => playerKey(scope, 'library', 'arena', 'lobby'),
  deck: (scope: PlayerScope) => playerKey(scope, 'library', 'arena', 'deck'),
};

/** Les erreurs 4xx ne se rejouent pas ; une Library absente non plus. */
const ARENA_QUERY_OPTIONS = {
  ...PLAYER_QUERY_OPTIONS,
  retry: (count: number, err: unknown) => {
    const code = errorCodeOf(err);
    if (code) return false;
    return count < 1;
  },
};

export function useArenaLobby(enabled: boolean) {
  const scope = usePlayerScope();
  const client = useArenaClient();
  return useQuery({
    queryKey: arenaKeys.lobby(scope),
    queryFn: () => client.lobby(),
    enabled,
    staleTime: 0,
    refetchOnMount: 'always',
    ...ARENA_QUERY_OPTIONS,
  });
}

export function useArenaDeck(enabled: boolean) {
  const scope = usePlayerScope();
  const client = useArenaClient();
  return useQuery({
    queryKey: arenaKeys.deck(scope),
    queryFn: () => client.deck(),
    enabled,
    staleTime: 0,
    ...ARENA_QUERY_OPTIONS,
  });
}

export function useSaveArenaDeck() {
  const scope = usePlayerScope();
  const client = useArenaClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (cards: string[]) => client.saveDeck(cards),
    onSuccess: (data) => {
      qc.setQueryData(arenaKeys.deck(scope), data);
      void qc.invalidateQueries({ queryKey: arenaKeys.lobby(scope) });
    },
  });
}

export function useStartArenaDuel() {
  const scope = usePlayerScope();
  const client = useArenaClient();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (opponent: ArenaOpponentId) => client.start(opponent),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: arenaKeys.lobby(scope) });
    },
  });
}

/** Délai entre deux étapes rejouées (aucun si l'animation est réduite). */
export const ARENA_STEP_MS = 700;

function prefersReducedMotion(): boolean {
  try {
    return (
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    );
  } catch {
    return false;
  }
}

export type DuelNotice =
  | { kind: 'stale' }
  | { kind: 'refused'; code: string }
  | { kind: 'error' }
  | null;

export type ArenaDuelScreenState = {
  /** La dernière réponse du serveur (le duel, sa récompense, ses faces). */
  data: ArenaDuelResponse | null;
  /** Le plateau MONTRÉ : une étape en cours de rejeu, sinon l'état final. */
  board: ArenaBoardView | null;
  faces: ArenaFaces;
  /** Le journal : une phrase par événement, la plus récente à la fin. */
  log: string[];
  /** Un rejeu est en cours (le tour de la gardienne). */
  replaying: boolean;
  pending: boolean;
  loadError: unknown;
  notice: DuelNotice;
};

/**
 * Un duel : lu au montage (`initial` évite une lecture quand on vient de le
 * lancer), joué geste par geste. Les étapes d'une réponse sont rejouées une
 * à une (`ARENA_STEP_MS`), puis le plateau final s'affiche ; `skip` saute à
 * la fin. Un geste n'est envoyé qu'au repos (ni geste en vol, ni rejeu).
 */
export function useArenaDuel(
  duelId: string,
  words: EventWords,
  initial: ArenaDuelResponse | null = null
) {
  const client = useArenaClient();
  const scope = usePlayerScope();
  const qc = useQueryClient();
  const [state, setState] = useState<ArenaDuelScreenState>(() => ({
    data: initial,
    board: initial ? (initial.steps[0]?.board ?? initial.duel.board) : null,
    faces: initial?.faces ?? {},
    log: [],
    replaying: false,
    pending: false,
    loadError: null,
    notice: null,
  }));
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queue = useRef<{ res: ArenaDuelResponse; index: number } | null>(null);
  // La dernière réponse reçue : la même ne se rejoue pas deux fois (le double
  // montage des effets en développement, un rendu de trop).
  const received = useRef<ArenaDuelResponse | null>(null);
  const wordsRef = useRef(words);
  wordsRef.current = words;

  const clearTimer = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);

  /** Termine le rejeu : le plateau final, les phrases restantes. */
  const finish = useCallback(
    (res: ArenaDuelResponse, from: number) => {
      clearTimer();
      queue.current = null;
      const rest = res.steps
        .slice(from)
        .map((s) => narrate(s.event, s.board, res.faces, wordsRef.current))
        .filter((line): line is string => Boolean(line));
      setState((s) => ({
        ...s,
        data: res,
        board: res.duel.board,
        faces: res.faces,
        log: [...s.log, ...rest].slice(-60),
        replaying: false,
      }));
    },
    [clearTimer]
  );

  const playFrom = useCallback(
    (res: ArenaDuelResponse, index: number) => {
      if (index >= res.steps.length || prefersReducedMotion()) {
        finish(res, index);
        return;
      }
      const step = res.steps[index];
      const line = narrate(step.event, step.board, res.faces, wordsRef.current);
      queue.current = { res, index: index + 1 };
      setState((s) => ({
        ...s,
        data: res,
        board: step.board,
        faces: res.faces,
        log: line ? [...s.log, line].slice(-60) : s.log,
        replaying: true,
      }));
      timer.current = setTimeout(() => playFrom(res, index + 1), ARENA_STEP_MS);
    },
    [finish]
  );

  const receive = useCallback(
    (res: ArenaDuelResponse) => {
      if (received.current === res) return;
      received.current = res;
      clearTimer();
      if (res.steps.length === 0) finish(res, 0);
      else playFrom(res, 0);
      if (res.duel.board.status !== 'active') {
        void qc.invalidateQueries({ queryKey: arenaKeys.lobby(scope) });
      }
    },
    [clearTimer, finish, playFrom, qc, scope]
  );

  const load = useCallback(async () => {
    setState((s) => ({ ...s, pending: true, loadError: null }));
    try {
      const res = await client.duel(duelId);
      setState((s) => ({ ...s, pending: false }));
      receive(res);
    } catch (err) {
      setState((s) => ({ ...s, pending: false, loadError: err }));
    }
  }, [client, duelId, receive]);

  // Au montage : la réponse de lancement se rejoue, sinon on lit le duel.
  // biome-ignore lint/correctness/useExhaustiveDependencies: un seul passage par duel.
  useEffect(() => {
    if (initial) receive(initial);
    else void load();
    return () => {
      // Démontage (ou double montage des effets en développement) : un rejeu
      // en cours saute à la fin plutôt que de rester suspendu.
      const q = queue.current;
      if (q) finish(q.res, q.index);
      else clearTimer();
    };
  }, [duelId]);

  const busy = state.pending || state.replaying;

  const act = useCallback(
    async (action: ArenaAction) => {
      const board = state.data?.duel.board;
      if (!board || busy) return;
      setState((s) => ({ ...s, pending: true, notice: null }));
      try {
        const res = await client.act(duelId, board.seq, action);
        setState((s) => ({ ...s, pending: false }));
        receive(res);
      } catch (err) {
        const code = errorCodeOf(err);
        if (code === 'stale_state' || code === 'duel_over') {
          setState((s) => ({
            ...s,
            pending: false,
            notice: { kind: 'stale' },
          }));
          void load();
          return;
        }
        setState((s) => ({
          ...s,
          pending: false,
          notice: code ? { kind: 'refused', code } : { kind: 'error' },
        }));
      }
    },
    [busy, client, duelId, load, receive, state.data]
  );

  const abandon = useCallback(async () => {
    if (state.pending) return;
    clearTimer();
    setState((s) => ({ ...s, pending: true, notice: null }));
    try {
      const res = await client.abandon(duelId);
      setState((s) => ({ ...s, pending: false }));
      receive(res);
    } catch (err) {
      const code = errorCodeOf(err);
      setState((s) => ({
        ...s,
        pending: false,
        notice: code ? { kind: 'refused', code } : { kind: 'error' },
      }));
    }
  }, [clearTimer, client, duelId, receive, state.pending]);

  const skip = useCallback(() => {
    const q = queue.current;
    if (q) finish(q.res, q.index);
  }, [finish]);

  return { ...state, busy, act, abandon, skip, reload: load };
}
