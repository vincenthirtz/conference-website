// features/admin/tasks/ui/TaskBoardColumn.tsx — une colonne du Kanban :
// en-tête (nom, compteur, limite WIP, colonne terminale, réordonner/éditer/
// supprimer), cartes visibles et ajout de carte. La colonne est une zone de
// dépôt ; la saturation WIP se lit sur le total réel, pas filtré.
//
// Ajout rapide : « + Ajouter une carte » ouvre un champ en bas de colonne ;
// Entrée crée la carte (priorité moyenne, sans échéance) et laisse le champ
// ouvert pour la suivante, Échap le ferme, « Plus d'options » ouvre la
// fenêtre complète avec le titre déjà tapé.

import { type DragEvent, useRef, useState } from 'react';
import { format } from '@/lib/i18n/useAdminT';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import Chip from '@/features/admin/_shared/ui/Chip';
import type {
  BoardDetailColumn,
  BoardLabel,
  BoardTask,
  Dict,
} from '@/components/admin/tasks/taskBoardModel';
import type { DropHint } from '../hooks/useTaskBoardDnd';
import TaskBoardCard from './TaskBoardCard';
import { TB_FIELD_SM } from './taskBoardClasses';

export default function TaskBoardColumn({
  t,
  col,
  index,
  columnCount,
  tasks,
  hasActiveFilters,
  dndEnabled,
  dropHint = null,
  labelDefByName,
  staffNameById,
  onReorder,
  onEdit,
  onDelete,
  onAddCard,
  onQuickAdd,
  onOpenCard,
  onDragOverColumn,
  onDragOverCard,
  onDropOnColumn,
  onDropOnCard,
  onCardDragStart,
  onCardDragEnd,
  archiveShown = false,
  onToggleArchive,
}: {
  t: Dict;
  col: BoardDetailColumn;
  index: number;
  columnCount: number;
  /** Cartes visibles (triées + filtrées) de la colonne. */
  tasks: BoardTask[];
  hasActiveFilters: boolean;
  dndEnabled: boolean;
  /** Place montrée pendant un glisser (toutes colonnes confondues). */
  dropHint?: DropHint | null;
  labelDefByName: Map<string, BoardLabel>;
  staffNameById: Map<string, string>;
  onReorder: (index: number, dir: -1 | 1) => void;
  onEdit: (col: BoardDetailColumn) => void;
  onDelete: (col: BoardDetailColumn) => void;
  /** Fenêtre complète de création (titre éventuellement prérempli). */
  onAddCard: (columnId: string, title?: string) => void;
  /** Création directe depuis le champ rapide ; `true` si la carte est créée. */
  onQuickAdd: (columnId: string, title: string) => Promise<boolean>;
  onOpenCard: (card: BoardTask, columnId: string) => void;
  onDragOverColumn: (e: DragEvent, columnId: string) => void;
  onDragOverCard: (e: DragEvent, columnId: string, taskId: string) => void;
  onDropOnColumn: (e: DragEvent, toColumnId: string) => void;
  onDropOnCard: (
    e: DragEvent,
    toColumnId: string,
    targetTaskId: string
  ) => void;
  onCardDragStart: (e: DragEvent, taskId: string) => void;
  onCardDragEnd: () => void;
  /** Cartes terminées depuis plus de 30 jours affichées (board entier). */
  archiveShown?: boolean;
  onToggleArchive?: () => void;
}) {
  const [quickOpen, setQuickOpen] = useState(false);
  const [quickTitle, setQuickTitle] = useState('');
  const [quickBusy, setQuickBusy] = useState(false);
  const quickInputRef = useRef<HTMLInputElement>(null);

  function openQuickAdd() {
    setQuickOpen(true);
    // Le champ existe au rendu suivant.
    setTimeout(() => quickInputRef.current?.focus(), 0);
  }

  function closeQuickAdd() {
    setQuickOpen(false);
    setQuickTitle('');
  }

  async function submitQuickAdd() {
    const title = quickTitle.trim();
    if (!title || quickBusy) return;
    setQuickBusy(true);
    const ok = await onQuickAdd(col.id, title);
    setQuickBusy(false);
    if (ok) {
      setQuickTitle('');
      quickInputRef.current?.focus();
    }
  }

  const columnDropHint =
    dropHint && dropHint.columnId === col.id && dropHint.taskId === null;
  const archivedCount = col.archivedCount ?? 0;
  const showArchiveToggle =
    col.isDone && !!onToggleArchive && (archiveShown || archivedCount > 0);
  const totalCount = col.tasks.length;
  // WIP se calcule sur le total réel, pas sur le filtré.
  const over = col.wipLimit != null && totalCount > col.wipLimit;
  // Saturation : colonne pleine (au moins à la limite).
  const atLimit = col.wipLimit != null && totalCount >= col.wipLimit;
  const count = tasks.length;
  return (
    <div
      onDragOver={(e) => onDragOverColumn(e, col.id)}
      onDrop={(e) => onDropOnColumn(e, col.id)}
      className={`flex max-h-[70vh] w-72 flex-shrink-0 flex-col rounded-[var(--r-card,14px)] border ${
        atLimit
          ? 'border-[rgba(255,107,107,.4)] bg-[rgba(255,107,107,.05)]'
          : 'border-[var(--line,rgba(194,196,201,.12))] bg-[var(--s1,#100812)]'
      } ${columnDropHint ? 'outline outline-2 outline-[var(--or,#b467d1)]' : ''}`}
    >
      {/* Header colonne */}
      <div
        className={`border-b p-3 ${
          atLimit
            ? 'border-[rgba(255,107,107,.4)] bg-[rgba(255,107,107,.08)]'
            : 'border-[var(--line,rgba(194,196,201,.12))]'
        }`}
      >
        <div className="flex items-center gap-2">
          <h2
            className={`flex-1 truncate font-[family-name:var(--fd)] text-sm font-bold uppercase tracking-[0.04em] ${
              atLimit ? 'text-[#ffc2c2]' : 'text-[var(--t1,#f4edf7)]'
            }`}
          >
            {col.name}
          </h2>
          <span
            className={`text-xs ${
              atLimit
                ? 'font-semibold text-[var(--err,#ff6b6b)]'
                : 'text-[var(--t3,#a39ba6)]'
            }`}
            data-numeric
          >
            {hasActiveFilters && count !== totalCount
              ? `${count}/${totalCount}`
              : count}
            {col.wipLimit != null && (
              <span className="text-[var(--t4,#807984)]">
                {' '}
                / {col.wipLimit}
              </span>
            )}
          </span>
          {col.isDone && (
            <span
              className="h-2 w-2 rounded-full bg-[var(--ok,#30d07e)]"
              title={t.isDoneLabel}
              aria-hidden="true"
            />
          )}
        </div>
        {over && (
          <div className="mt-1">
            <Chip tone="err">
              {format(t.wipBadge, {
                count: totalCount,
                limit: col.wipLimit ?? 0,
              })}
            </Chip>
          </div>
        )}
        <div className="mt-2 flex items-center gap-1">
          <AdminButton
            size="xs"
            onClick={() => onReorder(index, -1)}
            disabled={index === 0}
            title={t.moveLeft}
            aria-label={t.moveLeft}
            className="!px-2"
          >
            ◀
          </AdminButton>
          <AdminButton
            size="xs"
            onClick={() => onReorder(index, 1)}
            disabled={index === columnCount - 1}
            title={t.moveRight}
            aria-label={t.moveRight}
            className="!px-2"
          >
            ▶
          </AdminButton>
          <AdminButton
            size="xs"
            onClick={() => onEdit(col)}
            title={t.editColumn}
            aria-label={t.editColumn}
            className="!px-2"
          >
            ✎
          </AdminButton>
          <AdminButton
            variant="danger"
            size="xs"
            onClick={() => onDelete(col)}
            title={t.deleteColumn}
            aria-label={t.deleteColumn}
            className="!px-2"
          >
            ✕
          </AdminButton>
        </div>
      </div>

      {/* Cartes */}
      <div className="flex-1 space-y-2 overflow-y-auto p-2">
        {tasks.length === 0 && (
          <p className="px-2 py-6 text-center text-xs text-[var(--t4,#807984)]">
            {hasActiveFilters && totalCount > 0
              ? t.noMatchingCards
              : t.emptyColumn}
          </p>
        )}
        {tasks.map((card) => (
          <TaskBoardCard
            key={card.id}
            t={t}
            card={card}
            columnIsDone={col.isDone}
            dndEnabled={dndEnabled}
            dropHint={
              dropHint && dropHint.taskId === card.id
                ? dropHint.after
                  ? 'after'
                  : 'before'
                : null
            }
            labelDefByName={labelDefByName}
            staffNameById={staffNameById}
            onOpen={(c) => onOpenCard(c, col.id)}
            onDragStart={onCardDragStart}
            onDragEnd={onCardDragEnd}
            onDragOver={(e) => onDragOverCard(e, col.id, card.id)}
            onDrop={(e) => onDropOnCard(e, col.id, card.id)}
          />
        ))}
        {showArchiveToggle && (
          <div className="px-2 py-2 text-center">
            {!archiveShown && (
              <p className="mb-1 text-xs text-[var(--t4,#807984)]">
                {format(t.doneArchiveHidden, { count: archivedCount })}
              </p>
            )}
            <AdminButton
              size="xs"
              variant="ghost"
              aria-pressed={archiveShown}
              onClick={onToggleArchive}
            >
              {archiveShown ? t.doneArchiveHide : t.doneArchiveShow}
            </AdminButton>
          </div>
        )}
      </div>

      {/* Ajouter une carte : champ rapide (le bouton reste en place, il sert
          aussi de zone de dépôt « fin de colonne »). */}
      <div className="space-y-2 border-t border-[var(--line,rgba(194,196,201,.12))] p-2">
        {quickOpen && (
          <div className="space-y-1.5">
            <input
              ref={quickInputRef}
              type="text"
              value={quickTitle}
              maxLength={200}
              onChange={(e) => setQuickTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  void submitQuickAdd();
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  closeQuickAdd();
                }
              }}
              placeholder={t.quickAddPlaceholder}
              aria-label={t.quickAddLabel}
              className={`w-full ${TB_FIELD_SM}`}
            />
            <div className="flex items-center gap-1">
              <AdminButton
                variant="primary"
                size="xs"
                onClick={() => void submitQuickAdd()}
                disabled={quickBusy || !quickTitle.trim()}
              >
                {quickBusy ? t.adding : t.add}
              </AdminButton>
              <AdminButton
                size="xs"
                variant="ghost"
                onClick={() => {
                  const title = quickTitle.trim();
                  closeQuickAdd();
                  onAddCard(col.id, title || undefined);
                }}
              >
                {t.quickAddDetails}
              </AdminButton>
              <AdminButton
                size="xs"
                variant="ghost"
                className="ml-auto !px-2"
                onClick={closeQuickAdd}
                title={t.quickAddClose}
                aria-label={t.quickAddClose}
              >
                ✕
              </AdminButton>
            </div>
          </div>
        )}
        <AdminButton size="xs" className="w-full" onClick={openQuickAdd}>
          + {t.addCard}
        </AdminButton>
      </div>
    </div>
  );
}
