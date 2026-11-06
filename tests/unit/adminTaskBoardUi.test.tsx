// @vitest-environment happy-dom
//
// Tableau de tâches staff (/admin/tasks), côté écran :
//   - commentaires : « Modifier » seulement sur les siens, ✕ sur les siens
//     (ou tous pour un admin), Ctrl + Entrée envoie, « modifié » affiché ;
//   - ajout rapide en bas de colonne : Entrée crée et garde le champ ouvert,
//     « Plus d'options » passe le titre tapé à la fenêtre complète ;
//   - échéance relative sur la carte (« demain ») ;
//   - glisser-déposer : une carte lâchée sur elle-même ou à sa place n'appelle
//     pas l'API ; un vrai déplacement envoie l'index et renumérote l'écran.

import type { DragEvent } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
} from '@testing-library/react';
import nsAdminTaskBoard from '@/lib/i18n/locales/admin-fr/adminTaskBoard';
import type {
  BoardDetail,
  BoardDetailColumn,
  BoardTask,
  TaskComment,
} from '@/components/admin/tasks/taskBoardModel';
import { TaskBoardCommentsSection } from '@/features/admin/tasks/ui/TaskBoardCardSections';
import TaskBoardColumn from '@/features/admin/tasks/ui/TaskBoardColumn';
import { useTaskBoardDnd } from '@/features/admin/tasks/hooks/useTaskBoardDnd';
import type { Mutation } from '@/features/admin/tasks/hooks/taskBoardHookTypes';

const t = nsAdminTaskBoard.fr;

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function comment(id: string, author: string, extra = {}): TaskComment {
  return {
    id,
    body: `texte ${id}`,
    authorStaffId: author,
    authorName: author,
    createdAt: '2026-11-06T10:00:00.000Z',
    editedAt: null,
    ...extra,
  };
}

function commentsSection(
  props: Partial<Parameters<typeof TaskBoardCommentsSection>[0]> = {}
) {
  const onEdit = vi.fn(async () => true);
  const onSubmit = vi.fn();
  const onDelete = vi.fn();
  render(
    <TaskBoardCommentsSection
      t={t}
      comments={[
        comment('c1', 'me'),
        comment('c2', 'other', { editedAt: '2026-11-06T11:00:00.000Z' }),
      ]}
      loading={false}
      input=""
      posting={false}
      currentStaffId="me"
      canModerate={false}
      onInputChange={() => {}}
      onSubmit={onSubmit}
      onEdit={onEdit}
      onDelete={onDelete}
      {...props}
    />
  );
  return { onEdit, onSubmit, onDelete };
}

describe('commentaires de carte', () => {
  it('modifier et supprimer : seulement ses propres commentaires', () => {
    commentsSection();
    expect(screen.getAllByRole('button', { name: t.commentEdit })).toHaveLength(
      1
    );
    expect(
      screen.getAllByRole('button', { name: t.commentDelete })
    ).toHaveLength(1);
    expect(screen.getByText(/modifié/)).toBeTruthy();
  });

  it('un admin supprime aussi ceux des autres (mais ne les modifie pas)', () => {
    commentsSection({ canModerate: true });
    expect(screen.getAllByRole('button', { name: t.commentEdit })).toHaveLength(
      1
    );
    expect(
      screen.getAllByRole('button', { name: t.commentDelete })
    ).toHaveLength(2);
  });

  it('modification : Ctrl + Entrée enregistre le nouveau texte', async () => {
    const { onEdit } = commentsSection();
    fireEvent.click(screen.getByRole('button', { name: t.commentEdit }));
    const box = screen.getByLabelText(t.commentEditLabel);
    fireEvent.change(box, { target: { value: 'texte corrigé' } });
    await act(async () => {
      fireEvent.keyDown(box, { key: 'Enter', ctrlKey: true });
    });
    expect(onEdit).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'c1' }),
      'texte corrigé'
    );
    // Accepté : on repasse en lecture.
    expect(screen.queryByLabelText(t.commentEditLabel)).toBeNull();
  });

  it('nouveau commentaire : Ctrl + Entrée envoie, Entrée seule non', () => {
    const { onSubmit } = commentsSection({ input: 'Bonjour' });
    const box = screen.getByLabelText(t.commentsTitle);
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(onSubmit).not.toHaveBeenCalled();
    fireEvent.keyDown(box, { key: 'Enter', ctrlKey: true });
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});

function task(id: string, position: number, extra = {}): BoardTask {
  return {
    id,
    title: `Carte ${id}`,
    description: null,
    priority: 'medium',
    position,
    dueDate: null,
    labels: [],
    assignee: null,
    checklist: { done: 0, total: 0 },
    commentCount: 0,
    ...extra,
  };
}

function column(tasks: BoardTask[]): BoardDetailColumn {
  return {
    id: 'col1',
    name: 'À faire',
    position: 0,
    wipLimit: null,
    isDone: false,
    tasks,
  };
}

