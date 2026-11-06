// features/admin/tasks/hooks/useTaskBoardBoardActions.ts — gestes du board et
// de ses colonnes (créer / renommer / archiver / supprimer un board ; ajouter /
// éditer / supprimer / réordonner une colonne) et de la corbeille.
//
// Corps d'origine DÉPLACÉS depuis pages/admin/tasks/index.tsx : la page reste
// propriétaire des useState des formulaires. Seul ajout tenu ici : la fenêtre
// « déplacer les cartes puis supprimer » d'une colonne non vide (état local,
// pour ne pas grossir la page, plafonnée par adminFileSizeGuard).

import { useCallback, useState } from 'react';
import { format } from '@/lib/i18n/useAdminT';
import type {
  BoardDetail,
  BoardDetailColumn,
  BoardListItem,
  DeletedTask,
  Dict,
} from '@/components/admin/tasks/taskBoardModel';
import { taskBoardUrls, taskBoardClient } from '../client';
import type {
  AddToast,
  Confirm,
  FetchBoards,
  FetchDetail,
  Mutation,
  Setter,
} from './taskBoardHookTypes';

export type TaskBoardBoardActionsDeps = {
  t: Dict;
  addToast: AddToast;
  confirm: Confirm;
  boardMutation: Mutation;
  columnMutation: Mutation;
  restoreMutation: Mutation;
  fetchBoards: FetchBoards;
  fetchDetail: FetchDetail;
  detail: BoardDetail | null;
  activeBoardId: string | null;
  setActiveBoardId: Setter<string | null>;
  activeBoard: BoardListItem | null;
  // Board modale
  boardModalMode: 'create' | 'rename';
  setBoardModalMode: Setter<'create' | 'rename'>;
  boardFormName: string;
  setBoardFormName: Setter<string>;
  boardFormDesc: string;
  setBoardFormDesc: Setter<string>;
  setBoardModalOpen: Setter<boolean>;
  setBoardSaving: Setter<boolean>;
  // Colonne modale
  editingColumnId: string | null;
  setEditingColumnId: Setter<string | null>;
  colFormName: string;
  setColFormName: Setter<string>;
  colFormWip: string;
  setColFormWip: Setter<string>;
  colFormDone: boolean;
  setColFormDone: Setter<boolean>;
  setColumnModalOpen: Setter<boolean>;
  setColSaving: Setter<boolean>;
  // Corbeille
  setTrashOpen: Setter<boolean>;
  setDeletedTasks: Setter<DeletedTask[]>;
  setDeletedLoading: Setter<boolean>;
  setRestoringId: Setter<string | null>;
};

