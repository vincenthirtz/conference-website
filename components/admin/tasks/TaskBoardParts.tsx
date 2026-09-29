// components/admin/tasks/TaskBoardParts.tsx
//
// Sous-composants du tableau de tâches staff : pastille d'étiquette, ligne du
// gestionnaire d'étiquettes, vue « mes tâches », section d'activité. Sortis
// de `pages/admin/tasks/index.tsx` (règle A7, lot 3).

// Pastille de label : couleur de fond via la définition du board (texte lisible
// calculé), fallback gris neutre si le nom n'a pas de définition (ex. label
// supprimé mais toujours porté par la carte).
import { useEffect, useState } from 'react';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import Chip from '@/features/admin/_shared/ui/Chip';
import {
  groupMyTasks,
  humanizeActivity,
  priorityLabel,
  priorityTone,
  readableTextColor,
  relativeTime,
  type BoardLabel,
  type Dict,
  type MyTask,
  type TaskActivity,
} from '@/components/admin/tasks/taskBoardModel';

const SURFACE =
  'rounded-[var(--r-card,14px)] border border-[var(--line,rgba(194,196,201,.12))] bg-[var(--s1,#100812)]';

export function LabelPill({
  name,
  def,
  size = 'sm',
}: {
  name: string;
  def: BoardLabel | undefined;
  size?: 'xs' | 'sm';
}) {
  const pad =
    size === 'xs' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-xs';
  if (!def) {
    return (
      <span
        className={`rounded-[3px] ${pad} border border-[var(--line2,rgba(194,196,201,.2))] text-[var(--t3,#a39ba6)]`}
      >
        {name}
      </span>
    );
  }
  return (
    <span
      className={`rounded-[3px] ${pad} font-medium`}
      style={{
        backgroundColor: def.color,
        color: readableTextColor(def.color),
      }}
    >
      {name}
    </span>
  );
}

