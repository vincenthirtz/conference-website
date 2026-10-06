// features/admin/tasks/ui/TaskBoardColumn.tsx — une colonne du Kanban :
// en-tête (nom, compteur, limite WIP, colonne terminale, réordonner/éditer/
// supprimer), cartes visibles et bouton « + Ajouter une carte ». La colonne est
// une zone de dépôt ; la saturation WIP se lit sur le total réel, pas filtré.

import type { DragEvent } from 'react';
import { format } from '@/lib/i18n/useAdminT';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import Chip from '@/features/admin/_shared/ui/Chip';
import {
  type BoardDetailColumn,
  type BoardLabel,
  type BoardTask,
  type Dict,
  isOverdue,
} from '@/components/admin/tasks/taskBoardModel';
import TaskBoardCard from './TaskBoardCard';

export default function TaskBoardColumn({
  t,
  col,
  index,
  columnCount,
  tasks,
  hasActiveFilters,
  dndEnabled,
  labelDefByName,
  staffNameById,
  onReorder,
  onEdit,
  onDelete,
  onAddCard,
  onOpenCard,
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
  labelDefByName: Map<string, BoardLabel>;
  staffNameById: Map<string, string>;
  onReorder: (index: number, dir: -1 | 1) => void;
  onEdit: (col: BoardDetailColumn) => void;
  onDelete: (col: BoardDetailColumn) => void;
  onAddCard: (columnId: string) => void;
  onOpenCard: (card: BoardTask) => void;
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
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => onDropOnColumn(e, col.id)}
      className={`flex max-h-[70vh] w-72 flex-shrink-0 flex-col rounded-[var(--r-card,14px)] border ${
        atLimit
          ? 'border-[rgba(255,107,107,.4)] bg-[rgba(255,107,107,.05)]'
          : 'border-[var(--line,rgba(194,196,201,.12))] bg-[var(--s1,#100812)]'
      }`}
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
            overdue={isOverdue(card.dueDate, col.isDone)}
            dndEnabled={dndEnabled}
            labelDefByName={labelDefByName}
            staffNameById={staffNameById}
            onOpen={onOpenCard}
            onDragStart={onCardDragStart}
            onDragEnd={onCardDragEnd}
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

      {/* Ajouter une carte */}
      <div className="border-t border-[var(--line,rgba(194,196,201,.12))] p-2">
        <AdminButton
          size="xs"
          className="w-full"
          onClick={() => onAddCard(col.id)}
        >
          + {t.addCard}
        </AdminButton>
      </div>
    </div>
  );
}
