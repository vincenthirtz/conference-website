// features/admin/tasks/hooks/useTaskBoardCardActions.ts — gestes d'une carte :
// ouverture (création / édition + chargement checklist, commentaires,
// activité), ajout rapide, checklist, commentaires (dont modification),
// enregistrement (dont changement de colonne), fermeture protégée et
// suppression.
//
// Corps d'origine DÉPLACÉS depuis pages/admin/tasks/index.tsx : la page reste
// propriétaire des useState du formulaire ; ce hook ne garde que l'instantané
// de la carte à l'ouverture (fermeture sans perdre une saisie).

import { useCallback, useRef } from 'react';
import { format } from '@/lib/i18n/useAdminT';
import type {
  BoardTask,
  ChecklistItem,
  Dict,
  Priority,
  TaskActivity,
  TaskComment,
} from '@/components/admin/tasks/taskBoardModel';
import {
  type CardFormSnapshot,
  isCardFormDirty,
} from '@/features/admin/tasks/taskBoardRules';
import { taskBoardUrls, taskBoardClient } from '../client';
import type {
  AddToast,
  Confirm,
  FetchBoards,
  FetchDetail,
  Mutation,
  Setter,
} from './taskBoardHookTypes';

export type TaskBoardCardActionsDeps = {
  t: Dict;
  addToast: AddToast;
  confirm: Confirm;
  cardMutation: Mutation;
  checklistMutation: Mutation;
  commentMutation: Mutation;
  /** Changement de colonne à l'enregistrement (même file que le glisser). */
  moveMutation: Mutation;
  fetchBoards: FetchBoards;
  fetchDetail: FetchDetail;
  activeBoardId: string | null;
  // Carte modale
  setCardModalOpen: Setter<boolean>;
  editingCard: BoardTask | null;
  setEditingCard: Setter<BoardTask | null>;
  cardColumnId: string | null;
  setCardColumnId: Setter<string | null>;
  cardTitle: string;
  setCardTitle: Setter<string>;
  cardDesc: string;
  setCardDesc: Setter<string>;
  cardPriority: Priority;
  setCardPriority: Setter<Priority>;
  cardDue: string;
  setCardDue: Setter<string>;
  cardAssignee: string;
  setCardAssignee: Setter<string>;
  cardLabelNames: string[];
  setCardLabelNames: Setter<string[]>;
  setAdHocLabel: Setter<string>;
  setCardSaving: Setter<boolean>;
  setCardDeleting: Setter<boolean>;
  // Activité
  setTaskActivity: Setter<TaskActivity[]>;
  setActivityLoading: Setter<boolean>;
  setActivityExpanded: Setter<boolean>;
  // Checklist + commentaires
  setCardDetailLoading: Setter<boolean>;
  taskChecklist: ChecklistItem[];
  setTaskChecklist: Setter<ChecklistItem[]>;
  taskComments: TaskComment[];
  setTaskComments: Setter<TaskComment[]>;
  checklistInput: string;
  setChecklistInput: Setter<string>;
  setChecklistAdding: Setter<boolean>;
  commentInput: string;
  setCommentInput: Setter<string>;
  setCommentPosting: Setter<boolean>;
};

