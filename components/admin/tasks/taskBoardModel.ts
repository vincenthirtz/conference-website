// components/admin/tasks/taskBoardModel.ts
//
// Types, constantes et helpers PURS du tableau de tâches staff. Sortis de
// `pages/admin/tasks/index.tsx` (règle A7, lot 3) : aucun rendu ici.

import { formatDateHeader, formatTime } from '@/utils/dateFormatters';
import type nsAdminTaskBoard from '@/lib/i18n/locales/admin-fr/adminTaskBoard';
import type { ChipTone } from '@/features/admin/_shared/ui/Chip';
import { daysUntilDue } from '@/features/admin/tasks/taskBoardRules';

export type Dict = typeof nsAdminTaskBoard.fr;

export type StaffShape = {
  id: string;
  role: string;
  display_name: string | null;
};

export type StaffProps = { staff: StaffShape };

export type Priority = 'low' | 'medium' | 'high' | 'urgent';

export const PRIORITIES: Priority[] = ['low', 'medium', 'high', 'urgent'];

// Rang de tri par priorité (urgent en premier). Plus petit = plus haut.
export const PRIORITY_RANK: Record<Priority, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
};

export type BoardListColumn = {
  id: string;
  name: string;
  position: number;
  wipLimit: number | null;
  isDone: boolean;
  cardCount: number;
};

export type BoardListItem = {
  id: string;
  name: string;
  description: string | null;
  position: number;
  isArchived: boolean;
  columns: BoardListColumn[];
};

export type CardAssignee = { staffId: string; name: string | null };

