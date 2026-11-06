// features/admin/tasks/taskBoardRules.ts — règles PURES du tableau de tâches
// staff ajoutées en lot « améliorations du Kanban » (2026-11-06) : échéances
// relatives, plan d'un déplacement de carte, place de dépôt, saisie non
// enregistrée. Sorties de components/admin/tasks/taskBoardModel.ts, dont la
// taille est gelée par le cliquet de dette admin (fichiers > 600 lignes).
// Aucun rendu ici.

import type {
  BoardDetail,
  BoardDetailColumn,
  BoardTask,
  Priority,
} from '@/components/admin/tasks/taskBoardModel';

/**
 * Jour d'échéance en date LOCALE (minuit). `new Date('2026-11-06')` se lit en
 * UTC : à l'ouest de Greenwich, la veille ; on lit donc les trois nombres.
 */
export function parseDueDate(dueDate: string | null): Date | null {
  if (!dueDate) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dueDate);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Jours entre aujourd'hui (minuit local) et l'échéance : 0 = aujourd'hui. */
export function daysUntilDue(
  dueDate: string | null,
  now: Date = new Date()
): number | null {
  const d = parseDueDate(dueDate);
  if (!d) return null;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((d.getTime() - today.getTime()) / 86_400_000);
}

export function isOverdue(
  dueDate: string | null,
  columnIsDone: boolean,
  now: Date = new Date()
): boolean {
  if (columnIsDone) return false;
  const days = daysUntilDue(dueDate, now);
  return days != null && days < 0;
}

/**
 * État d'une échéance : `overdue` (passée), `soon` (aujourd'hui ou demain —
 * le rappel J-1 du bot part à ce moment-là), `later`, `done` (colonne
 * terminale : plus de signal).
 */
export type DueState = 'overdue' | 'soon' | 'later' | 'done';

export type DueInfo = {
  /** « aujourd'hui », « demain », « dans 3 jours », « 12 nov. »… */
  label: string;
  /** Date complète (infobulle). */
  title: string;
  state: DueState;
};

/** Au-delà de ±6 jours, la date courte se lit mieux que « dans 23 jours ». */
const DUE_RELATIVE_DAYS = 6;