export function useTaskBoardCardActions(deps: TaskBoardCardActionsDeps) {
  const {
    t,
    addToast,
    confirm,
    cardMutation,
    checklistMutation,
    commentMutation,
    moveMutation,
    fetchBoards,
    fetchDetail,
    activeBoardId,
    setCardModalOpen,
    editingCard,
    setEditingCard,
    cardColumnId,
    setCardColumnId,
    cardTitle,
    setCardTitle,
    cardDesc,
    setCardDesc,
    cardPriority,
    setCardPriority,
    cardDue,
    setCardDue,
    cardAssignee,
    setCardAssignee,
    cardLabelNames,
    setCardLabelNames,
    setAdHocLabel,
    setCardSaving,
    setCardDeleting,
    setTaskActivity,
    setActivityLoading,
    setActivityExpanded,
    setCardDetailLoading,
    taskChecklist,
    setTaskChecklist,
    taskComments,
    setTaskComments,
    checklistInput,
    setChecklistInput,
    setChecklistAdding,
    commentInput,
    setCommentInput,
    setCommentPosting,
  } = deps;

  // -------------------------------------------------------------------------
  // Cartes
  // -------------------------------------------------------------------------

  function resetCardDetailSections() {
    setTaskChecklist([]);
    setTaskComments([]);
    setChecklistInput('');
    setCommentInput('');
    setCardDetailLoading(false);
    setTaskActivity([]);
    setActivityExpanded(false);
    setActivityLoading(false);
    setAdHocLabel('');
  }

  // Charge la timeline d'activité d'une carte existante (édition).
  // biome-ignore lint/correctness/useExhaustiveDependencies: deps d'origine conservées (setters stables reçus en paramètre)
  const loadCardActivity = useCallback(
    async (taskId: string) => {
      setActivityLoading(true);
      try {
        const json = await taskBoardClient.activity(taskId);
        setTaskActivity(json.activity || []);
      } catch (err: unknown) {
        addToast((err as Error)?.message || t.activityLoadError, 'error');
      } finally {
        setActivityLoading(false);
      }
    },
    [addToast, t]
  );

  // Charge checklist + commentaires d'une carte existante (édition).
  // biome-ignore lint/correctness/useExhaustiveDependencies: deps d'origine conservées (setters stables reçus en paramètre)
  const loadCardDetail = useCallback(
    async (taskId: string) => {
      setCardDetailLoading(true);
      try {
        const json = await taskBoardClient.task(taskId);
        setTaskChecklist(
          (json.task.checklist || [])
            .slice()
            .sort((a, b) => a.position - b.position)
        );
        setTaskComments(
          (json.task.comments || [])
            .slice()
            .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
        );
      } catch (err: unknown) {
        addToast((err as Error)?.message || t.cardDetailLoadError, 'error');
      } finally {
        setCardDetailLoading(false);
      }
    },
    [addToast, t]
  );

  // Ce que la fenêtre montrait à l'ouverture : la fermer après une saisie
  // demande confirmation ; la colonne d'origine dit s'il faut déplacer.
  const openedSnapshot = useRef<CardFormSnapshot | null>(null);

  function openAddCard(columnId: string, title = '') {
    setEditingCard(null);
    setCardColumnId(columnId);
    setCardTitle(title);
    setCardDesc('');
    setCardPriority('medium');
    setCardDue('');
    setCardAssignee('');
    setCardLabelNames([]);
    resetCardDetailSections();
    openedSnapshot.current = {
      title: '',
      description: '',
      priority: 'medium',
      due: '',
      assignee: '',
      labelNames: [],
      columnId,
    };
    setCardModalOpen(true);
  }

  function openEditCard(card: BoardTask, columnId: string | null = null) {
    const snapshot: CardFormSnapshot = {
      title: card.title,
      description: card.description ?? '',
      priority: card.priority,
      due: card.dueDate ? card.dueDate.slice(0, 10) : '',
      assignee: card.assignee?.staffId ?? '',
      labelNames: card.labels ?? [],
      columnId,
    };
    setEditingCard(card);
    setCardColumnId(columnId);
    setCardTitle(snapshot.title);
    setCardDesc(snapshot.description);
    setCardPriority(snapshot.priority);
    setCardDue(snapshot.due);
    setCardAssignee(snapshot.assignee);
    setCardLabelNames(snapshot.labelNames);
    resetCardDetailSections();
    openedSnapshot.current = snapshot;
    setCardModalOpen(true);
    void loadCardDetail(card.id);
    void loadCardActivity(card.id);
  }

  /**
   * Fermeture demandée (Échap, fond, Annuler, ✕) : si la saisie a changé, ou
   * qu'un commentaire / un élément de checklist est tapé sans être envoyé, on
   * demande avant de tout perdre.
   */
  async function requestCloseCard() {
    const dirty =
      isCardFormDirty(openedSnapshot.current, {
        title: cardTitle,
        description: cardDesc,
        priority: cardPriority,
        due: cardDue,
        assignee: cardAssignee,
        labelNames: cardLabelNames,
        columnId: cardColumnId,
      }) ||
      commentInput.trim() !== '' ||
      checklistInput.trim() !== '';
    if (dirty) {
      const ok = await confirm({
        title: t.confirmDiscardCard,
        subtitle: t.confirmDiscardCardSubtitle,
        confirmLabel: t.discardChanges,
        cancelLabel: t.cancel,
        variant: 'danger',
      });
      if (!ok) return;
    }
    setCardModalOpen(false);
  }

  /** Ajout rapide depuis le bas d'une colonne : titre seul, priorité moyenne. */
  async function handleQuickAddCard(
    columnId: string,
    title: string
  ): Promise<boolean> {
    if (!activeBoardId || !title.trim()) return false;
    try {
      await cardMutation.mutateJson(taskBoardUrls.tasks, {
        method: 'POST',
        body: JSON.stringify({
          boardId: activeBoardId,
          columnId,
          title: title.trim(),
          priority: 'medium',
          labels: [],
        }),
      });
      addToast(t.cardCreated, 'success');
      await fetchDetail(activeBoardId);
      void fetchBoards({ keepActive: true });
      return true;
    } catch (err: unknown) {
      addToast((err as Error)?.message || t.errorGeneric, 'error');
      return false;
    }
  }

  // -------------------------------------------------------------------------
  // Checklist (carte en édition)
  // -------------------------------------------------------------------------

  async function handleAddChecklistItem() {
    const label = checklistInput.trim();
    if (!editingCard || !label) return;
    setChecklistAdding(true);
    try {
      const res = await checklistMutation.mutateJson<{ item: ChecklistItem }>(
        taskBoardUrls.taskChecklist(editingCard.id),
        { method: 'POST', body: JSON.stringify({ label }) }
      );
      setTaskChecklist((prev) =>
        [...prev, res.item].sort((a, b) => a.position - b.position)
      );
      setChecklistInput('');
      if (activeBoardId) void fetchDetail(activeBoardId);
    } catch (err: unknown) {
      addToast((err as Error)?.message || t.errorGeneric, 'error');
    } finally {
      setChecklistAdding(false);
    }
  }

  async function handleToggleChecklistItem(item: ChecklistItem) {
    const nextDone = !item.isDone;
    // Optimiste
    setTaskChecklist((prev) =>
      prev.map((it) => (it.id === item.id ? { ...it, isDone: nextDone } : it))
    );
    try {
      await checklistMutation.mutateJson(taskBoardUrls.checklistItem(item.id), {
        method: 'PATCH',
        body: JSON.stringify({ isDone: nextDone }),
      });
      if (activeBoardId) void fetchDetail(activeBoardId);
    } catch (err: unknown) {
      // Rollback
      setTaskChecklist((prev) =>
        prev.map((it) =>
          it.id === item.id ? { ...it, isDone: item.isDone } : it
        )
      );
      addToast((err as Error)?.message || t.errorGeneric, 'error');
    }
  }

  async function handleDeleteChecklistItem(item: ChecklistItem) {
    const snapshot = taskChecklist;
    // Optimiste
    setTaskChecklist((prev) => prev.filter((it) => it.id !== item.id));
    try {
      await checklistMutation.mutateJson(taskBoardUrls.checklistItem(item.id), {
        method: 'DELETE',
      });
      if (activeBoardId) void fetchDetail(activeBoardId);
    } catch (err: unknown) {
      setTaskChecklist(snapshot); // rollback
      addToast((err as Error)?.message || t.errorGeneric, 'error');
    }
  }

  // -------------------------------------------------------------------------
  // Commentaires (carte en édition)
  // -------------------------------------------------------------------------

  async function handleAddComment() {
    const body = commentInput.trim();
    if (!editingCard || !body) return;
    setCommentPosting(true);
    try {
      const res = await commentMutation.mutateJson<{ comment: TaskComment }>(
        taskBoardUrls.taskComments(editingCard.id),
        { method: 'POST', body: JSON.stringify({ body }) }
      );
      setTaskComments((prev) => [...prev, res.comment]);
      setCommentInput('');
      addToast(t.commentAdded, 'success');
      if (activeBoardId) void fetchDetail(activeBoardId);
    } catch (err: unknown) {
      addToast((err as Error)?.message || t.errorGeneric, 'error');
    } finally {
      setCommentPosting(false);
    }
  }

  /** `403 comment_forbidden` : l'API refuse ce geste à cette personne. */
  function isCommentForbidden(err: unknown): boolean {
    return (
      (err as { payload?: { code?: string } })?.payload?.code ===
      'comment_forbidden'
    );
  }

  async function handleEditComment(
    comment: TaskComment,
    body: string
  ): Promise<boolean> {
    try {
      const res = await commentMutation.mutateJson<{ comment: TaskComment }>(
        taskBoardUrls.comment(comment.id),
        { method: 'PATCH', body: JSON.stringify({ body }) }
      );
      setTaskComments((prev) =>
        prev.map((c) => (c.id === comment.id ? { ...c, ...res.comment } : c))
      );
      addToast(t.commentUpdated, 'success');
      return true;
    } catch (err: unknown) {
      addToast(
        isCommentForbidden(err)
          ? t.commentEditForbidden
          : (err as Error)?.message || t.errorGeneric,
        'error'
      );
      return false;
    }
  }

  async function handleDeleteComment(comment: TaskComment) {
    const ok = await confirm({
      title: t.confirmDeleteComment,
      variant: 'danger',
    });
    if (!ok) return;
    const snapshot = taskComments;
    setTaskComments((prev) => prev.filter((c) => c.id !== comment.id));
    try {
      await commentMutation.mutateJson(taskBoardUrls.comment(comment.id), {
        method: 'DELETE',
      });
      addToast(t.commentDeleted, 'success');
      if (activeBoardId) void fetchDetail(activeBoardId);
    } catch (err: unknown) {
      setTaskComments(snapshot); // rollback
      addToast(
        isCommentForbidden(err)
          ? t.commentDeleteForbidden
          : (err as Error)?.message || t.errorGeneric,
        'error'
      );
    }
  }

  async function handleSaveCard() {
    if (!cardTitle.trim()) {
      addToast(t.cardTitleRequired, 'error');
      return;
    }
    if (!activeBoardId) return;
    setCardSaving(true);
    const labels = cardLabelNames;
    const dueDate = cardDue.trim() ? cardDue.trim() : null;
    try {
      if (editingCard) {
        await cardMutation.mutateJson(taskBoardUrls.task(editingCard.id), {
          method: 'PATCH',
          body: JSON.stringify({
            title: cardTitle.trim(),
            description: cardDesc.trim() || null,
            priority: cardPriority,
            dueDate,
            labels,
          }),
        });
        // Assignation : endpoint séparé (idempotent), seulement si changé.
        const prev = editingCard.assignee?.staffId ?? '';
        if (prev !== cardAssignee) {
          await cardMutation.mutateJson(
            taskBoardUrls.taskAssign(editingCard.id),
            {
              method: 'PATCH',
              body: JSON.stringify({
                assigneeStaffId: cardAssignee || null,
              }),
            }
          );
        }
        // Colonne : déplacement (fin de la colonne choisie), seulement si
        // changée. Une colonne pleine (409 wip_exceeded) n'annule pas le
        // reste, déjà enregistré : on le dit et la carte reste où elle est.
        const fromColumnId = openedSnapshot.current?.columnId ?? null;
        let moveBlocked = false;
        if (cardColumnId && fromColumnId && cardColumnId !== fromColumnId) {
          try {
            await moveMutation.mutateJson(
              taskBoardUrls.taskMove(editingCard.id),
              {
                method: 'PATCH',
                body: JSON.stringify({ columnId: cardColumnId }),
              }
            );
          } catch (err: unknown) {
            const anyErr = err as {
              payload?: { code?: string; limit?: number; current?: number };
            };
            if (anyErr?.payload?.code !== 'wip_exceeded') throw err;
            moveBlocked = true;
            addToast(
              format(t.wipExceededToast, {
                current: anyErr.payload.current ?? 0,
                limit: anyErr.payload.limit ?? 0,
              }),
              'error'
            );
          }
        }
        if (!moveBlocked) addToast(t.cardUpdated, 'success');
      } else if (cardColumnId) {
        await cardMutation.mutateJson(taskBoardUrls.tasks, {
          method: 'POST',
          body: JSON.stringify({
            boardId: activeBoardId,
            columnId: cardColumnId,
            title: cardTitle.trim(),
            description: cardDesc.trim() || undefined,
            priority: cardPriority,
            assigneeStaffId: cardAssignee || undefined,
            dueDate: dueDate ?? undefined,
            labels,
          }),
        });
        addToast(t.cardCreated, 'success');
      }
      setCardModalOpen(false);
      await fetchDetail(activeBoardId);
      await fetchBoards({ keepActive: true });
    } catch (err: unknown) {
      addToast((err as Error)?.message || t.errorGeneric, 'error');
    } finally {
      setCardSaving(false);
    }
  }

  async function handleDeleteCard() {
    if (!editingCard || !activeBoardId) return;
    const ok = await confirm({
      title: t.confirmDeleteCard,
      subtitle: t.confirmDeleteCardSubtitle,
      variant: 'danger',
    });
    if (!ok) return;
    setCardDeleting(true);
    try {
      await cardMutation.mutateJson(taskBoardUrls.task(editingCard.id), {
        method: 'DELETE',
      });
      addToast(t.cardDeleted, 'success');
      setCardModalOpen(false);
      await fetchDetail(activeBoardId);
      await fetchBoards({ keepActive: true });
    } catch (err: unknown) {
      addToast((err as Error)?.message || t.errorGeneric, 'error');
    } finally {
      setCardDeleting(false);
    }
  }

  return {
    openAddCard,
    openEditCard,
    requestCloseCard,
    handleQuickAddCard,
    handleAddChecklistItem,
    handleToggleChecklistItem,
    handleDeleteChecklistItem,
    handleAddComment,
    handleEditComment,
    handleDeleteComment,
    handleSaveCard,
    handleDeleteCard,
  };
}
