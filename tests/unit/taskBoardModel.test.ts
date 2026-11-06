// Règles pures du tableau de tâches staff (components/admin/tasks/taskBoardModel.ts
// et features/admin/tasks/taskBoardRules.ts) :
// plan d'un déplacement de carte, place de dépôt, échéances relatives,
// groupes de « Mes tâches », activité humanisée, saisie non enregistrée.

import { describe, expect, it } from 'vitest';
import {
  type BoardDetail,
  type BoardTask,
  groupMyTasks,
  humanizeActivity,
  type MyTask,
  sortTasksForDisplay,
} from '@/components/admin/tasks/taskBoardModel';
import {
  daysUntilDue,
  dropIndexAt,
  dueInfo,
  isCardFormDirty,
  isOverdue,
  parseDueDate,
  planMove,
} from '@/features/admin/tasks/taskBoardRules';
import nsAdminTaskBoard from '@/lib/i18n/locales/admin-fr/adminTaskBoard';

const t = nsAdminTaskBoard.fr;

function card(id: string, position: number): BoardTask {
  return {
    id,
    title: id,
    description: null,
    priority: 'medium',
    position,
    dueDate: null,
    labels: [],
    assignee: null,
    checklist: { done: 0, total: 0 },
    commentCount: 0,
  };
}

function board(cols: Record<string, BoardTask[]>): BoardDetail {
  return {
    id: 'b1',
    name: 'Board',
    description: null,
    position: 0,
    isArchived: false,
    labels: [],
    columns: Object.entries(cols).map(([id, tasks], i) => ({
      id,
      name: id.toUpperCase(),
      position: i,
      wipLimit: null,
      isDone: false,
      tasks,
    })),
  };
}

/** Ordre affiché (tri « Manuel ») d'une colonne. */
function shown(detail: BoardDetail, columnId: string): string[] {
  const col = detail.columns.find((c) => c.id === columnId);
  return sortTasksForDisplay(col?.tasks ?? [], 'manual').map((c) => c.id);
}

describe('planMove', () => {
  it('réordonner dans une colonne s’affiche dans le nouvel ordre (positions renumérotées)', () => {
    const detail = board({ todo: [card('A', 0), card('B', 1), card('C', 2)] });
    const plan = planMove(detail, 'C', 'todo', 0);
    expect(plan).not.toBeNull();
    // Avant le correctif, le tri par l'ancienne `position` remettait A, B, C.
    expect(shown(plan?.detail as BoardDetail, 'todo')).toEqual(['C', 'A', 'B']);
    expect(plan?.position).toBe(0);
    expect(plan?.apiPosition).toBe(0);
  });

  it('une carte venue d’une autre colonne atterrit à la place visée, la colonne de départ se resserre', () => {
    const detail = board({
      todo: [card('X', 5), card('Y', 9)],
      doing: [card('B0', 0), card('B1', 1), card('B2', 2)],
    });
    const plan = planMove(detail, 'X', 'doing', 1) as NonNullable<
      ReturnType<typeof planMove>
    >;
    expect(shown(plan.detail, 'doing')).toEqual(['B0', 'X', 'B1', 'B2']);
    expect(
      plan.detail.columns
        .find((c) => c.id === 'todo')
        ?.tasks.map((c) => [c.id, c.position])
    ).toEqual([['Y', 0]]);
    expect(plan.apiPosition).toBe(1);
  });

  it('positions à trous (cartes supprimées) : la place se lit en index, pas en nombre stocké', () => {
    // A0, X2, B3, C4 : X glissée entre B et C = index 2… qui vaut aussi sa
    // `position` stockée. Ce n'est PAS un « rien à faire ».
    const detail = board({
      todo: [card('A', 0), card('X', 2), card('B', 3), card('C', 4)],
    });
    const plan = planMove(detail, 'X', 'todo', 2);
    expect(plan).not.toBeNull();
    expect(shown(plan?.detail as BoardDetail, 'todo')).toEqual([
      'A',
      'B',
      'X',
      'C',
    ]);
  });

  it('carte lâchée à sa place : rien à faire (ni appel, ni « Carte déplacée »)', () => {
    const detail = board({ todo: [card('A', 0), card('B', 1)] });
    expect(planMove(detail, 'A', 'todo', 0)).toBeNull();
    // « à la fin » alors qu'elle y est déjà
    expect(planMove(detail, 'B', 'todo', null)).toBeNull();
  });

  it('fin d’une autre colonne : l’API reçoit « à la fin » (les terminées masquées comptent chez elle)', () => {
    const detail = board({
      todo: [card('A', 0)],
      done: [card('D', 0)],
    });
    const plan = planMove(detail, 'A', 'done', null);
    expect(plan?.position).toBe(1);
    expect(plan?.apiPosition).toBeNull();
  });

  it('carte ou colonne inconnue : null', () => {
    const detail = board({ todo: [card('A', 0)] });
    expect(planMove(detail, 'Z', 'todo', 0)).toBeNull();
    expect(planMove(detail, 'A', 'nope', 0)).toBeNull();
  });
});

