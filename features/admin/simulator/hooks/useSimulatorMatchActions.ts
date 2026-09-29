// features/admin/simulator/hooks/useSimulatorMatchActions.ts — actions de
// simulation sur les matchs (un match, tout, round suivant, animé, reset,
// verrou « what-if ») et props référentiellement stables pour le bracket.
//
// Callbacks et mémos DÉPLACÉS À L'IDENTIQUE depuis
// pages/admin/tournament-simulator.tsx (mêmes corps, mêmes dépendances) :
// seuls les accès à l'état de la page deviennent des paramètres. La page reste
// propriétaire de tous les useState et de `animatingRef`.

import { useCallback, useMemo, useRef, type RefObject } from 'react';
import {
  simulateMatch,
  propagateBracket,
  resolveByes,
  simulateBracketToCompletion,
} from '@/utils/simulator';
import type { SimMatch } from '@/utils/simulator';
import {
  groupByRound,
  type RoundGroup,
} from '@/components/admin/simulator/EliminationView';
import type { SetStages, Setter } from './simulatorHookTypes';

export type SimulatorMatchActionsDeps = {
  setStages: SetStages;
  animatingRef: RefObject<boolean>;
  setAnimating: Setter<boolean>;
};

export function useSimulatorMatchActions(deps: SimulatorMatchActionsDeps) {
  const { setStages, animatingRef, setAnimating } = deps;

  const handleSimulateMatch = useCallback(
    (stageIdx: number, matchId: string) => {
      setStages((prev) => {
        const next = [...prev];
        const stage = {
          ...next[stageIdx],
          matches: [...next[stageIdx].matches],
        };
        const mIdx = stage.matches.findIndex((m) => m.id === matchId);
        if (mIdx === -1 || stage.matches[mIdx].locked) return prev;
        stage.matches[mIdx] = simulateMatch(stage.matches[mIdx]);
        if (stage.stage_type === 'bracket') {
          stage.matches = propagateBracket(stage.matches);
        }
        next[stageIdx] = stage;
        return next;
      });
    },
    [setStages]
  );

  const handleResetMatch = useCallback(
    (stageIdx: number, matchId: string) => {
      setStages((prev) => {
        const next = [...prev];
        const stage = {
          ...next[stageIdx],
          matches: [...next[stageIdx].matches],
        };
        const mIdx = stage.matches.findIndex((m) => m.id === matchId);
        if (mIdx === -1 || stage.matches[mIdx].locked) return prev;
        stage.matches[mIdx] = {
          ...stage.matches[mIdx],
          status: 'pending',
          team1_score: null,
          team2_score: null,
          winner_team_id: null,
        };
        next[stageIdx] = stage;
        return next;
      });
    },
    [setStages]
  );

  const handleSimulateAll = useCallback(() => {
    setStages((prev) =>
      prev.map((stage) => {
        let matches = [...stage.matches];
        if (
          stage.stage_type === 'bracket' ||
          stage.stage_type === 'showmatch'
        ) {
          // Shared engine: resolves byes, plays ready matches and propagates,
          // handling double elimination and non-power-of-2 fields correctly.
          matches = simulateBracketToCompletion(matches, { skipLocked: true });
        } else {
          matches = resolveByes(
            matches.map((m) =>
              m.status === 'pending' && !m.locked ? simulateMatch(m) : m
            )
          );
        }
        return { ...stage, matches };
      })
    );
  }, [setStages]);

  /** Simulate only the next incomplete round across all stages (skips locked) */
  const handleSimulateNextRound = useCallback(() => {
    setStages((prev) =>
      prev.map((stage) => {
        const isBracket =
          stage.stage_type === 'bracket' || stage.stage_type === 'showmatch';
        let matches = [...stage.matches];
        // Advance any pending byes first so their teams are in place.
        if (isBracket) matches = propagateBracket(resolveByes(matches));
        const pendingRounds = [
          ...new Set(
            matches
              .filter(
                (m) => m.status === 'pending' && !m.locked && m.team1 && m.team2
              )
              .map((m) => m.round_number)
          ),
        ].sort((a, b) => a - b);
        if (pendingRounds.length === 0) return { ...stage, matches };
        const nextRound = pendingRounds[0];
        for (let i = 0; i < matches.length; i++) {
          if (
            matches[i].round_number === nextRound &&
            matches[i].status === 'pending' &&
            !matches[i].locked &&
            matches[i].team1 &&
            matches[i].team2
          ) {
            matches[i] = simulateMatch(matches[i]);
          }
        }
        if (isBracket) {
          // Propagate, then resolve byes newly exposed by this round.
          matches = propagateBracket(matches);
          matches = propagateBracket(resolveByes(matches));
        } else {
          matches = resolveByes(matches);
        }
        return { ...stage, matches };
      })
    );
  }, [setStages]);

  /** Toggle lock on a match (What-if mode) */
  const handleToggleLock = useCallback(
    (stageIdx: number, matchId: string) => {
      setStages((prev) => {
        const next = [...prev];
        const stage = {
          ...next[stageIdx],
          matches: [...next[stageIdx].matches],
        };
        const mIdx = stage.matches.findIndex((m) => m.id === matchId);
        if (mIdx === -1) return prev;
        stage.matches[mIdx] = {
          ...stage.matches[mIdx],
          locked: !stage.matches[mIdx].locked,
        };
        next[stageIdx] = stage;
        return next;
      });
    },
    [setStages]
  );

  // --- Referentially stable props for EliminationView / SimMatchCard ---------
  // The match handlers above are re-created on every state change (their dep
  // chain reaches `occurrences` via setStages -> pushUndo). To keep the
  // memoized bracket cards from re-rendering on every interaction, we dispatch
  // through a ref: the per-stage handler objects below stay stable forever and
  // always call the latest handler.
  const matchActionsRef = useRef({
    simulate: handleSimulateMatch,
    reset: handleResetMatch,
    toggleLock: handleToggleLock,
  });
  matchActionsRef.current.simulate = handleSimulateMatch;
  matchActionsRef.current.reset = handleResetMatch;
  matchActionsRef.current.toggleLock = handleToggleLock;

  // Stable factory returning cached, per-stageIdx handler bundles. Empty deps:
  // the returned arrows only close over `stageIdx` and the (stable) ref.
  const getStageHandlers = useMemo(() => {
    const cache = new Map<
      number,
      {
        onSimulate: (id: string) => void;
        onReset: (id: string) => void;
        onToggleLock: (id: string) => void;
      }
    >();
    return (stageIdx: number) => {
      let entry = cache.get(stageIdx);
      if (!entry) {
        entry = {
          onSimulate: (id: string) =>
            matchActionsRef.current.simulate(stageIdx, id),
          onReset: (id: string) => matchActionsRef.current.reset(stageIdx, id),
          onToggleLock: (id: string) =>
            matchActionsRef.current.toggleLock(stageIdx, id),
        };
        cache.set(stageIdx, entry);
      }
      return entry;
    };
  }, []);

  // Memoized groupByRound: caches per (matches ref, side). Unchanged stages
  // keep the same `matches` reference across renders, so this returns the same
  // RoundGroup[] and lets memo(EliminationView) skip them.
  const groupByRoundMemo = useMemo(() => {
    const cache = new WeakMap<SimMatch[], Map<string, RoundGroup[]>>();
    return (matches: SimMatch[], side?: 'wb' | 'lb' | 'final') => {
      let bySide = cache.get(matches);
      if (!bySide) {
        bySide = new Map();
        cache.set(matches, bySide);
      }
      const key = side ?? '';
      let result = bySide.get(key);
      if (!result) {
        result = groupByRound(matches, side);
        bySide.set(key, result);
      }
      return result;
    };
  }, []);

  /** Animated simulation: reveal results one match at a time */
  // biome-ignore lint/correctness/useExhaustiveDependencies: deps d'origine conservées (setter et ref stables reçus en paramètre)
  const handleSimulateAnimated = useCallback(() => {
    if (animatingRef.current) {
      // Stop animation
      animatingRef.current = false;
      setAnimating(false);
      return;
    }
    animatingRef.current = true;
    setAnimating(true);

    const runNext = () => {
      if (!animatingRef.current) return;

      setStages((prev) => {
        // Silently advance any pending byes (auto-wins) across every stage
        // before revealing the next real match.
        const working = prev.map((stage) => {
          const isBracket =
            stage.stage_type === 'bracket' || stage.stage_type === 'showmatch';
          const resolved = isBracket
            ? propagateBracket(resolveByes(stage.matches))
            : resolveByes(stage.matches);
          return { ...stage, matches: resolved };
        });

        // Find next playable match across all stages
        for (let sIdx = 0; sIdx < working.length; sIdx++) {
          const stage = working[sIdx];
          const roundNums = [
            ...new Set(
              stage.matches
                .filter(
                  (m) =>
                    m.status === 'pending' && !m.locked && m.team1 && m.team2
                )
                .map((m) => m.round_number)
            ),
          ].sort((a, b) => a - b);

          if (roundNums.length === 0) continue;
          const nextRound = roundNums[0];
          const mIdx = stage.matches.findIndex(
            (m) =>
              m.round_number === nextRound &&
              m.status === 'pending' &&
              !m.locked &&
              m.team1 &&
              m.team2
          );
          if (mIdx === -1) continue;

          const next = [...working];
          const updatedStage = {
            ...next[sIdx],
            matches: [...next[sIdx].matches],
          };
          updatedStage.matches[mIdx] = simulateMatch(
            updatedStage.matches[mIdx]
          );
          if (
            updatedStage.stage_type === 'bracket' ||
            updatedStage.stage_type === 'showmatch'
          ) {
            updatedStage.matches = propagateBracket(updatedStage.matches);
          }
          next[sIdx] = updatedStage;

          // Schedule next match
          setTimeout(runNext, 400);
          return next;
        }

        // No more matches to simulate
        animatingRef.current = false;
        setAnimating(false);
        return working;
      });
    };

    // Start first match immediately
    runNext();
  }, [setStages]);

  return {
    handleSimulateAll,
    handleSimulateNextRound,
    handleSimulateAnimated,
    getStageHandlers,
    groupByRoundMemo,
  };
}
