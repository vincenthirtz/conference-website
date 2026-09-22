// components/admin/tasks/TaskBoardParts.tsx
//
// Sous-composants du tableau de tâches staff : pastille d'étiquette, ligne du
// gestionnaire d'étiquettes, vue « mes tâches », section d'activité. Sortis
// de `pages/admin/tasks/index.tsx` (règle A7, lot 3).

// Pastille de label : couleur de fond via la définition du board (texte lisible
// calculé), fallback gris neutre si le nom n'a pas de définition (ex. label
// supprimé mais toujours porté par la carte).
import { useEffect, useState } from 'react';
import {
  groupMyTasks,
  humanizeActivity,
  priorityClasses,
  priorityLabel,
  readableTextColor,
  relativeTime,
  type BoardLabel,
  type Dict,
  type MyTask,
  type TaskActivity,
} from '@/components/admin/tasks/taskBoardModel';

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
        className={`rounded ${pad} bg-white/5 border border-white/10 text-neutral-300`}
      >
        {name}
      </span>
    );
  }
  return (
    <span
      className={`rounded ${pad} font-medium`}
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
    <li className="flex items-center gap-2 rounded-lg bg-white/5 border border-white/10 p-2">
      <input
        type="color"
        value={color}
        onChange={(e) => setColor(e.target.value)}
        aria-label={`${t.labelColorField} : ${label.name}`}
        className="h-8 w-10 rounded bg-transparent border border-white/20 cursor-pointer flex-shrink-0"
      />
      <input
        type="text"
        value={name}
        maxLength={40}
        onChange={(e) => setName(e.target.value)}
        aria-label={`${t.labelNameField} : ${label.name}`}
        className="flex-1 min-w-0 px-2 py-1 rounded bg-white/10 border border-white/20 text-white text-sm"
      />
      <LabelPill
        name={trimmed || label.name}
        def={{ ...label, name: trimmed || label.name, color }}
      />
      <button
        type="button"
        disabled={busy || !dirty || !trimmed}
        onClick={() => onSave({ name: trimmed, color })}
        className="px-2 py-1 rounded bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white text-xs font-medium"
      >
        {t.labelRenameSave}
      </button>
      <button
        type="button"
        disabled={busy}
        onClick={onDelete}
        title={t.labelDeleteAction}
        aria-label={`${t.labelDeleteAction} : ${label.name}`}
        className="px-2 py-1 rounded bg-red-600/20 border border-red-500/30 text-red-200 text-xs hover:bg-red-600/40 disabled:opacity-40"
      >
        ✕
      </button>
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
      <div className="p-4 rounded-xl bg-white/5 border border-white/10 text-sm text-neutral-300">
        {t.loading}
      </div>
    );
  }
  if (tasks.length === 0) {
    return (
      <div className="p-8 rounded-xl bg-white/5 border border-white/10 text-center">
        <p className="text-sm text-neutral-200">{t.myTasksEmpty}</p>
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
      tone: 'text-red-300',
    },
    {
      key: 'today',
      label: t.myGroupToday,
      items: groups.today,
      tone: 'text-amber-300',
    },
    {
      key: 'upcoming',
      label: t.myGroupUpcoming,
      items: groups.upcoming,
      tone: 'text-neutral-200',
    },
    {
      key: 'noDue',
      label: t.myGroupNoDue,
      items: groups.noDue,
      tone: 'text-neutral-400',
    },
  ];
  return (
    <div className="space-y-6">
      <p className="text-sm text-neutral-400">{t.myTasksSubtitle}</p>
      {sections
        .filter((s) => s.items.length > 0)
        .map((s) => (
          <section key={s.key}>
            <h2 className={`text-sm font-semibold mb-2 ${s.tone}`}>
              {s.label}{' '}
              <span className="text-neutral-500">({s.items.length})</span>
            </h2>
            <ul className="space-y-2">
              {s.items.map((task) => (
                <li key={task.id}>
                  <button
                    type="button"
                    onClick={() => onOpen(task)}
                    title={t.myTaskOpen}
                    className="w-full text-left rounded-lg bg-neutral-900/80 border border-white/10 p-3 hover:border-indigo-500/40 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="text-sm font-medium leading-snug flex-1">
                        {task.title}
                      </p>
                      <span
                        className={`flex-shrink-0 px-1.5 py-0.5 rounded text-[10px] border ${priorityClasses(
                          task.priority
                        )}`}
                      >
                        {priorityLabel(t, task.priority)}
                      </span>
                    </div>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2 text-[11px] text-neutral-400">
                      {task.boardName && (
                        <span className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10">
                          {task.boardName}
                        </span>
                      )}
                      {task.columnName && (
                        <span
                          className={`px-1.5 py-0.5 rounded border ${
                            task.columnIsDone
                              ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                              : 'bg-white/5 border-white/10'
                          }`}
                        >
                          {task.columnName}
                          {task.columnIsDone ? ` · ${t.myTaskDone}` : ''}
                        </span>
                      )}
                      {task.dueDate && (
                        <span
                          className={
                            s.key === 'overdue'
                              ? 'text-red-400 font-medium'
                              : 'text-neutral-300'
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
      <h3 className="text-sm font-semibold text-neutral-200 mb-2">
        {t.activityTitle}
      </h3>
      {loading ? (
        <p className="text-xs text-neutral-500">{t.loading}</p>
      ) : activity.length === 0 ? (
        <p className="text-xs text-neutral-500">{t.activityEmpty}</p>
      ) : (
        <>
          <ol className="space-y-2">
            {visible.map((a, i) => (
              <li key={i} className="flex items-start gap-2 text-xs">
                <span
                  className="mt-1 w-1.5 h-1.5 rounded-full bg-indigo-400 flex-shrink-0"
                  aria-hidden="true"
                />
                <div className="flex-1">
                  <span className="text-neutral-200 font-medium">
                    {a.actorName ?? t.unknownAuthor}
                  </span>{' '}
                  <span className="text-neutral-400">
                    {humanizeActivity(t, a.action)}
                  </span>
                  <span className="text-neutral-600"> · </span>
                  <time
                    className="text-neutral-500"
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
              className="mt-2 text-xs text-indigo-300 hover:text-indigo-200"
            >
              {expanded ? t.activityShowLess : t.activityShowMore}
            </button>
          )}
        </>
      )}
    </section>
  );
}
