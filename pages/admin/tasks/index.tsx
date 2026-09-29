// pages/admin/tasks/index.tsx
//
// Kanban interne staff-only (task_boards / task_columns / tasks).
// Consomme l'API admin /api/admin/tasks/* (déjà livrée). Aucune écriture DB
// directe : lectures via useAdminFetch, écritures via useIdempotentMutation.
//
// Vue : sélecteur de board (onglets) + actions board (renommer/archiver/
// supprimer) + colonnes en flex horizontal scrollable, cartes drag & drop
// natif (HTML5) avec update optimiste et rollback en cas d'erreur.
//
// « Le Ruban » (lot 8C) : la page garde l'état, les chargements et les effets ;
// gestes → features/admin/tasks/hooks/ (corps à l'identique), affichage → ui/.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { withStaffPage } from '@/utils/staff';
import { useAdminFetch } from '@/hooks/useAdminFetch';
import { useIdempotentMutation } from '@/hooks/useIdempotentMutation';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { useActiveTenant } from '@/hooks/useActiveTenant';
import { useToast } from '@/components/Toast';
import { useAdminT } from '@/lib/i18n/useAdminT';
import { useLocale } from '@/lib/i18n/useLocale';
import nsAdminTaskBoard from '@/lib/i18n/locales/admin-fr/adminTaskBoard';
import {
  type StaffProps,
  type Priority,
  type BoardListItem,
  type BoardTask,
  type BoardDetail,
  type MyTask,
  type DeletedTask,
  type CardSort,
  type TaskActivity,
  type StaffOption,
  type TaskComment,
  type ChecklistItem,
  DEFAULT_LABEL_COLORS,
} from '@/components/admin/tasks/taskBoardModel';
import {
  MyTasksView,
  ActivitySection,
} from '@/components/admin/tasks/TaskBoardParts';
import { useTaskBoardBoardActions } from '@/features/admin/tasks/hooks/useTaskBoardBoardActions';
import { useTaskBoardCardActions } from '@/features/admin/tasks/hooks/useTaskBoardCardActions';
import { useTaskBoardLabelActions } from '@/features/admin/tasks/hooks/useTaskBoardLabelActions';
import { useTaskBoardDnd } from '@/features/admin/tasks/hooks/useTaskBoardDnd';
import { useTaskBoardDerived } from '@/features/admin/tasks/hooks/useTaskBoardDerived';
import TaskBoardHeader from '@/features/admin/tasks/ui/TaskBoardHeader';
import {
  TaskBoardActions,
  TaskBoardTabs,
} from '@/features/admin/tasks/ui/TaskBoardBoardBar';
import TaskBoardFilters from '@/features/admin/tasks/ui/TaskBoardFilters';
import TaskBoardColumn from '@/features/admin/tasks/ui/TaskBoardColumn';
import TaskBoardCardModal from '@/features/admin/tasks/ui/TaskBoardCardModal';
import {
  TaskBoardChecklistSection,
  TaskBoardCommentsSection,
} from '@/features/admin/tasks/ui/TaskBoardCardSections';
import {
  TaskBoardBoardModal,
  TaskBoardColumnModal,
} from '@/features/admin/tasks/ui/TaskBoardFormModals';
import {
  TaskBoardLabelsModal,
  TaskBoardTrashModal,
} from '@/features/admin/tasks/ui/TaskBoardPanelModals';
import {
  TaskBoardEmpty,
  TaskBoardErrorBanner,
  TaskBoardLoading,
} from '@/features/admin/tasks/ui/TaskBoardStates';

export const getServerSideProps = withStaffPage({ permission: 'manage_tasks' });

