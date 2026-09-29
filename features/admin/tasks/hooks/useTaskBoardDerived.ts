// features/admin/tasks/hooks/useTaskBoardDerived.ts — données dérivées du
// board chargé : index staff / labels, labels filtrables, recherche débouncée,
// prédicat des filtres (client-side) et cartes visibles par colonne.
//
// Mémos DÉPLACÉS À L'IDENTIQUE depuis pages/admin/tasks/index.tsx (mêmes corps,
// mêmes dépendances) : seuls les accès à l'état de la page deviennent des
// paramètres. La page reste propriétaire de tous les useState.

import { useCallback, useMemo } from 'react';
import { useDebounce } from '@/hooks/useDebounce';
import {
  type BoardDetail,
  type BoardLabel,
  type BoardTask,
  type CardSort,
  type StaffOption,
  type StaffProps,
  FILTER_UNASSIGNED,
  sortTasksForDisplay,
} from '@/components/admin/tasks/taskBoardModel';
import type { Setter } from './taskBoardHookTypes';

export type TaskBoardDerivedDeps = {
  currentStaff: StaffProps['staff'];
  detail: BoardDetail | null;
  staff: StaffOption[];
  cardSort: CardSort;
  filterSearch: string;
  setFilterSearch: Setter<string>;
  filterAssignee: string;
  setFilterAssignee: Setter<string>;
  filterPriority: string;
  setFilterPriority: Setter<string>;
  filterLabel: string;
  setFilterLabel: Setter<string>;
  filterMine: boolean;
  setFilterMine: Setter<boolean>;
};

export function useTaskBoardDerived(deps: TaskBoardDerivedDeps) {
  const {
    currentStaff,
    detail,
    staff,
    cardSort,
    filterSearch,
    setFilterSearch,
    filterAssignee,
    setFilterAssignee,
    filterPriority,
    setFilterPriority,
    filterLabel,
    setFilterLabel,
    filterMine,
    setFilterMine,
  } = deps;

  const staffNameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of staff) m.set(s.id, s.name);
    return m;
  }, [staff]);

  // Définitions de labels du board indexées par nom (couleur des pastilles).
  const boardLabels = useMemo(() => detail?.labels ?? [], [detail]);
  const labelDefByName = useMemo(() => {
    const m = new Map<string, BoardLabel>();
    for (const l of boardLabels) m.set(l.name, l);
    return m;
  }, [boardLabels]);

  // Union des labels sélectionnables au filtre : définitions du board +
  // éventuels noms présents sur les cartes sans définition.
  const availableLabels = useMemo(() => {
    if (!detail) return [];
    const set = new Set<string>();
    for (const l of detail.labels) set.add(l.name);
    for (const col of detail.columns) {
      for (const task of col.tasks) {
        for (const lbl of task.labels) set.add(lbl);
      }
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [detail]);

  // Le champ reste piloté par `filterSearch` (frappe fluide), mais le FILTRAGE
  // s'appuie sur la valeur débouncée : sans ça, chaque caractère re-rendait le
  // board entier (toutes les colonnes, toutes les cartes) alors qu'il est
  // visible et scrollé.
  const debouncedSearch = useDebounce(filterSearch, 150);

  const hasActiveFilters =
    debouncedSearch.trim() !== '' ||
    filterAssignee !== '' ||
    filterPriority !== '' ||
    filterLabel !== '' ||
    filterMine;

  // biome-ignore lint/correctness/useExhaustiveDependencies: deps d'origine conservées (setters stables reçus en paramètre)
  const clearFilters = useCallback(() => {
    setFilterSearch('');
    setFilterAssignee('');
    setFilterPriority('');
    setFilterLabel('');
    setFilterMine(false);
  }, []);

  // Prédicat de correspondance d'une carte aux filtres actifs.
  const taskMatchesFilters = useCallback(
    (task: BoardTask): boolean => {
      const q = debouncedSearch.trim().toLowerCase();
      if (q) {
        const hay = `${task.title} ${task.description ?? ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (filterMine) {
        if (task.assignee?.staffId !== currentStaff.id) return false;
      } else if (filterAssignee) {
        if (filterAssignee === FILTER_UNASSIGNED) {
          if (task.assignee) return false;
        } else if (task.assignee?.staffId !== filterAssignee) {
          return false;
        }
      }
      if (filterPriority && task.priority !== filterPriority) return false;
      if (filterLabel && !task.labels.includes(filterLabel)) return false;
      return true;
    },
    [
      debouncedSearch,
      filterMine,
      filterAssignee,
      filterPriority,
      filterLabel,
      currentStaff.id,
    ]
  );

  const sortedColumns = useMemo(
    () =>
      detail ? [...detail.columns].sort((a, b) => a.position - b.position) : [],
    [detail]
  );

  // Cartes visibles par colonne, calculées UNE fois par changement réel de
  // données/tri/filtres. Avant, le tri + le filtre tournaient dans le JSX à
  // chaque rendu du composant — or celui-ci porte une quarantaine d'états (la
  // modale de carte, les commentaires, la checklist, le panneau de labels…),
  // donc chaque frappe dans un champ de la modale re-triait tout le board.
  const visibleTasksByColumn = useMemo(() => {
    const map = new Map<string, BoardTask[]>();
    for (const col of sortedColumns) {
      const all = sortTasksForDisplay(col.tasks, cardSort);
      map.set(col.id, hasActiveFilters ? all.filter(taskMatchesFilters) : all);
    }
    return map;
  }, [sortedColumns, cardSort, hasActiveFilters, taskMatchesFilters]);

  return {
    staffNameById,
    boardLabels,
    labelDefByName,
    availableLabels,
    debouncedSearch,
    hasActiveFilters,
    clearFilters,
    sortedColumns,
    visibleTasksByColumn,
  };
}
