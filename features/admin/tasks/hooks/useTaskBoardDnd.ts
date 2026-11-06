// features/admin/tasks/hooks/useTaskBoardDnd.ts — déplacement des cartes :
// glisser-déposer natif (HTML5) et `moveCard`, partagé avec le sélecteur de
// colonne de la fenêtre de carte (le seul moyen au doigt et au clavier).
//
// Le plan du déplacement est pur (`planMove`, taskBoardModel.ts) : il
// RENUMÉROTE les positions, sans quoi le tri « Manuel » (par `position`)
// remettait l'ancien ordre à l'écran, et il dit quand il n'y a rien à faire
// (carte lâchée à sa place) : ni appel, ni « Carte déplacée ».
//
// Dépôt sur une carte : avant elle si l'on lâche sur sa moitié haute, après
// sur sa moitié basse (sinon on ne pouvait pas descendre une carte d'un cran).
// Un trait montre la place pendant le glisser (`dropHint`).
//
// `isBusy` : vrai pendant un glisser ou un déplacement en cours ; la relecture
// en direct (useTaskBoardLive) attend, pour ne pas réafficher l'ancien ordre.

import {
  type DragEvent,
  type MutableRefObject,
  useCallback,
  useRef,
  useState,
} from 'react';
import { format } from '@/lib/i18n/useAdminT';
import type {
  BoardDetail,
  Dict,
} from '@/components/admin/tasks/taskBoardModel';
import { dropIndexAt, planMove } from '@/features/admin/tasks/taskBoardRules';
import { taskBoardUrls } from '../client';
import type {
  AddToast,
  FetchBoards,
  FetchDetail,
  Mutation,
  Setter,
} from './taskBoardHookTypes';

export type TaskBoardDndDeps = {
  t: Dict;
  addToast: AddToast;
  moveMutation: Mutation;
  fetchBoards: FetchBoards;
  fetchDetail: FetchDetail;
  dragTaskId: MutableRefObject<string | null>;
  detail: BoardDetail | null;
  setDetail: Setter<BoardDetail | null>;
  activeBoardId: string | null;
  dndEnabled: boolean;
};

/** Place montrée pendant le glisser : avant/après une carte, ou fin de colonne. */
export type DropHint = {
  columnId: string;
  taskId: string | null;
  after: boolean;
};

type MoveError = {
  payload?: { code?: string; limit?: number; current?: number };
  message?: string;
};

export function useTaskBoardDnd(deps: TaskBoardDndDeps) {
  const {
    t,
    addToast,
    moveMutation,
    fetchBoards,
    fetchDetail,
    dragTaskId,
    detail,
    setDetail,
    activeBoardId,
    dndEnabled,
  } = deps;

  const [dropHint, setDropHint] = useState<DropHint | null>(null);
  const pendingMoves = useRef(0);

  const isBusy = useCallback(
    () => dragTaskId.current != null || pendingMoves.current > 0,
    [dragTaskId]
  );

  /**
   * Déplace `taskId` dans `toColumnId` à l'index `index` parmi les autres
   * cartes de la colonne (`null` = à la fin). Mise à jour optimiste, retour
   * arrière (et relecture) en cas d'échec. Rend `false` seulement sur échec.
   */
  // biome-ignore lint/correctness/useExhaustiveDependencies: setter stable reçu en paramètre
  const moveCard = useCallback(
    async (
      taskId: string,
      toColumnId: string,
      index: number | null
    ): Promise<boolean> => {
      if (!detail || !activeBoardId) return false;
      const plan = planMove(detail, taskId, toColumnId, index);
      if (!plan) return true; // déjà à cette place
      const snapshot = detail;
      setDetail(plan.detail);
      pendingMoves.current += 1;
      try {
        await moveMutation.mutateJson(taskBoardUrls.taskMove(taskId), {
          method: 'PATCH',
          body: JSON.stringify({
            columnId: toColumnId,
            ...(plan.apiPosition != null ? { position: plan.apiPosition } : {}),
          }),
        });
        addToast(t.cardMoved, 'success');
        // Rafraîchit les compteurs de colonnes (badge WIP).
        await fetchBoards({ keepActive: true });
        return true;
      } catch (err: unknown) {
        setDetail(snapshot); // retour arrière optimiste
        const anyErr = err as MoveError;
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
          // Un autre déplacement a pu partir entre-temps : on se recale.
          void fetchDetail(activeBoardId);
        }
        return false;
      } finally {
        pendingMoves.current -= 1;
      }
    },
    [detail, activeBoardId, moveMutation, addToast, t, fetchBoards, fetchDetail]
  );

  function onCardDragStart(e: DragEvent, taskId: string) {
    dragTaskId.current = taskId;
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', taskId);
  }

  function onCardDragEnd() {
    dragTaskId.current = null;
    setDropHint(null);
  }

  /** Moitié basse de la carte survolée = « après elle ». */
  function isLowerHalf(e: DragEvent): boolean {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    return e.clientY > rect.top + rect.height / 2;
  }

  function onDragOverCard(e: DragEvent, columnId: string, taskId: string) {
    e.preventDefault();
    e.stopPropagation();
    if (!dndEnabled || !dragTaskId.current) return;
    const after = isLowerHalf(e);
    const self = dragTaskId.current === taskId;
    setDropHint((prev) => {
      if (self) return prev === null ? prev : null;
      if (
        prev &&
        prev.columnId === columnId &&
        prev.taskId === taskId &&
        prev.after === after
      ) {
        return prev;
      }
      return { columnId, taskId, after };
    });
  }

  function onDragOverColumn(e: DragEvent, columnId: string) {
    e.preventDefault();
    if (!dndEnabled || !dragTaskId.current) return;
    setDropHint((prev) =>
      prev && prev.columnId === columnId && prev.taskId === null
        ? prev
        : { columnId, taskId: null, after: true }
    );
  }

  function onDropOnCard(
    e: DragEvent,
    toColumnId: string,
    targetTaskId: string
  ) {
    e.preventDefault();
    e.stopPropagation();
    const after = isLowerHalf(e);
    setDropHint(null);
    const taskId = dragTaskId.current;
    dragTaskId.current = null;
    if (!dndEnabled || !taskId || !detail) return;
    const col = detail.columns.find((c) => c.id === toColumnId);
    if (!col) return;
    const idx = dropIndexAt(col, taskId, targetTaskId, after);
    if (idx == null) return; // lâchée sur elle-même
    void moveCard(taskId, toColumnId, idx);
  }

  function onDropOnColumn(e: DragEvent, toColumnId: string) {
    e.preventDefault();
    setDropHint(null);
    const taskId = dragTaskId.current;
    dragTaskId.current = null;
    if (!dndEnabled || !taskId) return;
    void moveCard(taskId, toColumnId, null);
  }

  return {
    onCardDragStart,
    onCardDragEnd,
    onDragOverCard,
    onDragOverColumn,
    onDropOnCard,
    onDropOnColumn,
    moveCard,
    dropHint,
    isBusy,
  };
}
