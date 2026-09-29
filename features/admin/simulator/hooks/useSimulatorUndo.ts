// features/admin/simulator/hooks/useSimulatorUndo.ts — pile annuler/refaire
// des occurrences et mutation des phases de l'occurrence active.
//
// Callbacks DÉPLACÉS À L'IDENTIQUE depuis pages/admin/tournament-simulator.tsx
// (mêmes corps, mêmes dépendances) : seuls les accès à l'état de la page
// deviennent des paramètres. La page reste propriétaire de tous les useState.

import { useCallback } from 'react';
import type { SimStage } from '@/utils/simulator';
import type { OccurrenceData } from '@/utils/simulatorSerialization';
import type { Setter } from './simulatorHookTypes';

export type SimulatorUndoDeps = {
  MAX_UNDO: number;
  occurrences: OccurrenceData[];
  setOccurrences: Setter<OccurrenceData[]>;
  activeOccurrence: number;
  undoStack: OccurrenceData[][];
  setUndoStack: Setter<OccurrenceData[][]>;
  redoStack: OccurrenceData[][];
  setRedoStack: Setter<OccurrenceData[][]>;
};

export function useSimulatorUndo(deps: SimulatorUndoDeps) {
  const {
    MAX_UNDO,
    occurrences,
    setOccurrences,
    activeOccurrence,
    undoStack,
    setUndoStack,
    redoStack,
    setRedoStack,
  } = deps;

  /** Push current occurrences to undo stack before mutating */
  // biome-ignore lint/correctness/useExhaustiveDependencies: deps d'origine conservées (setters stables reçus en paramètre)
  const pushUndo = useCallback(() => {
    setUndoStack((prev) => [...prev.slice(-(MAX_UNDO - 1)), occurrences]);
    setRedoStack([]);
  }, [occurrences, MAX_UNDO]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: deps d'origine conservées (setters stables reçus en paramètre)
  const setStages = useCallback(
    (updater: (prev: SimStage[]) => SimStage[]) => {
      pushUndo();
      setOccurrences((prev) =>
        prev.map((occ, i) =>
          i === activeOccurrence ? { ...occ, stages: updater(occ.stages) } : occ
        )
      );
    },
    [activeOccurrence, pushUndo]
  );

  // biome-ignore lint/correctness/useExhaustiveDependencies: deps d'origine conservées (setters stables reçus en paramètre)
  const handleUndo = useCallback(() => {
    if (undoStack.length === 0) return;
    setRedoStack((prev) => [...prev, occurrences]);
    const restored = undoStack[undoStack.length - 1];
    setUndoStack((prev) => prev.slice(0, -1));
    setOccurrences(restored);
  }, [undoStack, occurrences]);

  // biome-ignore lint/correctness/useExhaustiveDependencies: deps d'origine conservées (setters stables reçus en paramètre)
  const handleRedo = useCallback(() => {
    if (redoStack.length === 0) return;
    setUndoStack((prev) => [...prev, occurrences]);
    const restored = redoStack[redoStack.length - 1];
    setRedoStack((prev) => prev.slice(0, -1));
    setOccurrences(restored);
  }, [redoStack, occurrences]);

  return { setStages, handleUndo, handleRedo };
}
