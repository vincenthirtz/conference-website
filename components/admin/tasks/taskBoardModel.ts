// components/admin/tasks/taskBoardModel.ts
//
// Types, constantes et helpers PURS du tableau de tâches staff. Sortis de
// `pages/admin/tasks/index.tsx` (règle A7, lot 3) : aucun rendu ici.

import { formatDateHeader, formatTime } from '@/utils/dateFormatters';
import type nsAdminTaskBoard from '@/lib/i18n/locales/admin-fr/adminTaskBoard';

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

export function priorityClasses(p: Priority): string {
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

export function initials(name: string | null): string {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function isOverdue(
  dueDate: string | null,
  columnIsDone: boolean
): boolean {
  if (!dueDate || columnIsDone) return false;
  const d = new Date(dueDate);
  if (Number.isNaN(d.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return d.getTime() < today.getTime();
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

// Humanise une action brute de staff_logs en libellé i18n.
export function humanizeActivity(t: Dict, action: string): string {
  switch (action) {
    case 'task_create':
      return t.activityTaskCreate;
    case 'task_update':
      return t.activityTaskUpdate;
    case 'task_move':
      return t.activityTaskMove;
    case 'task_assign':
      return t.activityTaskAssign;
    case 'task_delete':
      return t.activityTaskDelete;
    case 'task_comment_create':
      return t.activityTaskCommentCreate;
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

// Regroupe les cartes « Mes tâches » par échéance relative.
export function groupMyTasks(tasks: MyTask[]): {
  overdue: MyTask[];
  today: MyTask[];
  upcoming: MyTask[];
  noDue: MyTask[];
} {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const out = {
    overdue: [] as MyTask[],
    today: [] as MyTask[],
    upcoming: [] as MyTask[],
    noDue: [] as MyTask[],
  };
  for (const task of tasks) {
    if (!task.dueDate) {
      out.noDue.push(task);
      continue;
    }
    const d = new Date(task.dueDate);
    d.setHours(0, 0, 0, 0);
    const time = d.getTime();
    if (time === today.getTime()) out.today.push(task);
    else if (time < today.getTime()) {
      // Une carte dans une colonne terminale n'est jamais « en retard ».
      if (task.columnIsDone) out.upcoming.push(task);
      else out.overdue.push(task);
    } else out.upcoming.push(task);
  }
  return out;
}