function AdminTasksPage({ staff: currentStaff }: StaffProps) {
  const t = useAdminT(nsAdminTaskBoard);
  const locale = useLocale();
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
  const labelMutation = useIdempotentMutation();
  const restoreMutation = useIdempotentMutation();

  const router = useRouter();
  // `?board=<id>` deep-links / survives a reload. Captured once (SSR provides
  // the query on first render) so it seeds the initial board selection without
  // re-triggering the board fetch on every subsequent board switch.
  const initialUrlBoardRef = useRef<string | null>(
    typeof router.query.board === 'string' ? router.query.board : null
  );
  const [boards, setBoards] = useState<BoardListItem[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  // Bascule Board ↔ Mes tâches (vue transverse).
  const [viewMode, setViewMode] = useState<'board' | 'mine'>('board');
  const [myTasks, setMyTasks] = useState<MyTask[]>([]);
  const [loadingMy, setLoadingMy] = useState(false);
  // Ouverture différée d'une carte depuis « Mes tâches » : on navigue vers son
  // board puis on ouvre la modale une fois le détail du board chargé.
  const [pendingOpenCardId, setPendingOpenCardId] = useState<string | null>(
    null
  );
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
  // La carte stocke des NOMS de labels (comme aujourd'hui) ; la couleur vient
  // de la définition du board (detail.labels), lookup par nom.
  const [cardLabelNames, setCardLabelNames] = useState<string[]>([]);
  const [adHocLabel, setAdHocLabel] = useState('');
  const [adHocAdding, setAdHocAdding] = useState(false);
  const [cardSaving, setCardSaving] = useState(false);
  const [cardDeleting, setCardDeleting] = useState(false);

  // Timeline d'activité de la carte en édition.
  const [taskActivity, setTaskActivity] = useState<TaskActivity[]>([]);
  const [activityLoading, setActivityLoading] = useState(false);
  const [activityExpanded, setActivityExpanded] = useState(false);

  // Panneau de gestion des labels du board.
  const [labelsPanelOpen, setLabelsPanelOpen] = useState(false);
  const [newLabelName, setNewLabelName] = useState('');
  const [newLabelColor, setNewLabelColor] = useState(DEFAULT_LABEL_COLORS[0]);
  const [labelBusy, setLabelBusy] = useState(false);

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

  // Tri d'affichage des cartes dans les colonnes (client-side).
  const [cardSort, setCardSort] = useState<CardSort>('manual');

  // Corbeille (cartes soft-deleted du board actif).
  const [trashOpen, setTrashOpen] = useState(false);
  const [deletedTasks, setDeletedTasks] = useState<DeletedTask[]>([]);
  const [deletedLoading, setDeletedLoading] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);

  // DnD
  const dragTaskId = useRef<string | null>(null);
  // Le glisser-déposer n'a de sens que sous tri Manuel (ordre = position).
  const dndEnabled = cardSort === 'manual';

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
          if (urlBoard && visible.some((b) => b.id === urlBoard))
            return urlBoard;
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

  const fetchMyTasks = useCallback(async () => {
    setLoadingMy(true);
    try {
      const json = await adminFetchJson<{ tasks: MyTask[] }>(
        '/api/admin/tasks/my'
      );
      setMyTasks(json.tasks || []);
    } catch (err: unknown) {
      addToast((err as Error)?.message || t.myTasksLoadError, 'error');
    } finally {
      setLoadingMy(false);
    }
  }, [adminFetchJson, addToast, t]);

  useEffect(() => {
    fetchBoards();
  }, [fetchBoards]);

  // Charge « Mes tâches » à l'entrée dans cette vue.
  useEffect(() => {
    if (viewMode === 'mine') fetchMyTasks();
  }, [viewMode, fetchMyTasks]);

  useEffect(() => {
    if (activeBoardId) {
      // Drop any detail from a previously-selected board before the new one
      // loads. Boards share identical default column names ("À faire", …), so
      // a lingering stale detail would let a card be added against the wrong
      // board's column (→ 400 column_not_in_board). Clearing it shows the
      // loading state until the correct columns arrive.
      setDetail((prev) => (prev && prev.id === activeBoardId ? prev : null));
      fetchDetail(activeBoardId);
    } else {
      setDetail(null);
    }
  }, [activeBoardId, fetchDetail]);

  // Ouverture différée d'une carte arrivée depuis « Mes tâches » : une fois le
  // détail du board cible chargé, on ouvre la carte correspondante (puis on
  // retombe silencieusement si elle n'existe plus).
  // biome-ignore lint/correctness/useExhaustiveDependencies: dépendances choisies à dessein (exclusion reprise d’ESLint)
  useEffect(() => {
    if (!pendingOpenCardId || !detail || detail.id !== activeBoardId) return;
    for (const col of detail.columns) {
      const found = col.tasks.find((tk) => tk.id === pendingOpenCardId);
      if (found) {
        openEditCard(found);
        break;
      }
    }
    setPendingOpenCardId(null);
  }, [detail, pendingOpenCardId, activeBoardId]);

  // Reflect the active board in the URL (?board=) — shallow, no reload — so a
  // refresh or shared link reopens the same board. Deps intentionally limited
  // to activeBoardId to avoid re-fetching the board list on URL changes.
  // biome-ignore lint/correctness/useExhaustiveDependencies: dépendances choisies à dessein (exclusion reprise d’ESLint)
  useEffect(() => {
    if (!activeBoardId || router.query.board === activeBoardId) return;
    router.replace(
      {
        pathname: router.pathname,
        query: { ...router.query, board: activeBoardId },
      },
      undefined,
      { shallow: true }
    );
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

  // Données dérivées (mémos déplacés à l'identique dans useTaskBoardDerived).
  const {
    staffNameById,
    boardLabels,
    labelDefByName,
    availableLabels,
    debouncedSearch,
    hasActiveFilters,
    clearFilters,
    sortedColumns,
    visibleTasksByColumn,
  } = useTaskBoardDerived({
    currentStaff,
    detail,
    staff,
    cardSort,
    filterSearch,
    setFilterSearch,
    filterAssignee,
    setFilterAssignee,
    filterPriority,
    setFilterPriority,
    filterLabel,
    setFilterLabel,
    filterMine,
    setFilterMine,
  });

  // Gestes (corps déplacés à l'identique dans features/admin/tasks/hooks/).

  const {
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
  } = useTaskBoardBoardActions({
    t,
    addToast,
    confirm,
    adminFetchJson,
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
  });

  const {
    openAddCard,
    openEditCard,
    handleAddChecklistItem,
    handleToggleChecklistItem,
    handleDeleteChecklistItem,
    handleAddComment,
    handleDeleteComment,
    handleSaveCard,
    handleDeleteCard,
  } = useTaskBoardCardActions({
    t,
    addToast,
    confirm,
    adminFetchJson,
    cardMutation,
    checklistMutation,
    commentMutation,
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
  });

  const {
    toggleCardLabel,
    handleAddAdHocLabel,
    handleCreateLabelFromPanel,
    handleUpdateLabel,
    handleDeleteLabel,
  } = useTaskBoardLabelActions({
    t,
    addToast,
    confirm,
    labelMutation,
    fetchDetail,
    activeBoardId,
    boardLabels,
    labelDefByName,
    cardLabelNames,
    setCardLabelNames,
    adHocLabel,
    setAdHocLabel,
    setAdHocAdding,
    newLabelName,
    setNewLabelName,
    newLabelColor,
    setLabelBusy,
  });

  const { onCardDragStart, onCardDragEnd, onDropOnCard, onDropOnColumn } =
    useTaskBoardDnd({
      t,
      addToast,
      moveMutation,
      fetchBoards,
      dragTaskId,
      detail,
      setDetail,
      activeBoardId,
      dndEnabled,
    });

  return (
    <>
      <Head>
        <title>{t.headTitle}</title>
      </Head>
      <div className="min-h-screen px-4 pt-header pb-12 sm:px-6 lg:px-[30px]">
        <div className="mx-auto max-w-[110rem]">
          <TaskBoardHeader
            t={t}
            viewMode={viewMode}
            onViewModeChange={setViewMode}
            onRefresh={
              viewMode === 'board'
                ? () => fetchBoards({ keepActive: true })
                : fetchMyTasks
            }
            onCreateBoard={openCreateBoard}
          />

          {errorMsg && <TaskBoardErrorBanner>{errorMsg}</TaskBoardErrorBanner>}

          {viewMode === 'board' && (
            <>
              {/* Sélecteur de board */}
              {!loadingBoards && boards.length > 0 && (
                <TaskBoardTabs
                  t={t}
                  boards={visibleBoards}
                  activeBoardId={activeBoardId}
                  onSelect={(id) => setActiveBoardId(id)}
                  showArchived={showArchived}
                  onShowArchivedChange={setShowArchived}
                />
              )}

              {/* Barre d'actions du board actif */}
              {activeBoard && (
                <TaskBoardActions
                  t={t}
                  activeBoard={activeBoard}
                  onRename={openRenameBoard}
                  onToggleArchive={handleToggleArchive}
                  onDelete={handleDeleteBoard}
                  onManageLabels={() => setLabelsPanelOpen(true)}
                  onOpenTrash={openTrash}
                  onAddColumn={openAddColumn}
                />
              )}

              {/* Barre de recherche & filtres */}
              {detail && (
                <TaskBoardFilters
                  t={t}
                  staff={staff}
                  staffNameById={staffNameById}
                  availableLabels={availableLabels}
                  labelDefByName={labelDefByName}
                  filterSearch={filterSearch}
                  onFilterSearchChange={setFilterSearch}
                  debouncedSearch={debouncedSearch}
                  filterAssignee={filterAssignee}
                  onFilterAssigneeChange={setFilterAssignee}
                  filterPriority={filterPriority}
                  onFilterPriorityChange={setFilterPriority}
                  filterLabel={filterLabel}
                  onFilterLabelChange={setFilterLabel}
                  filterMine={filterMine}
                  onFilterMineChange={setFilterMine}
                  cardSort={cardSort}
                  onCardSortChange={setCardSort}
                  dndEnabled={dndEnabled}
                  hasActiveFilters={hasActiveFilters}
                  onClearFilters={clearFilters}
                />
              )}

              {/* États de chargement / vide */}
              {loadingBoards && (
                <TaskBoardLoading>{t.loading}</TaskBoardLoading>
              )}

              {!loadingBoards && boards.length === 0 && (
                <TaskBoardEmpty title={t.noBoards} hint={t.noBoardsHint} />
              )}

              {!loadingBoards && boards.length > 0 && !activeBoardId && (
                <TaskBoardEmpty title={t.noBoards} />
              )}

              {/* Kanban */}
              {activeBoardId && (
                <div className="relative">
                  {loadingDetail && (
                    <TaskBoardLoading compact>{t.loading}</TaskBoardLoading>
                  )}
                  {detail && (
                    <div className="flex gap-4 overflow-x-auto pb-4">
                      {sortedColumns.map((col, index) => (
                        <TaskBoardColumn
                          key={col.id}
                          t={t}
                          col={col}
                          index={index}
                          columnCount={sortedColumns.length}
                          tasks={visibleTasksByColumn.get(col.id) ?? []}
                          hasActiveFilters={hasActiveFilters}
                          dndEnabled={dndEnabled}
                          labelDefByName={labelDefByName}
                          staffNameById={staffNameById}
                          onReorder={handleReorderColumn}
                          onEdit={openEditColumn}
                          onDelete={handleDeleteColumn}
                          onAddCard={openAddCard}
                          onOpenCard={openEditCard}
                          onDropOnColumn={onDropOnColumn}
                          onDropOnCard={onDropOnCard}
                          onCardDragStart={onCardDragStart}
                          onCardDragEnd={onCardDragEnd}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* Vue « Mes tâches » (transverse, tous boards) */}
          {viewMode === 'mine' && (
            <MyTasksView
              t={t}
              tasks={myTasks}
              loading={loadingMy}
              onOpen={(task) => {
                setViewMode('board');
                setActiveBoardId(task.boardId);
                setPendingOpenCardId(task.id);
              }}
            />
          )}

          <TaskBoardBoardModal
            t={t}
            open={boardModalOpen}
            mode={boardModalMode}
            name={boardFormName}
            description={boardFormDesc}
            saving={boardSaving}
            onNameChange={setBoardFormName}
            onDescriptionChange={setBoardFormDesc}
            onClose={() => setBoardModalOpen(false)}
            onSave={handleSaveBoard}
          />

          <TaskBoardColumnModal
            t={t}
            open={columnModalOpen}
            editing={!!editingColumnId}
            name={colFormName}
            wip={colFormWip}
            isDone={colFormDone}
            saving={colSaving}
            onNameChange={setColFormName}
            onWipChange={setColFormWip}
            onIsDoneChange={setColFormDone}
            onClose={() => setColumnModalOpen(false)}
            onSave={handleSaveColumn}
          />

          <TaskBoardCardModal
            t={t}
            open={cardModalOpen}
            editing={!!editingCard}
            form={{
              title: cardTitle,
              description: cardDesc,
              priority: cardPriority,
              due: cardDue,
              assignee: cardAssignee,
              labelNames: cardLabelNames,
              adHocLabel,
            }}
            staff={staff}
            boardLabels={boardLabels}
            labelDefByName={labelDefByName}
            saving={cardSaving}
            deleting={cardDeleting}
            adHocAdding={adHocAdding}
            onTitleChange={setCardTitle}
            onDescriptionChange={setCardDesc}
            onPriorityChange={setCardPriority}
            onDueChange={setCardDue}
            onAssigneeChange={setCardAssignee}
            onToggleLabel={toggleCardLabel}
            onAdHocLabelChange={setAdHocLabel}
            onAddAdHocLabel={handleAddAdHocLabel}
            onClose={() => setCardModalOpen(false)}
            onSave={handleSaveCard}
            onDelete={handleDeleteCard}
          >
            <TaskBoardChecklistSection
              t={t}
              items={taskChecklist}
              loading={cardDetailLoading}
              input={checklistInput}
              adding={checklistAdding}
              onInputChange={setChecklistInput}
              onAdd={handleAddChecklistItem}
              onToggle={handleToggleChecklistItem}
              onDelete={handleDeleteChecklistItem}
            />
            <TaskBoardCommentsSection
              t={t}
              comments={taskComments}
              loading={cardDetailLoading}
              input={commentInput}
              posting={commentPosting}
              onInputChange={setCommentInput}
              onSubmit={handleAddComment}
              onDelete={handleDeleteComment}
            />
            {/* Activité (timeline humanisée, repliable si longue). */}
            <ActivitySection
              t={t}
              locale={locale}
              activity={taskActivity}
              loading={activityLoading}
              expanded={activityExpanded}
              onToggleExpanded={() => setActivityExpanded((prev) => !prev)}
            />
          </TaskBoardCardModal>

          <TaskBoardLabelsModal
            t={t}
            open={labelsPanelOpen}
            labels={boardLabels}
            newName={newLabelName}
            newColor={newLabelColor}
            busy={labelBusy}
            onNewNameChange={setNewLabelName}
            onNewColorChange={setNewLabelColor}
            onCreate={handleCreateLabelFromPanel}
            onUpdate={handleUpdateLabel}
            onDelete={handleDeleteLabel}
            onClose={() => setLabelsPanelOpen(false)}
          />

          <TaskBoardTrashModal
            t={t}
            open={trashOpen}
            loading={deletedLoading}
            tasks={deletedTasks}
            restoringId={restoringId}
            onRestore={handleRestoreTask}
            onClose={() => setTrashOpen(false)}
          />

          {dialog}
        </div>
      </div>
    </>
  );
}

export default AdminTasksPage;