export function useTaskBoardBoardActions(deps: TaskBoardBoardActionsDeps) {
  const {
    t,
    addToast,
    confirm,
    boardMutation,
    columnMutation,
    restoreMutation,
    fetchBoards,
    fetchDetail,
    detail,
    activeBoardId,
    setActiveBoardId,
    activeBoard,
    boardModalMode,
    setBoardModalMode,
    boardFormName,
    setBoardFormName,
    boardFormDesc,
    setBoardFormDesc,
    setBoardModalOpen,
    setBoardSaving,
    editingColumnId,
    setEditingColumnId,
    colFormName,
    setColFormName,
    colFormWip,
    setColFormWip,
    colFormDone,
    setColFormDone,
    setColumnModalOpen,
    setColSaving,
    setTrashOpen,
    setDeletedTasks,
    setDeletedLoading,
    setRestoringId,
  } = deps;

  // Corbeille : cartes soft-deleted du board actif (triées deletedAt DESC).
  // biome-ignore lint/correctness/useExhaustiveDependencies: deps d'origine conservées (setters stables reçus en paramètre)
  const fetchDeletedTasks = useCallback(async () => {
    if (!activeBoardId) {
      setDeletedTasks([]);
      return;
    }
    setDeletedLoading(true);
    try {
      const json = await taskBoardClient.deleted(activeBoardId);
      setDeletedTasks(json.tasks || []);
    } catch (err: unknown) {
      addToast((err as Error)?.message || t.trashLoadError, 'error');
    } finally {
      setDeletedLoading(false);
    }
  }, [activeBoardId, addToast, t]);

  function openTrash() {
    setTrashOpen(true);
    void fetchDeletedTasks();
  }

  // Restaure une carte : retire la ligne de la corbeille et rafraîchit le board
  // actif pour la voir réapparaître. Gère 409 not_deleted (déjà restaurée) et
  // 409 column_gone (colonne d'origine disparue).
  async function handleRestoreTask(task: DeletedTask) {
    setRestoringId(task.id);
    try {
      await restoreMutation.mutateJson(taskBoardUrls.taskRestore(task.id), {
        method: 'PATCH',
      });
      addToast(t.trashRestored, 'success');
      setDeletedTasks((prev) => prev.filter((d) => d.id !== task.id));
      if (activeBoardId) void fetchDetail(activeBoardId);
      void fetchBoards({ keepActive: true });
    } catch (err: unknown) {
      const anyErr = err as { payload?: { code?: string }; message?: string };
      const code = anyErr?.payload?.code;
      if (code === 'not_deleted') {
        // Déjà restaurée ailleurs : on retire simplement la ligne obsolète.
        addToast(t.trashAlreadyRestored, 'error');
        setDeletedTasks((prev) => prev.filter((d) => d.id !== task.id));
        if (activeBoardId) void fetchDetail(activeBoardId);
      } else if (code === 'column_gone') {
        addToast(t.trashColumnGone, 'error');
      } else {
        addToast(anyErr?.message || t.errorGeneric, 'error');
      }
    } finally {
      setRestoringId(null);
    }
  }

  // -------------------------------------------------------------------------
  // Board : create / rename / archive / delete
  // -------------------------------------------------------------------------

  function openCreateBoard() {
    setBoardModalMode('create');
    setBoardFormName('');
    setBoardFormDesc('');
    setBoardModalOpen(true);
  }

  function openRenameBoard() {
    if (!activeBoard) return;
    setBoardModalMode('rename');
    setBoardFormName(activeBoard.name);
    setBoardFormDesc(activeBoard.description ?? '');
    setBoardModalOpen(true);
  }

  async function handleSaveBoard() {
    if (!boardFormName.trim()) {
      addToast(t.errorGeneric, 'error');
      return;
    }
    setBoardSaving(true);
    try {
      if (boardModalMode === 'create') {
        const res = await boardMutation.mutateJson<{ board: { id: string } }>(
          taskBoardUrls.boards,
          {
            method: 'POST',
            body: JSON.stringify({
              name: boardFormName.trim(),
              description: boardFormDesc.trim() || undefined,
            }),
          }
        );
        addToast(t.boardCreated, 'success');
        setBoardModalOpen(false);
        await fetchBoards();
        setActiveBoardId(res.board.id);
      } else if (activeBoardId) {
        await boardMutation.mutateJson(taskBoardUrls.board(activeBoardId), {
          method: 'PATCH',
          body: JSON.stringify({
            name: boardFormName.trim(),
            description: boardFormDesc.trim() || null,
          }),
        });
        addToast(t.boardRenamed, 'success');
        setBoardModalOpen(false);
        await fetchBoards({ keepActive: true });
      }
    } catch (err: unknown) {
      addToast((err as Error)?.message || t.errorGeneric, 'error');
    } finally {
      setBoardSaving(false);
    }
  }

  async function handleToggleArchive() {
    if (!activeBoard) return;
    const next = !activeBoard.isArchived;
    try {
      await boardMutation.mutateJson(taskBoardUrls.board(activeBoard.id), {
        method: 'PATCH',
        body: JSON.stringify({ is_archived: next }),
      });
      addToast(next ? t.boardArchived : t.boardUnarchived, 'success');
      await fetchBoards();
    } catch (err: unknown) {
      addToast((err as Error)?.message || t.errorGeneric, 'error');
    }
  }

  async function handleDeleteBoard() {
    if (!activeBoard) return;
    const ok = await confirm({
      title: t.confirmDeleteBoard,
      subtitle: t.confirmDeleteBoardSubtitle,
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await boardMutation.mutateJson(taskBoardUrls.board(activeBoard.id), {
        method: 'DELETE',
      });
      addToast(t.boardDeleted, 'success');
      setActiveBoardId(null);
      await fetchBoards();
    } catch (err: unknown) {
      addToast((err as Error)?.message || t.errorGeneric, 'error');
    }
  }

  // -------------------------------------------------------------------------
  // Colonnes
  // -------------------------------------------------------------------------

  function openAddColumn() {
    setEditingColumnId(null);
    setColFormName('');
    setColFormWip('');
    setColFormDone(false);
    setColumnModalOpen(true);
  }

  function openEditColumn(col: BoardDetailColumn) {
    setEditingColumnId(col.id);
    setColFormName(col.name);
    setColFormWip(col.wipLimit != null ? String(col.wipLimit) : '');
    setColFormDone(col.isDone);
    setColumnModalOpen(true);
  }

  async function handleSaveColumn() {
    if (!colFormName.trim() || !activeBoardId) {
      addToast(t.errorGeneric, 'error');
      return;
    }
    const wipParsed = colFormWip.trim() ? Number(colFormWip.trim()) : null;
    const wipLimit =
      wipParsed != null && Number.isFinite(wipParsed) && wipParsed > 0
        ? Math.floor(wipParsed)
        : null;
    setColSaving(true);
    try {
      if (editingColumnId) {
        await columnMutation.mutateJson(taskBoardUrls.column(editingColumnId), {
          method: 'PATCH',
          body: JSON.stringify({
            name: colFormName.trim(),
            wipLimit,
            isDone: colFormDone,
          }),
        });
        addToast(t.columnUpdated, 'success');
      } else {
        await columnMutation.mutateJson(taskBoardUrls.columns, {
          method: 'POST',
          body: JSON.stringify({
            boardId: activeBoardId,
            name: colFormName.trim(),
            wipLimit: wipLimit ?? undefined,
            isDone: colFormDone,
          }),
        });
        addToast(t.columnCreated, 'success');
      }
      setColumnModalOpen(false);
      await fetchDetail(activeBoardId);
      await fetchBoards({ keepActive: true });
    } catch (err: unknown) {
      addToast((err as Error)?.message || t.errorGeneric, 'error');
    } finally {
      setColSaving(false);
    }
  }

  // Colonne non vide : fenêtre « déplacer les cartes vers… puis supprimer ».
  const [columnToDelete, setColumnToDelete] =
    useState<BoardDetailColumn | null>(null);
  const [moveToColumnId, setMoveToColumnId] = useState('');
  const [deletingColumn, setDeletingColumn] = useState(false);

  /** Autres colonnes du board, dans l'ordre d'affichage. */
  function otherColumns(col: BoardDetailColumn) {
    return [...(detail?.columns ?? [])]
      .filter((c) => c.id !== col.id)
      .sort((a, b) => a.position - b.position);
  }

  function openMoveAndDelete(col: BoardDetailColumn) {
    const others = otherColumns(col);
    // Par défaut la voisine de gauche (sinon la première) : là où l'on
    // range d'habitude ce qui n'a plus sa colonne.
    const left = [...others].reverse().find((c) => c.position < col.position);
    setMoveToColumnId((left ?? others[0])?.id ?? '');
    setColumnToDelete(col);
  }

  async function handleDeleteColumn(col: BoardDetailColumn) {
    // Les cartes terminées masquées comptent : l'API les voit.
    if (col.tasks.length + (col.archivedCount ?? 0) > 0) {
      openMoveAndDelete(col);
      return;
    }
    const ok = await confirm({
      title: t.confirmDeleteColumn,
      subtitle: t.confirmDeleteColumnSubtitle,
      variant: 'danger',
    });
    if (!ok || !activeBoardId) return;
    try {
      await columnMutation.mutateJson(taskBoardUrls.columnDelete(col.id), {
        method: 'DELETE',
      });
      addToast(t.columnDeleted, 'success');
      await fetchDetail(activeBoardId);
      await fetchBoards({ keepActive: true });
    } catch (err: unknown) {
      const anyErr = err as { payload?: { code?: string }; message?: string };
      if (anyErr?.payload?.code === 'column_not_empty') {
        // Une carte est arrivée entre-temps (staff, bot) : on propose le
        // déplacement plutôt qu'un refus sec.
        openMoveAndDelete(col);
      } else {
        addToast(anyErr?.message || t.errorGeneric, 'error');
      }
    }
  }

  async function confirmMoveAndDelete() {
    const col = columnToDelete;
    if (!col || !moveToColumnId || !activeBoardId) return;
    const target = detail?.columns.find((c) => c.id === moveToColumnId);
    setDeletingColumn(true);
    try {
      const res = await columnMutation.mutateJson<{ moved?: number }>(
        taskBoardUrls.columnDelete(col.id, moveToColumnId),
        { method: 'DELETE' }
      );
      addToast(
        format(t.columnDeletedMoved, {
          count: res?.moved ?? 0,
          name: target?.name ?? '',
        }),
        'success'
      );
      setColumnToDelete(null);
      await fetchDetail(activeBoardId);
      await fetchBoards({ keepActive: true });
    } catch (err: unknown) {
      const anyErr = err as { payload?: { code?: string }; message?: string };
      addToast(
        anyErr?.payload?.code === 'invalid_move_target'
          ? t.invalidMoveTarget
          : anyErr?.message || t.errorGeneric,
        'error'
      );
    } finally {
      setDeletingColumn(false);
    }
  }

  const deleteColumnModal = {
    column: columnToDelete,
    targets: columnToDelete ? otherColumns(columnToDelete) : [],
    moveToColumnId,
    deleting: deletingColumn,
    onMoveToChange: setMoveToColumnId,
    onConfirm: confirmMoveAndDelete,
    onClose: () => setColumnToDelete(null),
  };

  async function handleReorderColumn(index: number, dir: -1 | 1) {
    if (!detail || !activeBoardId) return;
    const cols = [...detail.columns].sort((a, b) => a.position - b.position);
    const target = index + dir;
    if (target < 0 || target >= cols.length) return;
    const a = cols[index];
    const b = cols[target];
    try {
      await Promise.all([
        columnMutation.mutateJson(taskBoardUrls.column(a.id), {
          method: 'PATCH',
          body: JSON.stringify({ position: b.position }),
        }),
        columnMutation.mutateJson(taskBoardUrls.column(b.id), {
          method: 'PATCH',
          body: JSON.stringify({ position: a.position }),
        }),
      ]);
      addToast(t.columnReordered, 'success');
      await fetchDetail(activeBoardId);
    } catch (err: unknown) {
      addToast((err as Error)?.message || t.errorGeneric, 'error');
    }
  }

  return {
    openTrash,
    handleRestoreTask,
    openCreateBoard,
    openRenameBoard,
    handleSaveBoard,
    handleToggleArchive,
    handleDeleteBoard,
    openAddColumn,
    openEditColumn,
    handleSaveColumn,
    handleDeleteColumn,
    handleReorderColumn,
    deleteColumnModal,
  };
}