describe('dropIndexAt', () => {
  const col = board({ todo: [card('A', 0), card('B', 1), card('C', 2)] })
    .columns[0];

  it('moitié haute = avant la carte visée, moitié basse = après', () => {
    expect(dropIndexAt(col, 'A', 'C', false)).toBe(1);
    expect(dropIndexAt(col, 'A', 'C', true)).toBe(2);
    // Descendre A d'un cran : lâchée sur la moitié basse de B.
    expect(dropIndexAt(col, 'A', 'B', true)).toBe(1);
  });

  it('lâchée sur elle-même : null', () => {
    expect(dropIndexAt(col, 'B', 'B', false)).toBeNull();
  });

  it('carte visée absente : à la fin', () => {
    expect(dropIndexAt(col, 'A', 'Z', false)).toBe(2);
  });
});

describe('échéances', () => {
  // Jeudi 6 novembre 2026, 15 h, heure locale.
  const now = new Date(2026, 10, 6, 15, 0, 0);

  it('lit le jour en date locale (pas en UTC)', () => {
    const d = parseDueDate('2026-11-06');
    expect(d?.getFullYear()).toBe(2026);
    expect(d?.getMonth()).toBe(10);
    expect(d?.getDate()).toBe(6);
    expect(parseDueDate('pas une date')).toBeNull();
    expect(parseDueDate(null)).toBeNull();
  });

  it('jours restants et retard', () => {
    expect(daysUntilDue('2026-11-06', now)).toBe(0);
    expect(daysUntilDue('2026-11-07', now)).toBe(1);
    expect(daysUntilDue('2026-11-04', now)).toBe(-2);
    expect(isOverdue('2026-11-05', false, now)).toBe(true);
    expect(isOverdue('2026-11-06', false, now)).toBe(false);
    expect(isOverdue('2026-11-05', true, now)).toBe(false);
  });

  it('libellé relatif près d’aujourd’hui, date courte au-delà', () => {
    expect(dueInfo('2026-11-06', false, 'fr', now)?.label).toBe('aujourd’hui');
    expect(dueInfo('2026-11-07', false, 'fr', now)?.label).toBe('demain');
    expect(dueInfo('2026-11-09', false, 'fr', now)?.label).toBe('dans 3 jours');
    expect(dueInfo('2026-11-04', false, 'fr', now)?.label).toBe('avant-hier');
    expect(dueInfo('2026-12-01', false, 'fr', now)?.label).toBe('1 déc.');
    expect(dueInfo('2027-01-15', false, 'fr', now)?.label).toBe(
      '15 janv. 2027'
    );
    expect(dueInfo('2026-11-07', false, 'en', now)?.label).toBe('tomorrow');
    expect(dueInfo(null, false, 'fr', now)).toBeNull();
  });

  it('état : en retard, bientôt (J0 / J-1), plus tard, terminé', () => {
    expect(dueInfo('2026-11-05', false, 'fr', now)?.state).toBe('overdue');
    expect(dueInfo('2026-11-06', false, 'fr', now)?.state).toBe('soon');
    expect(dueInfo('2026-11-07', false, 'fr', now)?.state).toBe('soon');
    expect(dueInfo('2026-11-08', false, 'fr', now)?.state).toBe('later');
    expect(dueInfo('2026-11-01', true, 'fr', now)?.state).toBe('done');
  });
});

describe('groupMyTasks', () => {
  const now = new Date(2026, 10, 6, 9, 0, 0);
  const mk = (
    id: string,
    dueDate: string | null,
    columnIsDone = false
  ): MyTask => ({
    id,
    title: id,
    description: null,
    boardId: 'b',
    boardName: 'B',
    columnId: 'c',
    columnName: 'C',
    columnIsDone,
    priority: 'medium',
    assigneeStaffId: 's',
    assigneeName: 'S',
    dueDate,
    labels: [],
  });

  it('les terminées forment leur groupe, jamais « à venir » ni « en retard »', () => {
    const g = groupMyTasks(
      [
        mk('late', '2026-11-01'),
        mk('today', '2026-11-06'),
        mk('soon', '2026-11-20'),
        mk('none', null),
        mk('doneLate', '2026-11-01', true),
        mk('doneNoDue', null, true),
      ],
      now
    );
    expect(g.overdue.map((x) => x.id)).toEqual(['late']);
    expect(g.today.map((x) => x.id)).toEqual(['today']);
    expect(g.upcoming.map((x) => x.id)).toEqual(['soon']);
    expect(g.noDue.map((x) => x.id)).toEqual(['none']);
    expect(g.done.map((x) => x.id)).toEqual(['doneLate', 'doneNoDue']);
  });
});