function renderColumn(tasks: BoardTask[] = []) {
  const onQuickAdd = vi.fn(async () => true);
  const onAddCard = vi.fn();
  const noop = () => {};
  render(
    <TaskBoardColumn
      t={t}
      col={column(tasks)}
      index={0}
      columnCount={1}
      tasks={tasks}
      hasActiveFilters={false}
      dndEnabled
      labelDefByName={new Map()}
      staffNameById={new Map()}
      onReorder={noop}
      onEdit={noop}
      onDelete={noop}
      onAddCard={onAddCard}
      onQuickAdd={onQuickAdd}
      onOpenCard={noop}
      onDragOverColumn={noop}
      onDragOverCard={noop}
      onDropOnColumn={noop}
      onDropOnCard={noop}
      onCardDragStart={noop}
      onCardDragEnd={noop}
    />
  );
  return { onQuickAdd, onAddCard };
}

describe('ajout rapide en bas de colonne', () => {
  it('Entrée crée la carte et garde le champ ouvert pour la suivante', async () => {
    const { onQuickAdd } = renderColumn();
    fireEvent.click(screen.getByRole('button', { name: `+ ${t.addCard}` }));
    const input = screen.getByLabelText(t.quickAddLabel) as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Réserver la salle' } });
    await act(async () => {
      fireEvent.keyDown(input, { key: 'Enter' });
    });
    expect(onQuickAdd).toHaveBeenCalledWith('col1', 'Réserver la salle');
    const after = screen.getByLabelText(t.quickAddLabel) as HTMLInputElement;
    expect(after.value).toBe('');
  });

  it('« Plus d’options » ouvre la fenêtre complète avec le titre tapé', () => {
    const { onAddCard, onQuickAdd } = renderColumn();
    fireEvent.click(screen.getByRole('button', { name: `+ ${t.addCard}` }));
    fireEvent.change(screen.getByLabelText(t.quickAddLabel), {
      target: { value: 'Brief casters' },
    });
    fireEvent.click(screen.getByRole('button', { name: t.quickAddDetails }));
    expect(onAddCard).toHaveBeenCalledWith('col1', 'Brief casters');
    expect(onQuickAdd).not.toHaveBeenCalled();
    expect(screen.queryByLabelText(t.quickAddLabel)).toBeNull();
  });

  it('Échap ferme le champ', () => {
    renderColumn();
    fireEvent.click(screen.getByRole('button', { name: `+ ${t.addCard}` }));
    fireEvent.keyDown(screen.getByLabelText(t.quickAddLabel), {
      key: 'Escape',
    });
    expect(screen.queryByLabelText(t.quickAddLabel)).toBeNull();
  });
});

describe('échéance sur la carte', () => {
  it('relative : « demain »', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 10, 6, 15, 0, 0));
    renderColumn([task('A', 0, { dueDate: '2026-11-07' })]);
    expect(screen.getByText('demain')).toBeTruthy();
  });
});

describe('glisser-déposer', () => {
  function setup() {
    let detail: BoardDetail = {
      id: 'b1',
      name: 'Board',
      description: null,
      position: 0,
      isArchived: false,
      labels: [],
      columns: [column([task('A', 0), task('B', 1), task('C', 2)])],
    };
    const mutateJson = vi.fn(async () => ({}));
    const setDetail = vi.fn((next) => {
      detail = typeof next === 'function' ? next(detail) : next;
    });
    const dragTaskId = { current: null as string | null };
    const { result } = renderHook(() =>
      useTaskBoardDnd({
        t,
        addToast: vi.fn(),
        moveMutation: { mutateJson } as unknown as Mutation,
        fetchBoards: vi.fn(async () => {}),
        fetchDetail: vi.fn(async () => {}),
        dragTaskId,
        detail,
        setDetail,
        activeBoardId: 'b1',
        dndEnabled: true,
      })
    );
    return { result, mutateJson, dragTaskId, getDetail: () => detail };
  }

  /** Dépôt sur la moitié haute (`lower = false`) ou basse d'une carte. */
  function dropEvent(lower: boolean): DragEvent {
    return {
      preventDefault: () => {},
      stopPropagation: () => {},
      clientY: lower ? 80 : 20,
      currentTarget: {
        getBoundingClientRect: () => ({ top: 0, height: 100 }),
      },
    } as unknown as DragEvent;
  }

  it('lâchée sur elle-même : aucun appel', () => {
    const { result, mutateJson, dragTaskId } = setup();
    dragTaskId.current = 'B';
    act(() => result.current.onDropOnCard(dropEvent(false), 'col1', 'B'));
    expect(mutateJson).not.toHaveBeenCalled();
  });

  it('lâchée à sa place (avant la carte qui la suit) : aucun appel', () => {
    const { result, mutateJson, dragTaskId } = setup();
    dragTaskId.current = 'A';
    act(() => result.current.onDropOnCard(dropEvent(false), 'col1', 'B'));
    expect(mutateJson).not.toHaveBeenCalled();
  });

  it('descendre d’un cran (moitié basse de la suivante) : index envoyé, écran renuméroté', async () => {
    const { result, mutateJson, dragTaskId, getDetail } = setup();
    dragTaskId.current = 'A';
    await act(async () => {
      result.current.onDropOnCard(dropEvent(true), 'col1', 'B');
    });
    expect(mutateJson).toHaveBeenCalledTimes(1);
    const [, init] = mutateJson.mock.calls[0] as unknown as [
      string,
      { body: string },
    ];
    expect(JSON.parse(init.body)).toEqual({ columnId: 'col1', position: 1 });
    expect(getDetail().columns[0].tasks.map((c) => [c.id, c.position])).toEqual(
      [
        ['B', 0],
        ['A', 1],
        ['C', 2],
      ]
    );
  });
});
