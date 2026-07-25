// pages/admin/tasks/index.tsx
//
// Kanban interne staff-only (task_boards / task_columns / tasks).
// Consomme l'API admin /api/admin/tasks/* (déjà livrée). Aucune écriture DB
// directe : lectures via useAdminFetch, écritures via useIdempotentMutation.
//
// Vue : sélecteur de board (onglets) + actions board (renommer/archiver/
// supprimer) + colonnes en flex horizontal scrollable, cartes drag & drop
// natif (HTML5) avec update optimiste et rollback en cas d'erreur.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { withStaffPage } from '@/utils/staff';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { useActiveTenant } from '@/hooks/useActiveTenant';
import { useToast } from '@/components/Toast';
import Modal from '@/components/admin/Modal';
import Breadcrumb from '@/components/admin/Breadcrumb';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import { formatDateHeader, formatTime } from '@/utils/dateFormatters';

type Dict = ReturnType<typeof useAdminT<'adminTaskBoard'>>;

type StaffShape = { id: string; role: string; display_name: string | null };
type StaffProps = { staff: StaffShape };

type Priority = 'low' | 'medium' | 'high' | 'urgent';
const PRIORITIES: Priority[] = ['low', 'medium', 'high', 'urgent'];

type BoardListColumn = {
  id: string;
  name: string;
  position: number;
  wipLimit: number | null;
  isDone: boolean;
  cardCount: number;
};
type BoardListItem = {
  id: string;
  name: string;
  description: string | null;
  position: number;
  isArchived: boolean;
  columns: BoardListColumn[];
};
type CardAssignee = { staffId: string; name: string | null };
type BoardTask = {
  id: string;
  title: string;
  description: string | null;
  priority: Priority;
  position: number;
  dueDate: string | null;
  labels: string[];
  assignee: CardAssignee | null;
  checklist: { done: number; total: number };
  commentCount: number;
};
type BoardDetailColumn = {
  id: string;
  name: string;
  position: number;
  wipLimit: number | null;
  isDone: boolean;
  tasks: BoardTask[];
};
type BoardDetail = {
  id: string;
  name: string;
  description: string | null;
  position: number;
  isArchived: boolean;
  columns: BoardDetailColumn[];
};

type StaffOption = { id: string; name: string };

type TaskComment = {
  id: string;
  body: string;
  authorStaffId: string | null;
  authorName: string | null;
  createdAt: string;
};
type ChecklistItem = {
  id: string;
  label: string;
  isDone: boolean;
  position: number;
};

// Valeur sentinelle du filtre assigné : cartes sans assigné (distincte de
// "tous" = chaîne vide).
const FILTER_UNASSIGNED = '__unassigned__';

// ---------------------------------------------------------------------------
// Helpers présentation
// ---------------------------------------------------------------------------

function priorityLabel(t: Dict, p: Priority): string {
  switch (p) {
    case 'low':
      return t.priorityLow;
    case 'medium':
      return t.priorityMedium;
    case 'high':
      return t.priorityHigh;
    case 'urgent':
      return t.priorityUrgent;
  }
}

function priorityClasses(p: Priority): string {
  switch (p) {
    case 'low':
      return 'border-neutral-500/40 bg-neutral-500/10 text-neutral-300';
    case 'medium':
      return 'border-blue-500/40 bg-blue-500/10 text-blue-300';
    case 'high':
      return 'border-amber-500/40 bg-amber-500/10 text-amber-300';
    case 'urgent':
      return 'border-red-500/40 bg-red-500/10 text-red-300';
  }
}

