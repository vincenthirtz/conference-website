// features/admin/tasks/hooks/useTaskBoardQueries.ts — lectures du Kanban sur
// le cache de l'admin (lot L10).
//
// POURQUOI AUCUN RAFRAÎCHISSEMENT AUTOMATIQUE. Le détail d'un board est
// modifié EN PLACE par le glisser-déposer (mise à jour optimiste, retour
// arrière sur 409 `wip_exceeded`). Une relecture déclenchée par le focus de
// l'onglet pourrait arriver au milieu d'un déplacement et réafficher l'ancien
// ordre. On relit donc exactement quand la page le demandait avant la
// migration : au changement de board, et via `fetchDetail` / `fetchBoards`.

import { useQuery } from '@tanstack/react-query';
import type { StaffOption } from '@/components/admin/tasks/taskBoardModel';
import { adminKey, EDITOR_QUERY_OPTIONS } from '../../_shared/query';
import { taskBoardClient } from '../client';

export const taskBoardKeys = {
  all: adminKey('tasks'),
  boards: () => [...taskBoardKeys.all, 'boards'] as const,
  /** Le détail avec ou sans l'archive des cartes terminées : deux entrées. */
  board: (id: string, archive = false) =>
    [
      ...taskBoardKeys.all,
      'board',
      id,
      archive ? 'archive' : 'recent',
    ] as const,
  my: () => [...taskBoardKeys.all, 'my'] as const,
  staff: (tenantId: string) =>
    [...taskBoardKeys.all, 'staff', tenantId] as const,
};

/**
 * Liste des boards : lue par `fetchBoards` (la page choisit ensuite le board
 * actif selon le résultat) ; ce hook ne fait qu'observer le cache.
 */
export function useTaskBoardsList() {
  return useQuery({
    queryKey: taskBoardKeys.boards(),
    queryFn: taskBoardClient.listBoards,
    enabled: false,
  });
}

/**
 * Détail du board actif, relu à chaque changement de board ou d'affichage
 * de l'archive (cartes terminées depuis plus de 30 jours).
 */
export function useTaskBoardDetail(boardId: string | null, archive = false) {
  return useQuery({
    queryKey: taskBoardKeys.board(boardId ?? '', archive),
    queryFn: async () =>
      (await taskBoardClient.board(boardId as string, archive)).board,
    enabled: !!boardId,
    ...EDITOR_QUERY_OPTIONS,
    // Pas de nouvel essai différé : il pourrait retomber après un
    // déplacement optimiste (et l'échec est signalé tout de suite, comme avant).
    retry: false,
  });
}

/** « Mes tâches » : relu à chaque entrée dans la vue. */
export function useMyTasks(enabled: boolean) {
  return useQuery({
    queryKey: taskBoardKeys.my(),
    queryFn: async () => (await taskBoardClient.myTasks()).tasks || [],
    enabled,
    retry: false,
    staleTime: 0,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}

/** Staff du tenant actif (assignation), trié par nom. */
export function useTaskBoardStaff(tenantId: string | null | undefined) {
  return useQuery({
    queryKey: taskBoardKeys.staff(tenantId ?? ''),
    queryFn: async (): Promise<StaffOption[]> => {
      const json = await taskBoardClient.tenantStaff(tenantId as string);
      return (json.staff || [])
        .map((s) => ({
          id: s.staff_id,
          name: s.display_name || s.email || s.staff_id,
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
    },
    enabled: !!tenantId,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });
}