describe('humanizeActivity', () => {
  const names = {
    columnNameById: new Map([
      ['c1', 'À faire'],
      ['c2', 'En cours'],
    ]),
    staffNameById: new Map([
      ['s1', 'Alex'],
      ['s2', 'Sam'],
    ]),
  };

  it('déplacement : de / vers, ou réordonnancement', () => {
    expect(
      humanizeActivity(
        t,
        'task_move',
        { from_column_id: 'c1', to_column_id: 'c2' },
        names
      )
    ).toBe('a déplacé la carte de « À faire » vers « En cours »');
    expect(
      humanizeActivity(
        t,
        'task_move',
        { from_column_id: 'c2', to_column_id: 'c2' },
        names
      )
    ).toBe('a changé la place de la carte dans « En cours »');
    expect(
      humanizeActivity(
        t,
        'task_move',
        { from_column_id: 'gone', to_column_id: 'c2' },
        names
      )
    ).toBe('a déplacé la carte vers « En cours »');
    expect(humanizeActivity(t, 'task_move', null, names)).toBe(
      t.activityTaskMove
    );
  });

  it('réassignation : de l’ancienne à la nouvelle assignée', () => {
    expect(
      humanizeActivity(
        t,
        'task_assign',
        { assignee_staff_id: 's1', from_assignee_staff_id: 's2' },
        names
      )
    ).toBe('a réassigné la carte de Sam à Alex');
    // Même personne, ou ancienne inconnue : simple assignation.
    expect(
      humanizeActivity(
        t,
        'task_assign',
        { assignee_staff_id: 's1', from_assignee_staff_id: null },
        names
      )
    ).toBe('a assigné la carte à Alex');
  });

  it('assignation, retrait, édition, création, restauration', () => {
    expect(
      humanizeActivity(t, 'task_assign', { assignee_staff_id: 's1' }, names)
    ).toBe('a assigné la carte à Alex');
    expect(
      humanizeActivity(t, 'task_assign', { assignee_staff_id: null }, names)
    ).toBe(t.activityTaskUnassign);
    expect(humanizeActivity(t, 'task_assign', {}, names)).toBe(
      t.activityTaskAssign
    );
    expect(
      humanizeActivity(
        t,
        'task_update',
        { fields: ['title', 'dueDate', 'mystery'] },
        names
      )
    ).toBe('a modifié : titre, échéance');
    expect(humanizeActivity(t, 'task_update', { fields: [] }, names)).toBe(
      t.activityTaskUpdate
    );
    expect(humanizeActivity(t, 'task_create', { column_id: 'c1' }, names)).toBe(
      'a créé la carte dans « À faire »'
    );
    expect(humanizeActivity(t, 'task_restore', {}, names)).toBe(
      t.activityTaskRestore
    );
    expect(humanizeActivity(t, 'task_comment_update', {}, names)).toBe(
      t.activityTaskCommentUpdate
    );
    expect(humanizeActivity(t, 'task_label_update')).toBe(t.activityTaskLabel);
    expect(humanizeActivity(t, 'whatever')).toBe(t.activityUnknownAction);
  });
});

describe('isCardFormDirty', () => {
  const base = {
    title: 'Préparer le bracket',
    description: '',
    priority: 'medium' as const,
    due: '',
    assignee: '',
    labelNames: ['logistique'],
    columnId: 'c1',
  };

  it('rien de changé (espaces en bord compris) : pas de confirmation', () => {
    expect(
      isCardFormDirty(base, { ...base, title: ' Préparer le bracket ' })
    ).toBe(false);
    expect(isCardFormDirty(null, { ...base, title: 'autre' })).toBe(false);
  });

  it('un champ, la colonne ou les labels changés : confirmation', () => {
    expect(isCardFormDirty(base, { ...base, title: 'Autre' })).toBe(true);
    expect(isCardFormDirty(base, { ...base, columnId: 'c2' })).toBe(true);
    expect(isCardFormDirty(base, { ...base, labelNames: [] })).toBe(true);
    expect(isCardFormDirty(base, { ...base, priority: 'urgent' })).toBe(true);
  });
});