export type BoardTask = {
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

export type BoardDetailColumn = {
  id: string;
  name: string;
  position: number;
  wipLimit: number | null;
  isDone: boolean;
  /** Cartes terminées depuis plus de 30 jours, masquées (non chargées). */
  archivedCount?: number;
  tasks: BoardTask[];
};

// Définition d'un label coloré du board (couleur des pastilles, lookup par nom).
export type BoardLabel = {
  id: string;
  name: string;
  color: string;
  position: number;
};

export type BoardDetail = {
  id: string;
  name: string;
  description: string | null;
  position: number;
  isArchived: boolean;
  labels: BoardLabel[];
  columns: BoardDetailColumn[];
};

// Vue transverse « Mes tâches » (GET /api/admin/tasks/my).
export type MyTask = {
  id: string;
  title: string;
  description: string | null;
  boardId: string;
  boardName: string | null;
  columnId: string;
  columnName: string | null;
  columnIsDone: boolean;
  priority: Priority;
  assigneeStaffId: string | null;
  assigneeName: string | null;
  dueDate: string | null;
  labels: string[];
};

// Carte soft-deleted listée dans la corbeille (GET /tasks/deleted).
export type DeletedTask = {
  id: string;
  title: string;
  boardId: string;
  boardName: string | null;
  columnId: string;
  columnName: string | null;
  priority: Priority;
  dueDate: string | null;
  deletedAt: string;
};

// Mode de tri d'affichage des cartes dans une colonne (client-side).
export type CardSort = 'manual' | 'priority' | 'due';

// Entrée brute de la timeline d'activité (GET /tasks/{id}/activity).
export type TaskActivity = {
  action: string;
  actorName: string | null;
  createdAt: string;
  payload: Record<string, unknown> | null;
};

export type StaffOption = { id: string; name: string };

export type TaskComment = {
  id: string;
  body: string;
  authorStaffId: string | null;
  authorName: string | null;
  createdAt: string;
  /** Date de la dernière modification ; `null` (ou absent) = jamais modifié. */
  editedAt?: string | null;
};

export type ChecklistItem = {
  id: string;
  label: string;
  isDone: boolean;
  position: number;
};

// Valeur sentinelle du filtre assigné : cartes sans assigné (distincte de
// "tous" = chaîne vide).
export const FILTER_UNASSIGNED = '__unassigned__';

// ---------------------------------------------------------------------------
// Helpers présentation
// ---------------------------------------------------------------------------

export function priorityLabel(t: Dict, p: Priority): string {
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

// Ton de puce « Le Ruban » par priorité (couleur de signal ; « moyenne » en
// marque, faute de signal dédié).
export function priorityTone(p: Priority): ChipTone {
  switch (p) {
    case 'low':
      return 'neutral';
    case 'medium':
      return 'brand';
    case 'high':
      return 'warn';
    case 'urgent':
      return 'err';
  }
}

export function initials(name: string | null): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// Tri d'affichage des cartes d'une colonne (client-side, ne touche pas
// `position` en base). `position` reste le départage stable dans tous les cas.
export function sortTasksForDisplay(
  tasks: BoardTask[],
  mode: CardSort
): BoardTask[] {
  const byPosition = (a: BoardTask, b: BoardTask) => a.position - b.position;
  if (mode === 'priority') {
    return [...tasks].sort((a, b) => {
      const d = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
      return d !== 0 ? d : a.position - b.position;
    });
  }
  if (mode === 'due') {
    return [...tasks].sort((a, b) => {
      // Échéances renseignées d'abord (asc), puis les sans-échéance.
      if (a.dueDate && b.dueDate) {
        const d = a.dueDate.localeCompare(b.dueDate);
        return d !== 0 ? d : a.position - b.position;
      }
      if (a.dueDate) return -1;
      if (b.dueDate) return 1;
      return a.position - b.position;
    });
  }
  return [...tasks].sort(byPosition);
}

export function formatCommentDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${formatDateHeader(iso)} · ${formatTime(iso)}`;
}

// Choix noir/blanc pour un texte lisible sur un fond `#rrggbb` (luminance
// relative sRGB, seuil WCAG ~0.179). Fallback blanc si couleur illisible.
export function readableTextColor(hex: string): string {
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m) return '#ffffff';
  const int = parseInt(m[1], 16);
  const r = (int >> 16) & 0xff;
  const g = (int >> 8) & 0xff;
  const b = int & 0xff;
  const toLin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  const L = 0.2126 * toLin(r) + 0.7152 * toLin(g) + 0.0722 * toLin(b);
  return L > 0.179 ? '#000000' : '#ffffff';
}

/** Noms connus pour humaniser l'activité (colonnes du board, staff). */
export type ActivityNames = {
  columnNameById: Map<string, string>;
  staffNameById: Map<string, string>;
};

const fillTemplate = (tpl: string, values: Record<string, string>) =>
  tpl.replace(/\{(\w+)\}/g, (all, k: string) => values[k] ?? all);

const str = (v: unknown): string | null =>
  typeof v === 'string' && v !== '' ? v : null;

function fieldLabel(t: Dict, field: string): string | null {
  switch (field) {
    case 'title':
      return t.activityFieldTitle;
    case 'description':
      return t.activityFieldDescription;
    case 'priority':
      return t.activityFieldPriority;
    case 'dueDate':
      return t.activityFieldDueDate;
    case 'labels':
      return t.activityFieldLabels;
    default:
      return null;
  }
}

/**
 * Humanise une action brute de staff_logs. Le payload (clés écrites par
 * conference-api : `from_column_id`/`to_column_id` du déplacement,
 * `column_id` de la création, `assignee_staff_id` de l'assignation,
 * `fields` de l'édition) précise le libellé quand les noms sont connus ;
 * sinon, libellé générique.
 */
export function humanizeActivity(
  t: Dict,
  action: string,
  payload?: Record<string, unknown> | null,
  names?: ActivityNames
): string {
  const p = payload ?? {};
  const column = (id: unknown) => {
    const key = str(id);
    return key ? (names?.columnNameById.get(key) ?? null) : null;
  };
  switch (action) {
    case 'task_create': {
      const name = column(p.column_id);
      return name
        ? fillTemplate(t.activityTaskCreateIn, { column: name })
        : t.activityTaskCreate;
    }
    case 'task_update': {
      const fields = Array.isArray(p.fields)
        ? (p.fields as unknown[])
            .map((f) => (typeof f === 'string' ? fieldLabel(t, f) : null))
            .filter((f): f is string => !!f)
        : [];
      return fields.length > 0
        ? fillTemplate(t.activityTaskUpdateFields, {
            fields: Array.from(new Set(fields)).join(', '),
          })
        : t.activityTaskUpdate;
    }
    case 'task_move': {
      const fromId = str(p.from_column_id);
      const toId = str(p.to_column_id);
      if (fromId && toId && fromId === toId) {
        const name = column(toId);
        return name
          ? fillTemplate(t.activityTaskReorder, { column: name })
          : t.activityTaskMove;
      }
      const from = column(fromId);
      const to = column(toId);
      if (from && to) {
        return fillTemplate(t.activityTaskMoveBetween, { from, to });
      }
      return to
        ? fillTemplate(t.activityTaskMoveTo, { to })
        : t.activityTaskMove;
    }
    case 'task_assign': {
      if (!('assignee_staff_id' in p)) return t.activityTaskAssign;
      const id = str(p.assignee_staff_id);
      if (!id) return t.activityTaskUnassign;
      const name = names?.staffNameById.get(id);
      // `from_assignee_staff_id` : journalisé depuis le 2026-11-06.
      const fromId = str(p.from_assignee_staff_id);
      const from = fromId ? names?.staffNameById.get(fromId) : undefined;
      if (name && from && fromId !== id) {
        return fillTemplate(t.activityTaskReassign, { from, to: name });
      }
      return name
        ? fillTemplate(t.activityTaskAssignTo, { name })
        : t.activityTaskAssign;
    }
    case 'task_restore':
      return t.activityTaskRestore;
    case 'task_delete':
      return t.activityTaskDelete;
    case 'task_comment_create':
      return t.activityTaskCommentCreate;
    case 'task_comment_update':
      return t.activityTaskCommentUpdate;
    case 'task_comment_delete':
      return t.activityTaskCommentDelete;
    default:
      if (action.startsWith('task_label')) return t.activityTaskLabel;
      return t.activityUnknownAction;
  }
}

// Date relative locale-aware (zéro dépendance : Intl.RelativeTimeFormat).
export function relativeTime(iso: string, locale: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return iso;
  const diffMs = then - Date.now();
  const abs = Math.abs(diffMs);
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  const min = 60_000;
  const hour = 60 * min;
  const day = 24 * hour;
  if (abs < min) return rtf.format(Math.round(diffMs / 1000), 'second');
  if (abs < hour) return rtf.format(Math.round(diffMs / min), 'minute');
  if (abs < day) return rtf.format(Math.round(diffMs / hour), 'hour');
  if (abs < 30 * day) return rtf.format(Math.round(diffMs / day), 'day');
  return new Date(iso).toLocaleDateString(locale);
}

export const DEFAULT_LABEL_COLORS = [
  '#ef4444',
  '#f59e0b',
  '#10b981',
  '#3b82f6',
  '#8b5cf6',
  '#ec4899',
];

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

// Regroupe les cartes « Mes tâches » par échéance relative. Les cartes d'une
// colonne terminale forment leur propre groupe, en dernier : terminées, elles
// ne sont ni « en retard » ni « à venir » (l'API n'envoie que celles des 30
// derniers jours).
export function groupMyTasks(
  tasks: MyTask[],
  now: Date = new Date()
): {
  overdue: MyTask[];
  today: MyTask[];
  upcoming: MyTask[];
  noDue: MyTask[];
  done: MyTask[];
} {
  const out = {
    overdue: [] as MyTask[],
    today: [] as MyTask[],
    upcoming: [] as MyTask[],
    noDue: [] as MyTask[],
    done: [] as MyTask[],
  };
  for (const task of tasks) {
    if (task.columnIsDone) {
      out.done.push(task);
      continue;
    }
    const days = daysUntilDue(task.dueDate, now);
    if (days == null) out.noDue.push(task);
    else if (days === 0) out.today.push(task);
    else if (days < 0) out.overdue.push(task);
    else out.upcoming.push(task);
  }
  return out;
}