function initials(name: string | null): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function isOverdue(dueDate: string | null, columnIsDone: boolean): boolean {
  if (!dueDate || columnIsDone) return false;
  const d = new Date(dueDate);
  if (Number.isNaN(d.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return d.getTime() < today.getTime();
}

function formatCommentDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${formatDateHeader(iso)} · ${formatTime(iso)}`;
}

function parseLabels(raw: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const part of raw.split(',')) {
    const v = part.trim();
    if (v && !seen.has(v)) {
      seen.add(v);
      out.push(v);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export const getServerSideProps = withStaffPage('admin');

function AdminTasksPage({ staff: currentStaff }: StaffProps) {
  const t = useAdminT('adminTaskBoard');
  const { adminFetchJson } = useAdminFetch();
  const { confirm, dialog } = useConfirmDialog();
  const { addToast } = useToast();
  const { tenant } = useActiveTenant();

  // Une intention d'écriture par famille (clés d'idempotence indépendantes).
  const boardMutation = useIdempotentMutation();
  const columnMutation = useIdempotentMutation();
  const cardMutation = useIdempotentMutation();
  const moveMutation = useIdempotentMutation();
  const checklistMutation = useIdempotentMutation();
  const commentMutation = useIdempotentMutation();

  const router = useRouter();
  // `?board=<id>` deep-links / survives a reload. Captured once (SSR provides
  // the query on first render) so it seeds the initial board selection without
  // re-triggering the board fetch on every subsequent board switch.
  const initialUrlBoardRef = useRef<string | null>(
    typeof router.query.board === 'string' ? router.query.board : null
  );
  const [boards, setBoards] = useState<BoardListItem[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [activeBoardId, setActiveBoardId] = useState<string | null>(null);
  const [detail, setDetail] = useState<BoardDetail | null>(null);
  const [loadingBoards, setLoadingBoards] = useState(true);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const [staff, setStaff] = useState<StaffOption[]>([]);

  // Board modale (création / renommage)
  const [boardModalOpen, setBoardModalOpen] = useState(false);
  const [boardModalMode, setBoardModalMode] = useState<'create' | 'rename'>(
    'create'
  );
  const [boardFormName, setBoardFormName] = useState('');
  const [boardFormDesc, setBoardFormDesc] = useState('');
  const [boardSaving, setBoardSaving] = useState(false);

  // Colonne modale
  const [columnModalOpen, setColumnModalOpen] = useState(false);
  const [editingColumnId, setEditingColumnId] = useState<string | null>(null);
  const [colFormName, setColFormName] = useState('');
  const [colFormWip, setColFormWip] = useState('');
  const [colFormDone, setColFormDone] = useState(false);
  const [colSaving, setColSaving] = useState(false);

  // Carte modale
  const [cardModalOpen, setCardModalOpen] = useState(false);
  const [editingCard, setEditingCard] = useState<BoardTask | null>(null);
  const [cardColumnId, setCardColumnId] = useState<string | null>(null);
  const [cardTitle, setCardTitle] = useState('');
  const [cardDesc, setCardDesc] = useState('');
  const [cardPriority, setCardPriority] = useState<Priority>('medium');
  const [cardDue, setCardDue] = useState('');
  const [cardAssignee, setCardAssignee] = useState<string>('');
  const [cardLabels, setCardLabels] = useState('');
  const [cardSaving, setCardSaving] = useState(false);
  const [cardDeleting, setCardDeleting] = useState(false);

  // Détail de la carte en édition (checklist + commentaires), chargé à
  // l'ouverture via GET /tasks/{id}. Sections masquées en création.
  const [cardDetailLoading, setCardDetailLoading] = useState(false);
  const [taskChecklist, setTaskChecklist] = useState<ChecklistItem[]>([]);
  const [taskComments, setTaskComments] = useState<TaskComment[]>([]);
  const [checklistInput, setChecklistInput] = useState('');
  const [checklistAdding, setChecklistAdding] = useState(false);
  const [commentInput, setCommentInput] = useState('');
  const [commentPosting, setCommentPosting] = useState(false);

  // Recherche & filtres (client-side sur le détail déjà chargé).
  const [filterSearch, setFilterSearch] = useState('');
  const [filterAssignee, setFilterAssignee] = useState('');
  const [filterPriority, setFilterPriority] = useState('');
  const [filterLabel, setFilterLabel] = useState('');
  const [filterMine, setFilterMine] = useState(false);

  // DnD
  const dragTaskId = useRef<string | null>(null);

  // -------------------------------------------------------------------------
  // Chargements
  // -------------------------------------------------------------------------

  const fetchBoards = useCallback(
    async (opts?: { keepActive?: boolean }) => {
      setLoadingBoards(true);
      setErrorMsg(null);
      try {
        const json = await adminFetchJson<{ boards: BoardListItem[] }>(
          '/api/admin/tasks/boards?includeArchived=1'
        );
        const list = json.boards || [];
        setBoards(list);
        setActiveBoardId((prev) => {
          if (opts?.keepActive && prev && list.some((b) => b.id === prev)) {
            return prev;
          }
          const visible = list.filter((b) => showArchived || !b.isArchived);
          if (prev && visible.some((b) => b.id === prev)) return prev;
          // Prefer the board deep-linked in the URL (?board=) on first load.
          const urlBoard = initialUrlBoardRef.current;
          if (urlBoard && visible.some((b) => b.id === urlBoard)) return urlBoard;
          return visible[0]?.id ?? null;
        });
      } catch (err: unknown) {
        setErrorMsg((err as Error)?.message || t.errorLoad);
      } finally {
        setLoadingBoards(false);
      }
    },
    [adminFetchJson, showArchived, t]
  );

  const fetchDetail = useCallback(
    async (boardId: string) => {
      setLoadingDetail(true);
      try {
        const json = await adminFetchJson<{ board: BoardDetail }>(
          `/api/admin/tasks/boards/${encodeURIComponent(boardId)}`
        );
        setDetail(json.board);
      } catch (err: unknown) {
        addToast((err as Error)?.message || t.errorLoad, 'error');
      } finally {
        setLoadingDetail(false);
      }
    },
    [adminFetchJson, addToast, t]
  );

  useEffect(() => {
    fetchBoards();
  }, [fetchBoards]);

  useEffect(() => {
    if (activeBoardId) {
      fetchDetail(activeBoardId);
    } else {
      setDetail(null);
    }
  }, [activeBoardId, fetchDetail]);

  // Reflect the active board in the URL (?board=) — shallow, no reload — so a
  // refresh or shared link reopens the same board. Deps intentionally limited
  // to activeBoardId to avoid re-fetching the board list on URL changes.
  useEffect(() => {
    if (!activeBoardId || router.query.board === activeBoardId) return;
    router.replace(
      { pathname: router.pathname, query: { ...router.query, board: activeBoardId } },
      undefined,
      { shallow: true }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBoardId]);

  // Liste du staff (assignation) — via le tenant actif.
  useEffect(() => {
    if (!tenant?.id) return;
    let cancelled = false;
    (async () => {
      try {
        const json = await adminFetchJson<{
          staff: Array<{
            staff_id: string;
            display_name: string | null;
            email: string | null;
          }>;
        }>(`/api/admin/tenants/${encodeURIComponent(tenant.id)}/staff`);
        if (cancelled) return;
        const opts = (json.staff || [])
          .map((s) => ({
            id: s.staff_id,
            name: s.display_name || s.email || s.staff_id,
          }))
          .sort((a, b) => a.name.localeCompare(b.name));
        setStaff(opts);
      } catch (err: unknown) {
        if (!cancelled) addToast(t.staffLoadError, 'error');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tenant?.id, adminFetchJson, addToast, t]);

  const visibleBoards = useMemo(
    () => boards.filter((b) => showArchived || !b.isArchived),
    [boards, showArchived]
  );
  const activeBoard = boards.find((b) => b.id === activeBoardId) ?? null;

  const staffNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of staff) m.set(s.id, s.name);
    return m;
  }, [staff]);

  // Union des labels présents sur le board (pour le select de filtre).
  const availableLabels = useMemo(() => {
    if (!detail) return [];
    const set = new Set<string>();
    for (const col of detail.columns) {
      for (const task of col.tasks) {
        for (const lbl of task.labels) set.add(lbl);
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [detail]);

  const hasActiveFilters =
    filterSearch.trim() !== '' ||
    filterAssignee !== '' ||
    filterPriority !== '' ||
    filterLabel !== '' ||
    filterMine;

  const clearFilters = useCallback(() => {
    setFilterSearch('');
    setFilterAssignee('');
    setFilterPriority('');
    setFilterLabel('');
    setFilterMine(false);
  }, []);

  // Prédicat de correspondance d'une carte aux filtres actifs.
  const taskMatchesFilters = useCallback(
    (task: BoardTask): boolean => {
      const q = filterSearch.trim().toLowerCase();
      if (q) {
        const hay = `${task.title} ${task.description ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (filterMine) {
        if (task.assignee?.staffId !== currentStaff.id) return false;
      } else if (filterAssignee) {
        if (filterAssignee === FILTER_UNASSIGNED) {
          if (task.assignee) return false;
        } else if (task.assignee?.staffId !== filterAssignee) {
          return false;
        }
      }
      if (filterPriority && task.priority !== filterPriority) return false;
      if (filterLabel && !task.labels.includes(filterLabel)) return false;
      return true;
    },
    [
      filterSearch,
      filterMine,
      filterAssignee,
      filterPriority,
      filterLabel,
      currentStaff.id,
    ]
  );

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
          '/api/admin/tasks/boards',
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
        await boardMutation.mutateJson(
          `/api/admin/tasks/boards/${encodeURIComponent(activeBoardId)}`,
          {
            method: 'PATCH',
            body: JSON.stringify({
              name: boardFormName.trim(),
              description: boardFormDesc.trim() || null,
            }),
          }
        );
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
      await boardMutation.mutateJson(
        `/api/admin/tasks/boards/${encodeURIComponent(activeBoard.id)}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ is_archived: next }),
        }
      );
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
      await boardMutation.mutateJson(
        `/api/admin/tasks/boards/${encodeURIComponent(activeBoard.id)}`,
        { method: 'DELETE' }
      );
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
        await columnMutation.mutateJson(
          `/api/admin/tasks/columns/${encodeURIComponent(editingColumnId)}`,
          {
            method: 'PATCH',
            body: JSON.stringify({
              name: colFormName.trim(),
              wipLimit,
              isDone: colFormDone,
            }),
          }
        );
        addToast(t.columnUpdated, 'success');
      } else {
        await columnMutation.mutateJson('/api/admin/tasks/columns', {
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

  async function handleDeleteColumn(col: BoardDetailColumn) {
    const ok = await confirm({
      title: t.confirmDeleteColumn,
      subtitle: t.confirmDeleteColumnSubtitle,
      variant: 'danger',
    });
    if (!ok || !activeBoardId) return;
    try {
      await columnMutation.mutateJson(
        `/api/admin/tasks/columns/${encodeURIComponent(col.id)}`,
        { method: 'DELETE' }
      );
      addToast(t.columnDeleted, 'success');
      await fetchDetail(activeBoardId);
      await fetchBoards({ keepActive: true });
    } catch (err: unknown) {
      const anyErr = err as { payload?: { code?: string }; message?: string };
      if (anyErr?.payload?.code === 'column_not_empty') {
        addToast(t.columnNotEmpty, 'error');
      } else {
        addToast(anyErr?.message || t.errorGeneric, 'error');
      }
    }
  }

  async function handleReorderColumn(index: number, dir: -1 | 1) {
    if (!detail || !activeBoardId) return;
    const cols = [...detail.columns].sort((a, b) => a.position - b.position);
    const target = index + dir;
    if (target < 0 || target >= cols.length) return;
    const a = cols[index];
    const b = cols[target];
    try {
      await Promise.all([
        columnMutation.mutateJson(
          `/api/admin/tasks/columns/${encodeURIComponent(a.id)}`,
          { method: 'PATCH', body: JSON.stringify({ position: b.position }) }
        ),
        columnMutation.mutateJson(
          `/api/admin/tasks/columns/${encodeURIComponent(b.id)}`,
          { method: 'PATCH', body: JSON.stringify({ position: a.position }) }
        ),
      ]);
      addToast(t.columnReordered, 'success');
      await fetchDetail(activeBoardId);
    } catch (err: unknown) {
      addToast((err as Error)?.message || t.errorGeneric, 'error');
    }
  }

  // -------------------------------------------------------------------------
  // Cartes
  // -------------------------------------------------------------------------

  function resetCardDetailSections() {
    setTaskChecklist([]);
    setTaskComments([]);
    setChecklistInput('');
    setCommentInput('');
    setCardDetailLoading(false);
  }

  // Charge checklist + commentaires d'une carte existante (édition).
  const loadCardDetail = useCallback(
    async (taskId: string) => {
      setCardDetailLoading(true);
      try {
        const json = await adminFetchJson<{
          task: { checklist: ChecklistItem[]; comments: TaskComment[] };
        }>(`/api/admin/tasks/tasks/${encodeURIComponent(taskId)}`);
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
    [adminFetchJson, addToast, t]
  );

  function openAddCard(columnId: string) {
    setEditingCard(null);
    setCardColumnId(columnId);
    setCardTitle('');
    setCardDesc('');
    setCardPriority('medium');
    setCardDue('');
    setCardAssignee('');
    setCardLabels('');
    resetCardDetailSections();
    setCardModalOpen(true);
  }

  function openEditCard(card: BoardTask) {
    setEditingCard(card);
    setCardColumnId(null);
    setCardTitle(card.title);
    setCardDesc(card.description ?? '');
    setCardPriority(card.priority);
    setCardDue(card.dueDate ? card.dueDate.slice(0, 10) : '');
    setCardAssignee(card.assignee?.staffId ?? '');
    setCardLabels((card.labels ?? []).join(', '));
    resetCardDetailSections();
    setCardModalOpen(true);
    void loadCardDetail(card.id);
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
        `/api/admin/tasks/tasks/${encodeURIComponent(editingCard.id)}/checklist`,
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
      await checklistMutation.mutateJson(
        `/api/admin/tasks/checklist/${encodeURIComponent(item.id)}`,
        { method: 'PATCH', body: JSON.stringify({ isDone: nextDone }) }
      );
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
      await checklistMutation.mutateJson(
        `/api/admin/tasks/checklist/${encodeURIComponent(item.id)}`,
        { method: 'DELETE' }
      );
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
        `/api/admin/tasks/tasks/${encodeURIComponent(editingCard.id)}/comments`,
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

  async function handleDeleteComment(comment: TaskComment) {
    const ok = await confirm({
      title: t.confirmDeleteComment,
      variant: 'danger',
    });
    if (!ok) return;
    const snapshot = taskComments;
    setTaskComments((prev) => prev.filter((c) => c.id !== comment.id));
    try {
      await commentMutation.mutateJson(
        `/api/admin/tasks/comments/${encodeURIComponent(comment.id)}`,
        { method: 'DELETE' }
      );
      addToast(t.commentDeleted, 'success');
      if (activeBoardId) void fetchDetail(activeBoardId);
    } catch (err: unknown) {
      setTaskComments(snapshot); // rollback
      addToast((err as Error)?.message || t.errorGeneric, 'error');
    }
  }

  async function handleSaveCard() {
    if (!cardTitle.trim()) {
      addToast(t.cardTitleRequired, 'error');
      return;
    }
    if (!activeBoardId) return;
    setCardSaving(true);
    const labels = parseLabels(cardLabels);
    const dueDate = cardDue.trim() ? cardDue.trim() : null;
    try {
      if (editingCard) {
        await cardMutation.mutateJson(
          `/api/admin/tasks/tasks/${encodeURIComponent(editingCard.id)}`,
          {
            method: 'PATCH',
            body: JSON.stringify({
              title: cardTitle.trim(),
              description: cardDesc.trim() || null,
              priority: cardPriority,
              dueDate,
              labels,
            }),
          }
        );
        // Assignation : endpoint séparé (idempotent), seulement si changé.
        const prev = editingCard.assignee?.staffId ?? '';
        if (prev !== cardAssignee) {
          await cardMutation.mutateJson(
            `/api/admin/tasks/tasks/${encodeURIComponent(editingCard.id)}/assign`,
            {
              method: 'PATCH',
              body: JSON.stringify({
                assigneeStaffId: cardAssignee || null,
              }),
            }
          );
        }
        addToast(t.cardUpdated, 'success');
      } else if (cardColumnId) {
        await cardMutation.mutateJson('/api/admin/tasks/tasks', {
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
      await cardMutation.mutateJson(
        `/api/admin/tasks/tasks/${encodeURIComponent(editingCard.id)}`,
        { method: 'DELETE' }
      );
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
        await moveMutation.mutateJson(
          `/api/admin/tasks/tasks/${encodeURIComponent(taskId)}/move`,
          {
            method: 'PATCH',
            body: JSON.stringify({
              columnId: toColumnId,
              ...(position != null ? { position } : {}),
            }),
          }
        );
        addToast(t.cardMoved, 'success');
        // Rafraîchit les compteurs de colonnes (badge WIP).
        await fetchBoards({ keepActive: true });
      } catch (err: unknown) {
        setDetail(snapshot); // rollback
        addToast((err as Error)?.message || t.errorGeneric, 'error');
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
    performMove(toColumnId, null);
  }

  // -------------------------------------------------------------------------
  // Rendu
  // -------------------------------------------------------------------------

  const sortedColumns = detail
    ? [...detail.columns].sort((a, b) => a.position - b.position)
    : [];

  return (
    <>
      <Head>
        <title>{t.headTitle}</title>
      </Head>
      <div className="min-h-screen bg-neutral-950 text-white pt-24">
        <div className="max-w-[110rem] mx-auto px-6 py-8">
          <Breadcrumb
            items={[
              { label: t.eyebrow, href: '/admin' },
              { label: t.pageTitle },
            ]}
          />

          <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-indigo-200/80">
                {t.eyebrow}
              </p>
              <h1 className="text-2xl font-semibold">{t.pageTitle}</h1>
              <p className="text-sm text-neutral-400 mt-1">{t.subtitle}</p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => fetchBoards({ keepActive: true })}
                className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-sm hover:bg-white/10"
              >
                {t.refresh}
              </button>
              <button
                onClick={openCreateBoard}
                className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-medium text-sm transition-colors"
              >
                {t.newBoard}
              </button>
            </div>
          </div>

          {errorMsg && (
            <div className="mb-6 p-4 rounded-xl bg-red-900/60 border border-red-500/40 text-red-100">
              {errorMsg}
            </div>
          )}

          {/* Sélecteur de board */}
          {!loadingBoards && boards.length > 0 && (
            <div className="mb-5 flex flex-wrap items-center gap-2">
              <div
                role="tablist"
                aria-label={t.boardTabsLabel}
                className="flex flex-wrap gap-2"
              >
                {visibleBoards.map((b) => {
                  const selected = b.id === activeBoardId;
                  return (
                    <button
                      key={b.id}
                      role="tab"
                      aria-selected={selected}
                      onClick={() => setActiveBoardId(b.id)}
                      className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                        selected
                          ? 'bg-indigo-600 border-indigo-500 text-white'
                          : 'bg-white/5 border-white/10 text-neutral-200 hover:bg-white/10'
                      }`}
                    >
                      {b.name}
                      {b.isArchived && (
                        <span className="ml-2 text-[10px] uppercase tracking-wide text-amber-300">
                          {t.archivedBadge}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
              <label className="ml-auto inline-flex items-center gap-2 text-xs text-neutral-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={showArchived}
                  onChange={(e) => setShowArchived(e.target.checked)}
                  className="accent-indigo-500"
                />
                {t.showArchived}
              </label>
            </div>
          )}

          {/* Barre d'actions du board actif */}
          {activeBoard && (
            <div className="mb-5 flex flex-wrap items-center gap-2">
              <button
                onClick={openRenameBoard}
                className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-sm hover:bg-white/10"
              >
                {t.renameBoard}
              </button>
              <button
                onClick={handleToggleArchive}
                className="px-3 py-1.5 rounded-lg bg-white/5 border border-white/10 text-sm hover:bg-white/10"
              >
                {activeBoard.isArchived ? t.unarchiveBoard : t.archiveBoard}
              </button>
              <button
                onClick={handleDeleteBoard}
                className="px-3 py-1.5 rounded-lg bg-red-600/20 border border-red-500/30 text-red-200 text-sm hover:bg-red-600/40"
              >
                {t.deleteBoard}
              </button>
              <button
                onClick={openAddColumn}
                className="ml-auto px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium"
              >
                {t.addColumn}
              </button>
            </div>
          )}

          {/* Barre de recherche & filtres */}
          {detail && (
            <div className="mb-5 rounded-xl bg-white/5 border border-white/10 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <label className="sr-only" htmlFor="task-search">
                  {t.filterSearchLabel}
                </label>
                <input
                  id="task-search"
                  type="search"
                  value={filterSearch}
                  onChange={(e) => setFilterSearch(e.target.value)}
                  placeholder={t.filterSearchPlaceholder}
                  className="flex-1 min-w-[12rem] px-3 py-1.5 rounded-lg bg-white/10 border border-white/20 text-white text-sm placeholder:text-neutral-500"
                />
                <label className="sr-only" htmlFor="filter-assignee">
                  {t.assigneeLabel}
                </label>
                <select
                  id="filter-assignee"
                  value={filterMine ? '' : filterAssignee}
                  disabled={filterMine}
                  onChange={(e) => setFilterAssignee(e.target.value)}
                  className="px-3 py-1.5 rounded-lg bg-white/10 border border-white/20 text-white text-sm disabled:opacity-40"
                >
                  <option value="">{t.filterAllAssignees}</option>
                  <option value={FILTER_UNASSIGNED}>{t.unassigned}</option>
                  {staff.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                <label className="sr-only" htmlFor="filter-priority">
                  {t.priorityLabel}
                </label>
                <select
                  id="filter-priority"
                  value={filterPriority}
                  onChange={(e) => setFilterPriority(e.target.value)}
                  className="px-3 py-1.5 rounded-lg bg-white/10 border border-white/20 text-white text-sm"
                >
                  <option value="">{t.filterAllPriorities}</option>
                  {PRIORITIES.map((p) => (
                    <option key={p} value={p}>
                      {priorityLabel(t, p)}
                    </option>
                  ))}
                </select>
                <label className="sr-only" htmlFor="filter-label">
                  {t.filterLabelLabel}
                </label>
                <select
                  id="filter-label"
                  value={filterLabel}
                  onChange={(e) => setFilterLabel(e.target.value)}
                  disabled={availableLabels.length === 0}
                  className="px-3 py-1.5 rounded-lg bg-white/10 border border-white/20 text-white text-sm disabled:opacity-40"
                >
                  <option value="">{t.filterAllLabels}</option>
                  {availableLabels.map((lbl) => (
                    <option key={lbl} value={lbl}>
                      {lbl}
                    </option>
                  ))}
                </select>
                <label className="inline-flex items-center gap-2 text-sm text-neutral-300 cursor-pointer px-2">
                  <input
                    type="checkbox"
                    checked={filterMine}
                    onChange={(e) => setFilterMine(e.target.checked)}
                    className="accent-indigo-500"
                  />
                  {t.filterMyCards}
                </label>
              </div>

              {/* Chips de filtres actifs */}
              {hasActiveFilters && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="text-xs text-neutral-500">
                    {t.filterActiveLabel}
                  </span>
                  {filterSearch.trim() && (
                    <button
                      type="button"
                      onClick={() => setFilterSearch('')}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] bg-indigo-500/15 border border-indigo-500/30 text-indigo-200 hover:bg-indigo-500/25"
                    >
                      {format(t.filterChipSearch, { value: filterSearch.trim() })}
                      <span aria-hidden="true">✕</span>
                    </button>
                  )}
                  {filterMine && (
                    <button
                      type="button"
                      onClick={() => setFilterMine(false)}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] bg-indigo-500/15 border border-indigo-500/30 text-indigo-200 hover:bg-indigo-500/25"
                    >
                      {t.filterMyCards}
                      <span aria-hidden="true">✕</span>
                    </button>
                  )}
                  {!filterMine && filterAssignee && (
                    <button
                      type="button"
                      onClick={() => setFilterAssignee('')}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] bg-indigo-500/15 border border-indigo-500/30 text-indigo-200 hover:bg-indigo-500/25"
                    >
                      {format(t.filterChipAssignee, {
                        value:
                          filterAssignee === FILTER_UNASSIGNED
                            ? t.unassigned
                            : (staffNameById.get(filterAssignee) ??
                              filterAssignee),
                      })}
                      <span aria-hidden="true">✕</span>
                    </button>
                  )}
                  {filterPriority && (
                    <button
                      type="button"
                      onClick={() => setFilterPriority('')}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] bg-indigo-500/15 border border-indigo-500/30 text-indigo-200 hover:bg-indigo-500/25"
                    >
                      {format(t.filterChipPriority, {
                        value: priorityLabel(t, filterPriority as Priority),
                      })}
                      <span aria-hidden="true">✕</span>
                    </button>
                  )}
                  {filterLabel && (
                    <button
                      type="button"
                      onClick={() => setFilterLabel('')}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] bg-indigo-500/15 border border-indigo-500/30 text-indigo-200 hover:bg-indigo-500/25"
                    >
                      {format(t.filterChipLabel, { value: filterLabel })}
                      <span aria-hidden="true">✕</span>
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="ml-1 px-2 py-0.5 rounded-full text-[11px] bg-white/5 border border-white/10 text-neutral-300 hover:bg-white/10"
                  >
                    {t.filterClear}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* États de chargement / vide */}
          {loadingBoards && (
            <div className="p-4 rounded-xl bg-white/5 border border-white/10">
              {t.loading}
            </div>
          )}

          {!loadingBoards && boards.length === 0 && (
            <div className="p-8 rounded-xl bg-white/5 border border-white/10 text-center">
              <p className="text-sm text-neutral-200">{t.noBoards}</p>
              <p className="text-xs text-neutral-400 mt-1">{t.noBoardsHint}</p>
            </div>
          )}

          {!loadingBoards && boards.length > 0 && !activeBoardId && (
            <div className="p-8 rounded-xl bg-white/5 border border-white/10 text-center">
              <p className="text-sm text-neutral-200">{t.noBoards}</p>
            </div>
          )}

          {/* Kanban */}
          {activeBoardId && (
            <div className="relative">
              {loadingDetail && (
                <div className="mb-4 p-3 rounded-lg bg-white/5 border border-white/10 text-sm text-neutral-300">
                  {t.loading}
                </div>
              )}
              {detail && (
                <div className="flex gap-4 overflow-x-auto pb-4">
                  {sortedColumns.map((col, index) => {
                    const totalCount = col.tasks.length;
                    // WIP se calcule sur le total réel, pas sur le filtré.
                    const over =
                      col.wipLimit != null && totalCount > col.wipLimit;
                    const allTasks = [...col.tasks].sort(
                      (a, b) => a.position - b.position
                    );
                    const tasks = hasActiveFilters
                      ? allTasks.filter(taskMatchesFilters)
                      : allTasks;
                    const count = tasks.length;
                    return (
                      <div
                        key={col.id}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={(e) => onDropOnColumn(e, col.id)}
                        className="flex-shrink-0 w-72 rounded-xl bg-white/5 border border-white/10 flex flex-col max-h-[70vh]"
                      >
                        {/* Header colonne */}
                        <div className="p-3 border-b border-white/10">
                          <div className="flex items-center gap-2">
                            <h2 className="text-sm font-semibold truncate flex-1">
                              {col.name}
                            </h2>
                            <span className="text-xs text-neutral-400">
                              {hasActiveFilters && count !== totalCount
                                ? `${count}/${totalCount}`
                                : count}
                            </span>
                            {col.isDone && (
                              <span
                                className="w-2 h-2 rounded-full bg-emerald-400"
                                title={t.isDoneLabel}
                                aria-hidden="true"
                              />
                            )}
                          </div>
                          {over && (
                            <span className="mt-1 inline-block px-2 py-0.5 rounded-full text-[10px] border border-red-500/40 bg-red-500/10 text-red-300">
                              {format(t.wipBadge, {
                                count: totalCount,
                                limit: col.wipLimit ?? 0,
                              })}
                            </span>
                          )}
                          <div className="mt-2 flex items-center gap-1">
                            <button
                              onClick={() => handleReorderColumn(index, -1)}
                              disabled={index === 0}
                              title={t.moveLeft}
                              aria-label={t.moveLeft}
                              className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-xs disabled:opacity-30 hover:bg-white/10"
                            >
                              ◀
                            </button>
                            <button
                              onClick={() => handleReorderColumn(index, 1)}
                              disabled={index === sortedColumns.length - 1}
                              title={t.moveRight}
                              aria-label={t.moveRight}
                              className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-xs disabled:opacity-30 hover:bg-white/10"
                            >
                              ▶
                            </button>
                            <button
                              onClick={() => openEditColumn(col)}
                              title={t.editColumn}
                              aria-label={t.editColumn}
                              className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-xs hover:bg-white/10"
                            >
                              ✎
                            </button>
                            <button
                              onClick={() => handleDeleteColumn(col)}
                              title={t.deleteColumn}
                              aria-label={t.deleteColumn}
                              className="px-1.5 py-0.5 rounded bg-red-600/20 border border-red-500/30 text-red-200 text-xs hover:bg-red-600/40"
                            >
                              ✕
                            </button>
                          </div>
                        </div>

                        {/* Cartes */}
                        <div className="p-2 space-y-2 overflow-y-auto flex-1">
                          {tasks.length === 0 && (
                            <p className="px-2 py-6 text-center text-xs text-neutral-500">
                              {hasActiveFilters && totalCount > 0
                                ? t.noMatchingCards
                                : t.emptyColumn}
                            </p>
                          )}
                          {tasks.map((card) => {
                            const overdue = isOverdue(card.dueDate, col.isDone);
                            return (
                              <div
                                key={card.id}
                                draggable
                                onDragStart={(e) => onCardDragStart(e, card.id)}
                                onDragEnd={onCardDragEnd}
                                onDragOver={(e) => e.preventDefault()}
                                onDrop={(e) => onDropOnCard(e, col.id, card.id)}
                                onClick={() => openEditCard(card)}
                                role="button"
                                tabIndex={0}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter' || e.key === ' ') {
                                    e.preventDefault();
                                    openEditCard(card);
                                  }
                                }}
                                className="cursor-grab active:cursor-grabbing rounded-lg bg-neutral-900/80 border border-white/10 p-3 hover:border-indigo-500/40 transition-colors"
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <p className="text-sm font-medium leading-snug flex-1">
                                    {card.title}
                                  </p>
                                  <span
                                    className={`flex-shrink-0 px-1.5 py-0.5 rounded text-[10px] border ${priorityClasses(
                                      card.priority
                                    )}`}
                                  >
                                    {priorityLabel(t, card.priority)}
                                  </span>
                                </div>

                                {card.labels.length > 0 && (
                                  <div className="mt-2 flex flex-wrap gap-1">
                                    {card.labels.map((lbl) => (
                                      <span
                                        key={lbl}
                                        className="px-1.5 py-0.5 rounded text-[10px] bg-white/5 border border-white/10 text-neutral-300"
                                      >
                                        {lbl}
                                      </span>
                                    ))}
                                  </div>
                                )}

                                {(card.checklist.total > 0 ||
                                  card.commentCount > 0) && (
                                  <div className="mt-2 flex flex-wrap items-center gap-2">
                                    {card.checklist.total > 0 && (
                                      <span
                                        title={format(t.checklistBadgeTitle, {
                                          done: card.checklist.done,
                                          total: card.checklist.total,
                                        })}
                                        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] border ${
                                          card.checklist.done ===
                                          card.checklist.total
                                            ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                                            : 'border-white/10 bg-white/5 text-neutral-300'
                                        }`}
                                      >
                                        <span aria-hidden="true">✓</span>
                                        {card.checklist.done}/
                                        {card.checklist.total}
                                        <span className="relative inline-block h-1 w-8 rounded-full bg-white/10 overflow-hidden align-middle">
                                          <span
                                            className="absolute inset-y-0 left-0 rounded-full bg-emerald-400"
                                            style={{
                                              width: `${Math.round(
                                                (card.checklist.done /
                                                  card.checklist.total) *
                                                  100
                                              )}%`,
                                            }}
                                          />
                                        </span>
                                      </span>
                                    )}
                                    {card.commentCount > 0 && (
                                      <span
                                        title={format(t.commentsBadgeTitle, {
                                          count: card.commentCount,
                                        })}
                                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] border border-white/10 bg-white/5 text-neutral-300"
                                      >
                                        <span aria-hidden="true">💬</span>
                                        {card.commentCount}
                                      </span>
                                    )}
                                  </div>
                                )}

                                <div className="mt-2 flex items-center justify-between gap-2">
                                  {card.dueDate ? (
                                    <span
                                      className={`text-[11px] ${
                                        overdue
                                          ? 'text-red-400 font-medium'
                                          : 'text-neutral-400'
                                      }`}
                                      title={overdue ? t.overdue : undefined}
                                    >
                                      {card.dueDate.slice(0, 10)}
                                    </span>
                                  ) : (
                                    <span />
                                  )}
                                  {card.assignee && (
                                    <span
                                      title={
                                        card.assignee.name ??
                                        staffNameById.get(
                                          card.assignee.staffId
                                        ) ??
                                        undefined
                                      }
                                      className="flex-shrink-0 w-6 h-6 rounded-full bg-indigo-600/30 border border-indigo-500/40 text-indigo-100 text-[10px] font-semibold flex items-center justify-center"
                                    >
                                      {initials(
                                        card.assignee.name ??
                                          staffNameById.get(
                                            card.assignee.staffId
                                          ) ??
                                          null
                                      )}
                                    </span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {/* Ajouter une carte */}
                        <div className="p-2 border-t border-white/10">
                          <button
                            onClick={() => openAddCard(col.id)}
                            className="w-full px-2 py-1.5 rounded-lg bg-white/5 border border-white/10 text-xs text-neutral-300 hover:bg-white/10"
                          >
                            + {t.addCard}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ------------------------------------------------------------- */}
          {/* Modale board (create / rename) */}
          {/* ------------------------------------------------------------- */}
          <Modal
            open={boardModalOpen}
            onClose={() => setBoardModalOpen(false)}
            title={
              <h2 className="text-xl font-semibold">
                {boardModalMode === 'create'
                  ? t.createBoardTitle
                  : t.renameBoardTitle}
              </h2>
            }
            size="lg"
            panelChromeClassName="bg-neutral-900 rounded-xl border border-white/10"
            footer={
              <>
                <button
                  onClick={() => setBoardModalOpen(false)}
                  className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/15 text-white text-sm"
                >
                  {t.cancel}
                </button>
                <button
                  onClick={handleSaveBoard}
                  disabled={boardSaving}
                  className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:bg-neutral-600 text-white font-medium text-sm"
                >
                  {boardSaving
                    ? boardModalMode === 'create'
                      ? t.creating
                      : t.saving
                    : boardModalMode === 'create'
                      ? t.create
                      : t.save}
                </button>
              </>
            }
          >
            <div className="space-y-4">
              <div>
                <label
                  htmlFor="board-name"
                  className="block text-sm text-neutral-300 mb-2"
                >
                  {t.boardNameLabel}
                </label>
                <input
                  id="board-name"
                  type="text"
                  value={boardFormName}
                  onChange={(e) => setBoardFormName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white"
                  placeholder={t.boardNamePlaceholder}
                />
              </div>
              <div>
                <label
                  htmlFor="board-desc"
                  className="block text-sm text-neutral-300 mb-2"
                >
                  {t.boardDescLabel}
                </label>
                <textarea
                  id="board-desc"
                  value={boardFormDesc}
                  onChange={(e) => setBoardFormDesc(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white"
                  placeholder={t.boardDescPlaceholder}
                />
              </div>
            </div>
          </Modal>

          {/* ------------------------------------------------------------- */}
          {/* Modale colonne */}
          {/* ------------------------------------------------------------- */}
          <Modal
            open={columnModalOpen}
            onClose={() => setColumnModalOpen(false)}
            title={
              <h2 className="text-xl font-semibold">
                {editingColumnId ? t.editColumnTitle : t.addColumnTitle}
              </h2>
            }
            size="lg"
            panelChromeClassName="bg-neutral-900 rounded-xl border border-white/10"
            footer={
              <>
                <button
                  onClick={() => setColumnModalOpen(false)}
                  className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/15 text-white text-sm"
                >
                  {t.cancel}
                </button>
                <button
                  onClick={handleSaveColumn}
                  disabled={colSaving}
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:bg-neutral-600 text-white font-medium text-sm"
                >
                  {colSaving ? t.saving : t.save}
                </button>
              </>
            }
          >
            <div className="space-y-4">
              <div>
                <label
                  htmlFor="col-name"
                  className="block text-sm text-neutral-300 mb-2"
                >
                  {t.columnNameLabel}
                </label>
                <input
                  id="col-name"
                  type="text"
                  value={colFormName}
                  onChange={(e) => setColFormName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white"
                  placeholder={t.columnNamePlaceholder}
                />
              </div>
              <div>
                <label
                  htmlFor="col-wip"
                  className="block text-sm text-neutral-300 mb-2"
                >
                  {t.wipLimitLabel}
                </label>
                <input
                  id="col-wip"
                  type="number"
                  min={1}
                  value={colFormWip}
                  onChange={(e) => setColFormWip(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white"
                />
                <p className="text-xs text-neutral-500 mt-1">
                  {t.wipLimitHint}
                </p>
              </div>
              <label className="inline-flex items-center gap-2 text-sm text-neutral-300 cursor-pointer">
                <input
                  type="checkbox"
                  checked={colFormDone}
                  onChange={(e) => setColFormDone(e.target.checked)}
                  className="accent-emerald-500"
                />
                {t.isDoneLabel}
              </label>
            </div>
          </Modal>

          {/* ------------------------------------------------------------- */}
          {/* Modale carte */}
          {/* ------------------------------------------------------------- */}
          <Modal
            open={cardModalOpen}
            onClose={() => setCardModalOpen(false)}
            title={
              <h2 className="text-xl font-semibold">
                {editingCard ? t.editCardTitle : t.newCardTitle}
              </h2>
            }
            size="2xl"
            panelChromeClassName="bg-neutral-900 rounded-xl border border-white/10"
            footer={
              <>
                {editingCard && (
                  <button
                    onClick={handleDeleteCard}
                    disabled={cardDeleting}
                    className="mr-auto px-4 py-2 rounded-lg bg-red-600/20 border border-red-500/30 text-red-200 text-sm hover:bg-red-600/40 disabled:opacity-50"
                  >
                    {cardDeleting ? t.deleting : t.deleteCard}
                  </button>
                )}
                <button
                  onClick={() => setCardModalOpen(false)}
                  className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/15 text-white text-sm"
                >
                  {t.cancel}
                </button>
                <button
                  onClick={handleSaveCard}
                  disabled={cardSaving}
                  className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:bg-neutral-600 text-white font-medium text-sm"
                >
                  {cardSaving
                    ? editingCard
                      ? t.saving
                      : t.adding
                    : editingCard
                      ? t.save
                      : t.add}
                </button>
              </>
            }
          >
            <div className="space-y-4">
              <div>
                <label
                  htmlFor="card-title"
                  className="block text-sm text-neutral-300 mb-2"
                >
                  {t.cardTitleLabel}
                </label>
                <input
                  id="card-title"
                  type="text"
                  value={cardTitle}
                  onChange={(e) => setCardTitle(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white"
                  placeholder={t.cardTitlePlaceholder}
                />
              </div>
              <div>
                <label
                  htmlFor="card-desc"
                  className="block text-sm text-neutral-300 mb-2"
                >
                  {t.cardDescLabel}
                </label>
                <textarea
                  id="card-desc"
                  value={cardDesc}
                  onChange={(e) => setCardDesc(e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white"
                  placeholder={t.cardDescPlaceholder}
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label
                    htmlFor="card-priority"
                    className="block text-sm text-neutral-300 mb-2"
                  >
                    {t.priorityLabel}
                  </label>
                  <select
                    id="card-priority"
                    value={cardPriority}
                    onChange={(e) =>
                      setCardPriority(e.target.value as Priority)
                    }
                    className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white"
                  >
                    {PRIORITIES.map((p) => (
                      <option key={p} value={p}>
                        {priorityLabel(t, p)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label
                    htmlFor="card-due"
                    className="block text-sm text-neutral-300 mb-2"
                  >
                    {t.dueDateLabel}
                  </label>
                  <input
                    id="card-due"
                    type="date"
                    value={cardDue}
                    onChange={(e) => setCardDue(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white"
                  />
                </div>
              </div>
              <div>
                <label
                  htmlFor="card-assignee"
                  className="block text-sm text-neutral-300 mb-2"
                >
                  {t.assigneeLabel}
                </label>
                <select
                  id="card-assignee"
                  value={cardAssignee}
                  onChange={(e) => setCardAssignee(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white"
                >
                  <option value="">{t.unassigned}</option>
                  {staff.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label
                  htmlFor="card-labels"
                  className="block text-sm text-neutral-300 mb-2"
                >
                  {t.labelsLabel}
                </label>
                <input
                  id="card-labels"
                  type="text"
                  value={cardLabels}
                  onChange={(e) => setCardLabels(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white"
                  placeholder={t.labelsPlaceholder}
                />
                <p className="text-xs text-neutral-500 mt-1">{t.labelsHint}</p>
              </div>

              {/* Sections checklist + commentaires : édition uniquement. */}
              {editingCard && (
                <div className="space-y-6 border-t border-white/10 pt-4">
                  {/* Checklist */}
                  <section>
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <h3 className="text-sm font-semibold text-neutral-200">
                        {t.checklistTitle}
                      </h3>
                      {taskChecklist.length > 0 && (
                        <span className="text-xs text-neutral-400">
                          {taskChecklist.filter((i) => i.isDone).length}/
                          {taskChecklist.length}
                        </span>
                      )}
                    </div>
                    {taskChecklist.length > 0 && (
                      <div className="mb-3 h-1.5 w-full rounded-full bg-white/10 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-emerald-400 transition-all"
                          style={{
                            width: `${Math.round(
                              (taskChecklist.filter((i) => i.isDone).length /
                                taskChecklist.length) *
                                100
                            )}%`,
                          }}
                        />
                      </div>
                    )}
                    {cardDetailLoading ? (
                      <p className="text-xs text-neutral-500">{t.loading}</p>
                    ) : (
                      <ul className="space-y-1.5">
                        {taskChecklist.length === 0 && (
                          <li className="text-xs text-neutral-500">
                            {t.checklistEmpty}
                          </li>
                        )}
                        {taskChecklist.map((item) => (
                          <li
                            key={item.id}
                            className="flex items-center gap-2 group"
                          >
                            <input
                              type="checkbox"
                              checked={item.isDone}
                              onChange={() => handleToggleChecklistItem(item)}
                              aria-label={item.label}
                              className="accent-emerald-500 flex-shrink-0"
                            />
                            <span
                              className={`flex-1 text-sm ${
                                item.isDone
                                  ? 'line-through text-neutral-500'
                                  : 'text-neutral-200'
                              }`}
                            >
                              {item.label}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleDeleteChecklistItem(item)}
                              title={t.checklistDelete}
                              aria-label={t.checklistDelete}
                              className="px-1.5 rounded text-neutral-500 hover:text-red-300 hover:bg-red-500/10"
                            >
                              ✕
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                    <div className="mt-3 flex items-center gap-2">
                      <input
                        type="text"
                        value={checklistInput}
                        onChange={(e) => setChecklistInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            void handleAddChecklistItem();
                          }
                        }}
                        placeholder={t.checklistAddPlaceholder}
                        className="flex-1 px-3 py-1.5 rounded-lg bg-white/10 border border-white/20 text-white text-sm placeholder:text-neutral-500"
                      />
                      <button
                        type="button"
                        onClick={() => void handleAddChecklistItem()}
                        disabled={checklistAdding || !checklistInput.trim()}
                        className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:bg-neutral-600 text-white text-sm font-medium"
                      >
                        {t.checklistAdd}
                      </button>
                    </div>
                  </section>

                  {/* Commentaires */}
                  <section>
                    <h3 className="text-sm font-semibold text-neutral-200 mb-2">
                      {t.commentsTitle}
                    </h3>
                    {cardDetailLoading ? (
                      <p className="text-xs text-neutral-500">{t.loading}</p>
                    ) : (
                      <ul className="space-y-3">
                        {taskComments.length === 0 && (
                          <li className="text-xs text-neutral-500">
                            {t.commentsEmpty}
                          </li>
                        )}
                        {taskComments.map((c) => (
                          <li
                            key={c.id}
                            className="rounded-lg bg-white/5 border border-white/10 p-2.5"
                          >
                            <div className="flex items-center justify-between gap-2 mb-1">
                              <span className="text-xs font-medium text-neutral-200">
                                {c.authorName ?? t.unknownAuthor}
                              </span>
                              <div className="flex items-center gap-2">
                                <span className="text-[10px] text-neutral-500">
                                  {formatCommentDate(c.createdAt)}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => void handleDeleteComment(c)}
                                  title={t.commentDelete}
                                  aria-label={t.commentDelete}
                                  className="px-1 rounded text-neutral-500 hover:text-red-300 hover:bg-red-500/10"
                                >
                                  ✕
                                </button>
                              </div>
                            </div>
                            <p className="text-sm text-neutral-200 whitespace-pre-wrap break-words">
                              {c.body}
                            </p>
                          </li>
                        ))}
                      </ul>
                    )}
                    <div className="mt-3 space-y-2">
                      <textarea
                        value={commentInput}
                        onChange={(e) => setCommentInput(e.target.value)}
                        rows={2}
                        placeholder={t.commentPlaceholder}
                        aria-label={t.commentsTitle}
                        className="w-full px-3 py-2 rounded-lg bg-white/10 border border-white/20 text-white text-sm placeholder:text-neutral-500"
                      />
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={() => void handleAddComment()}
                          disabled={commentPosting || !commentInput.trim()}
                          className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:bg-neutral-600 text-white text-sm font-medium"
                        >
                          {commentPosting ? t.commentPosting : t.commentSubmit}
                        </button>
                      </div>
                    </div>
                  </section>
                </div>
              )}
            </div>
          </Modal>

          {dialog}
        </div>
      </div>
    </>
  );
}

export default AdminTasksPage;
