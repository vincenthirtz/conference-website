// features/admin/tasks/hooks/useTaskBoardDnd.ts — glisser-déposer natif
// (HTML5) des cartes : début / fin de glisser, dépôt sur une carte ou sur une
// colonne, déplacement optimiste avec rollback (dont le 409 wip_exceeded).
//
// Corps DÉPLACÉS À L'IDENTIQUE depuis pages/admin/tasks/index.tsx : seuls les
// accès à l'état et aux outils de la page deviennent des paramètres. La page
// reste propriétaire du ref `dragTaskId` et de l'état `detail`.

import { type MutableRefObject, useCallback } from 'react';
import { format } from '@/lib/i18n/useAdminT';
import type {
  BoardDetail,
  BoardTask,
  Dict,
} from '@/components/admin/tasks/taskBoardModel';
import { taskBoardUrls } from '../client';
import type {
  AddToast,
  FetchBoards,
  Mutation,
  Setter,
} from './taskBoardHookTypes';

export type TaskBoardDndDeps = {
  t: Dict;
  addToast: AddToast;
  moveMutation: Mutation;
  fetchBoards: FetchBoards;
  dragTaskId: MutableRefObject<string | null>;
  detail: BoardDetail | null;
  setDetail: Setter<BoardDetail | null>;
  activeBoardId: string | null;
  dndEnabled: boolean;
};

export function useTaskBoardDnd(deps: TaskBoardDndDeps) {
  const {
    t,
    addToast,
    moveMutation,
    fetchBoards,
    dragTaskId,
    detail,
    setDetail,
    activeBoardId,
    dndEnabled,
  } = deps;

  // -------------------------------------------------------------------------
  // Drag & drop natif
  // -------------------------------------------------------------------------

  function onCardDragStart(e: React.DragEvent, taskId: string) {
    dragTaskId.current = taskId;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', taskId);
  }

  function onCardDragEnd() {
    dragTaskId.current = null;
  }

  // Déplace la carte draggée vers `toColumnId` à `position` (index dans la
  // colonne cible SANS la carte draggée ; null = fin). Update optimiste +
  // rollback (refetch) en cas d'erreur serveur.
  // biome-ignore lint/correctness/useExhaustiveDependencies: deps d'origine conservées (ref et setter stables reçus en paramètre)
  const performMove = useCallback(
    async (toColumnId: string, position: number | null) => {
      const taskId = dragTaskId.current;
      dragTaskId.current = null;
      if (!taskId || !detail || !activeBoardId) return;

      // Snapshot pour rollback
      const snapshot = detail;

      // Localise la carte + sa colonne source
      let moving: BoardTask | null = null;
      for (const col of detail.columns) {
        const found = col.tasks.find((tk) => tk.id === taskId);
        if (found) {
          moving = found;
          break;
        }
      }
      if (!moving) return;
      const movingTask: BoardTask = moving;

      // Construit le nouvel état optimiste
      const nextColumns = detail.columns.map((col) => {
        // Retire la carte partout
        const without = col.tasks.filter((tk) => tk.id !== taskId);
        if (col.id !== toColumnId) return { ...col, tasks: without };
        // Insère dans la colonne cible
        const insertAt = position == null ? without.length : position;
        const clamped = Math.max(0, Math.min(insertAt, without.length));
        const nextTasks = [
          ...without.slice(0, clamped),
          movingTask,
          ...without.slice(clamped),
        ];
        return { ...col, tasks: nextTasks };
      });

      setDetail({ ...detail, columns: nextColumns });

      try {
        await moveMutation.mutateJson(taskBoardUrls.taskMove(taskId), {
          method: 'PATCH',
          body: JSON.stringify({
            columnId: toColumnId,
            ...(position != null ? { position } : {}),
          }),
        });
        addToast(t.cardMoved, 'success');
        // Rafraîchit les compteurs de colonnes (badge WIP).
        await fetchBoards({ keepActive: true });
      } catch (err: unknown) {
        setDetail(snapshot); // rollback optimiste
        const anyErr = err as {
          payload?: { code?: string; limit?: number; current?: number };
          message?: string;
        };
        if (anyErr?.payload?.code === 'wip_exceeded') {
          addToast(
            format(t.wipExceededToast, {
              current: anyErr.payload.current ?? 0,
              limit: anyErr.payload.limit ?? 0,
            }),
            'error'
          );
        } else {
          addToast(anyErr?.message || t.errorGeneric, 'error');
        }
      }
    },
    [detail, activeBoardId, moveMutation, addToast, t, fetchBoards]
  );

  function onDropOnCard(
    e: React.DragEvent,
    toColumnId: string,
    targetTaskId: string
  ) {
    e.preventDefault();
    e.stopPropagation();
    if (!dndEnabled) return;
    const taskId = dragTaskId.current;
    if (!taskId || !detail) return;
    const col = detail.columns.find((c) => c.id === toColumnId);
    if (!col) return;
    const without = col.tasks.filter((tk) => tk.id !== taskId);
    const idx = without.findIndex((tk) => tk.id === targetTaskId);
    performMove(toColumnId, idx < 0 ? null : idx);
  }

  function onDropOnColumn(e: React.DragEvent, toColumnId: string) {
    e.preventDefault();
    if (!dndEnabled) return;
    performMove(toColumnId, null);
  }

  return { onCardDragStart, onCardDragEnd, onDropOnCard, onDropOnColumn };
}