export function dueInfo(
  dueDate: string | null,
  columnIsDone: boolean,
  locale: string,
  now: Date = new Date()
): DueInfo | null {
  const d = parseDueDate(dueDate);
  const days = daysUntilDue(dueDate, now);
  if (!d || days == null) return null;
  const sameYear = d.getFullYear() === now.getFullYear();
  const label =
    Math.abs(days) <= DUE_RELATIVE_DAYS
      ? new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(
          days,
          'day'
        )
      : d.toLocaleDateString(locale, {
          day: 'numeric',
          month: 'short',
          ...(sameYear ? {} : { year: 'numeric' }),
        });
  const title = d.toLocaleDateString(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  let state: DueState;
  if (columnIsDone) state = 'done';
  else if (days < 0) state = 'overdue';
  else if (days <= 1) state = 'soon';
  else state = 'later';
  return { label, title, state };
}

/** Couleur du texte d'une échéance selon son état (jetons « Le Ruban »). */
export function dueToneClass(state: DueState): string {
  switch (state) {
    case 'overdue':
      return 'font-medium text-[var(--err,#ff6b6b)]';
    case 'soon':
      return 'font-medium text-[var(--warn,#f5a524)]';
    case 'done':
      return 'text-[var(--t4,#807984)]';
    default:
      return 'text-[var(--t3,#a39ba6)]';
  }
}

// ---------------------------------------------------------------------------
// Déplacement d'une carte (glisser-déposer, sélecteur de colonne)
// ---------------------------------------------------------------------------

export type MovePlan = {
  /** Board après le déplacement, `position` renumérotées 0..n-1. */
  detail: BoardDetail;
  /** Place visée parmi les AUTRES cartes (visibles) de la colonne. */
  position: number;
  /**
   * Ce qu'on envoie à l'API : `null` = « à la fin » pour un changement de
   * colonne (l'API compte aussi les cartes terminées masquées : un index
   * calculé sur les seules visibles tomberait au milieu d'elles).
   */
  apiPosition: number | null;
};

const byPositionThenId = (a: BoardTask, b: BoardTask) =>
  a.position - b.position || a.id.localeCompare(b.id);

/**
 * Plan d'un déplacement : la carte `taskId` va dans `toColumnId` à l'index
 * `index` parmi les autres cartes de cette colonne (`null` = à la fin).
 * `null` = rien à faire (carte introuvable, ou déjà à cette place).
 *
 * Les `position` des colonnes touchées sont RENUMÉROTÉES : l'affichage trie
 * par `position` (tri « Manuel »), un tableau réordonné qui garderait les
 * anciens nombres reviendrait à l'ancien ordre. L'API renumérote pareil.
 */
export function planMove(
  detail: BoardDetail,
  taskId: string,
  toColumnId: string,
  index: number | null
): MovePlan | null {
  const from = detail.columns.find((c) => c.tasks.some((t) => t.id === taskId));
  const to = detail.columns.find((c) => c.id === toColumnId);
  if (!from || !to) return null;
  const moving = from.tasks.find((t) => t.id === taskId) as BoardTask;
  const others = [...to.tasks]
    .filter((t) => t.id !== taskId)
    .sort(byPositionThenId);
  const position = Math.max(
    0,
    Math.min(index == null ? others.length : index, others.length)
  );
  if (from.id === to.id) {
    const current = [...from.tasks]
      .sort(byPositionThenId)
      .findIndex((t) => t.id === taskId);
    if (current === position) return null;
  }
  const renumber = (tasks: BoardTask[]) =>
    tasks.map((t, i) => (t.position === i ? t : { ...t, position: i }));
  const columns = detail.columns.map((c) => {
    if (c.id === to.id) {
      return {
        ...c,
        tasks: renumber([
          ...others.slice(0, position),
          moving,
          ...others.slice(position),
        ]),
      };
    }
    if (c.id === from.id) {
      return {
        ...c,
        tasks: renumber(
          [...c.tasks].filter((t) => t.id !== taskId).sort(byPositionThenId)
        ),
      };
    }
    return c;
  });
  const apiPosition =
    from.id !== to.id && position === others.length ? null : position;
  return { detail: { ...detail, columns }, position, apiPosition };
}

/**
 * Index de dépôt parmi les autres cartes de la colonne : juste avant la carte
 * visée, ou juste après si `after` (moitié basse). `null` = dépôt sans effet
 * (la carte lâchée sur elle-même).
 */
export function dropIndexAt(
  column: BoardDetailColumn,
  taskId: string,
  targetTaskId: string,
  after: boolean
): number | null {
  if (taskId === targetTaskId) return null;
  const others = [...column.tasks]
    .filter((t) => t.id !== taskId)
    .sort(byPositionThenId);
  const idx = others.findIndex((t) => t.id === targetTaskId);
  if (idx < 0) return others.length;
  return after ? idx + 1 : idx;
}

// ---------------------------------------------------------------------------
// Fenêtre de carte : modifications non enregistrées
// ---------------------------------------------------------------------------

export type CardFormSnapshot = {
  title: string;
  description: string;
  priority: Priority;
  due: string;
  assignee: string;
  labelNames: string[];
  columnId: string | null;
};

/** Vrai si la saisie diffère de ce que la fenêtre montrait à l'ouverture. */
export function isCardFormDirty(
  initial: CardFormSnapshot | null,
  current: CardFormSnapshot
): boolean {
  if (!initial) return false;
  return (
    initial.title.trim() !== current.title.trim() ||
    initial.description.trim() !== current.description.trim() ||
    initial.priority !== current.priority ||
    initial.due !== current.due ||
    initial.assignee !== current.assignee ||
    initial.columnId !== current.columnId ||
    initial.labelNames.length !== current.labelNames.length ||
    initial.labelNames.some((n, i) => current.labelNames[i] !== n)
  );
}