// Ligne d'édition d'un label du board (état local synchronisé sur le prop).
export function LabelManagerRow({
  t,
  label,
  busy,
  onSave,
  onDelete,
}: {
  t: Dict;
  label: BoardLabel;
  busy: boolean;
  onSave: (patch: { name?: string; color?: string }) => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(label.name);
  const [color, setColor] = useState(label.color);
  useEffect(() => {
    setName(label.name);
    setColor(label.color);
  }, [label.name, label.color]);
  const trimmed = name.trim();
  const dirty = trimmed !== label.name || color !== label.color;
  return (
    <li className={`flex items-center gap-2 p-2 ${SURFACE}`}>
      <input
        type="color"
        value={color}
        onChange={(e) => setColor(e.target.value)}
        aria-label={`${t.labelColorField} : ${label.name}`}
        className="h-8 w-10 flex-shrink-0 cursor-pointer rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-transparent"
      />
      <input
        type="text"
        value={name}
        maxLength={40}
        onChange={(e) => setName(e.target.value)}
        aria-label={`${t.labelNameField} : ${label.name}`}
        className="min-w-0 flex-1 rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] px-2 py-1 text-sm text-[var(--t1,#f4edf7)] outline-none focus:border-[var(--or,#b467d1)]"
      />
      <LabelPill
        name={trimmed || label.name}
        def={{ ...label, name: trimmed || label.name, color }}
      />
      <AdminButton
        variant="secondary"
        size="xs"
        disabled={busy || !dirty || !trimmed}
        onClick={() => onSave({ name: trimmed, color })}
      >
        {t.labelRenameSave}
      </AdminButton>
      <AdminButton
        variant="danger"
        size="xs"
        disabled={busy}
        onClick={onDelete}
        title={t.labelDeleteAction}
        aria-label={`${t.labelDeleteAction} : ${label.name}`}
        className="!px-2"
      >
        ✕
      </AdminButton>
    </li>
  );
}

// Vue transverse « Mes tâches » : cartes assignées groupées par échéance.
export function MyTasksView({
  t,
  tasks,
  loading,
  onOpen,
}: {
  t: Dict;
  tasks: MyTask[];
  loading: boolean;
  onOpen: (task: MyTask) => void;
}) {
  if (loading) {
    return (
      <div className={`p-4 text-sm text-[var(--t3,#a39ba6)] ${SURFACE}`}>
        {t.loading}
      </div>
    );
  }
  if (tasks.length === 0) {
    return (
      <div className={`p-8 text-center ${SURFACE}`}>
        <p className="text-sm text-[var(--t2,#c7bfca)]">{t.myTasksEmpty}</p>
      </div>
    );
  }
  const groups = groupMyTasks(tasks);
  const sections: {
    key: string;
    label: string;
    items: MyTask[];
    tone: string;
  }[] = [
    {
      key: 'overdue',
      label: t.myGroupOverdue,
      items: groups.overdue,
      tone: 'text-[var(--err,#ff6b6b)]',
    },
    {
      key: 'today',
      label: t.myGroupToday,
      items: groups.today,
      tone: 'text-[var(--warn,#f5a524)]',
    },
    {
      key: 'upcoming',
      label: t.myGroupUpcoming,
      items: groups.upcoming,
      tone: 'text-[var(--t1,#f4edf7)]',
    },
    {
      key: 'noDue',
      label: t.myGroupNoDue,
      items: groups.noDue,
      tone: 'text-[var(--t3,#a39ba6)]',
    },
  ];
  return (
    <div className="space-y-6">
      <p className="text-sm text-[var(--t3,#a39ba6)]">{t.myTasksSubtitle}</p>
      {sections
        .filter((s) => s.items.length > 0)
        .map((s) => (
          <section key={s.key}>
            <h2
              className={`mb-2 font-[family-name:var(--fd)] text-sm font-bold uppercase tracking-[0.04em] ${s.tone}`}
            >
              {s.label}{' '}
              <span className="text-[var(--t4,#807984)]" data-numeric>
                ({s.items.length})
              </span>
            </h2>
            <ul className="space-y-2">
              {s.items.map((task) => (
                <li key={task.id}>
                  <button
                    type="button"
                    onClick={() => onOpen(task)}
                    title={t.myTaskOpen}
                    className="w-full rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] p-3 text-left transition-colors hover:border-[var(--or,#b467d1)]"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="flex-1 text-sm font-medium leading-snug text-[var(--t1,#f4edf7)]">
                        {task.title}
                      </p>
                      <Chip tone={priorityTone(task.priority)}>
                        {priorityLabel(t, task.priority)}
                      </Chip>
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-[var(--t3,#a39ba6)]">
                      {task.boardName && <Chip>{task.boardName}</Chip>}
                      {task.columnName && (
                        <Chip tone={task.columnIsDone ? 'ok' : 'neutral'}>
                          {task.columnName}
                          {task.columnIsDone ? ` · ${t.myTaskDone}` : ''}
                        </Chip>
                      )}
                      {task.dueDate && (
                        <span
                          className={
                            s.key === 'overdue'
                              ? 'font-medium text-[var(--err,#ff6b6b)]'
                              : 'text-[var(--t2,#c7bfca)]'
                          }
                        >
                          {task.dueDate.slice(0, 10)}
                        </span>
                      )}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
    </div>
  );
}

// Timeline d'activité humanisée d'une carte (repliable au-delà de 5 entrées).
export function ActivitySection({
  t,
  locale,
  activity,
  loading,
  expanded,
  onToggleExpanded,
}: {
  t: Dict;
  locale: string;
  activity: TaskActivity[];
  loading: boolean;
  expanded: boolean;
  onToggleExpanded: () => void;
}) {
  const COLLAPSED = 5;
  const visible = expanded ? activity : activity.slice(0, COLLAPSED);
  return (
    <section>
      <h3 className="mb-2 text-sm font-semibold text-[var(--t1,#f4edf7)]">
        {t.activityTitle}
      </h3>
      {loading ? (
        <p className="text-xs text-[var(--t4,#807984)]">{t.loading}</p>
      ) : activity.length === 0 ? (
        <p className="text-xs text-[var(--t4,#807984)]">{t.activityEmpty}</p>
      ) : (
        <>
          <ol className="space-y-2">
            {visible.map((a, i) => (
              <li key={i} className="flex items-start gap-2 text-xs">
                <span
                  className="mt-1 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-[var(--or,#b467d1)]"
                  aria-hidden="true"
                />
                <div className="flex-1">
                  <span className="font-medium text-[var(--t1,#f4edf7)]">
                    {a.actorName ?? t.unknownAuthor}
                  </span>{' '}
                  <span className="text-[var(--t3,#a39ba6)]">
                    {humanizeActivity(t, a.action)}
                  </span>
                  <span className="text-[var(--t4,#807984)]"> · </span>
                  <time
                    className="text-[var(--t4,#807984)]"
                    dateTime={a.createdAt}
                    title={a.createdAt}
                  >
                    {relativeTime(a.createdAt, locale)}
                  </time>
                </div>
              </li>
            ))}
          </ol>
          {activity.length > COLLAPSED && (
            <button
              type="button"
              onClick={onToggleExpanded}
              className="mt-2 text-xs text-[var(--or-200,#eec4ff)] hover:text-[var(--t1,#f4edf7)]"
            >
              {expanded ? t.activityShowLess : t.activityShowMore}
            </button>
          )}
        </>
      )}
    </section>
  );
}
