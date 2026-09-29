// features/admin/tasks/ui/TaskBoardCard.tsx — une carte du Kanban : titre,
// priorité, labels (couleurs du board = données), avancement de checklist,
// commentaires, échéance et assignée. Les gestes de glisser-déposer sont ceux
// de la page, branchés tels quels seulement si le tri est « manuel ».

import type { DragEvent } from 'react';
import { format } from '@/lib/i18n/useAdminT';
import Chip from '@/features/admin/_shared/ui/Chip';
import {
  type BoardLabel,
  type BoardTask,
  type Dict,
  initials,
  priorityLabel,
  priorityTone,
} from '@/components/admin/tasks/taskBoardModel';
import { LabelPill } from '@/components/admin/tasks/TaskBoardParts';

export default function TaskBoardCard({
  t,
  card,
  overdue,
  dndEnabled,
  labelDefByName,
  staffNameById,
  onOpen,
  onDragStart,
  onDragEnd,
  onDrop,
}: {
  t: Dict;
  card: BoardTask;
  overdue: boolean;
  dndEnabled: boolean;
  labelDefByName: Map<string, BoardLabel>;
  staffNameById: Map<string, string>;
  onOpen: (card: BoardTask) => void;
  onDragStart: (e: DragEvent, taskId: string) => void;
  onDragEnd: () => void;
  onDrop: (e: DragEvent) => void;
}) {
  const checklistComplete = card.checklist.done === card.checklist.total;
  return (
    <div
      draggable={dndEnabled}
      onDragStart={dndEnabled ? (e) => onDragStart(e, card.id) : undefined}
      onDragEnd={dndEnabled ? onDragEnd : undefined}
      onDragOver={dndEnabled ? (e) => e.preventDefault() : undefined}
      onDrop={dndEnabled ? (e) => onDrop(e) : undefined}
      onClick={() => onOpen(card)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen(card);
        }
      }}
      className={`rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] p-3 shadow-[var(--sh1)] transition-colors hover:border-[var(--or,#b467d1)] ${
        dndEnabled ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="flex-1 text-sm font-medium leading-snug text-[var(--t1,#f4edf7)]">
          {card.title}
        </p>
        <Chip tone={priorityTone(card.priority)}>
          {priorityLabel(t, card.priority)}
        </Chip>
      </div>

      {card.labels.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {card.labels.map((lbl) => (
            <LabelPill
              key={lbl}
              name={lbl}
              def={labelDefByName.get(lbl)}
              size="xs"
            />
          ))}
        </div>
      )}

      {(card.checklist.total > 0 || card.commentCount > 0) && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {card.checklist.total > 0 && (
            <span
              title={format(t.checklistBadgeTitle, {
                done: card.checklist.done,
                total: card.checklist.total,
              })}
              className={`inline-flex items-center gap-1 rounded-[3px] border px-1.5 py-0.5 text-[10px] ${
                checklistComplete
                  ? 'border-[rgba(127,202,101,.36)] bg-[rgba(127,202,101,.13)] text-[var(--lf-200,#b3e7a3)]'
                  : 'border-[var(--line2,rgba(194,196,201,.2))] text-[var(--t3,#a39ba6)]'
              }`}
            >
              <span aria-hidden="true">✓</span>
              {card.checklist.done}/{card.checklist.total}
              <span className="relative inline-block h-1 w-8 overflow-hidden rounded-full bg-[var(--s3,#2f2732)] align-middle">
                <span
                  className="absolute inset-y-0 left-0 rounded-full bg-[var(--lf,#7fca65)]"
                  style={{
                    width: `${Math.round(
                      (card.checklist.done / card.checklist.total) * 100
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
              className="inline-flex items-center gap-1 rounded-[3px] border border-[var(--line2,rgba(194,196,201,.2))] px-1.5 py-0.5 text-[10px] text-[var(--t3,#a39ba6)]"
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
                ? 'font-medium text-[var(--err,#ff6b6b)]'
                : 'text-[var(--t3,#a39ba6)]'
            }`}
            title={overdue ? t.overdue : undefined}
            data-numeric
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
              staffNameById.get(card.assignee.staffId) ??
              undefined
            }
            className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border border-[rgba(180,103,209,.4)] bg-[rgba(180,103,209,.12)] text-[10px] font-semibold text-[var(--or-200,#eec4ff)]"
          >
            {initials(
              card.assignee.name ??
                staffNameById.get(card.assignee.staffId) ??
                null
            )}
          </span>
        )}
      </div>
    </div>
  );
}
