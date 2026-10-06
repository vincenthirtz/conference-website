// features/admin/tasks/client.ts — appels typés du Kanban staff (lot L10).
//
// Les URLs de l'API vivent ICI, plus dans la page ni dans ses hooks.
// - Lectures : fonctions sur `adminRequest`, consommées par les requêtes à
//   clés (hooks/useTaskBoardQueries.ts) ou à la demande (corbeille, carte).
// - Écritures : `taskBoardUrls`, parce qu'elles restent sur
//   `useIdempotentMutation` — une clé d'idempotence par famille de gestes et
//   la FILE HORS LIGNE (`BgSyncQueuedError`), dont le déplacement de carte.
//
// Types : ceux du modèle d'écran (components/admin/tasks/taskBoardModel.ts),
// qui décrit déjà les réponses de ces routes.

import { adminRequest } from '@/utils/admin/adminHttp';
import type {
  BoardDetail,
  BoardListItem,
  ChecklistItem,
  DeletedTask,
  MyTask,
  TaskActivity,
  TaskComment,
} from '@/components/admin/tasks/taskBoardModel';

const BASE = '/api/admin/tasks';
const enc = encodeURIComponent;

export const taskBoardUrls = {
  boards: `${BASE}/boards`,
  board: (id: string) => `${BASE}/boards/${enc(id)}`,
  columns: `${BASE}/columns`,
  column: (id: string) => `${BASE}/columns/${enc(id)}`,
  tasks: `${BASE}/tasks`,
  task: (id: string) => `${BASE}/tasks/${enc(id)}`,
  taskMove: (id: string) => `${BASE}/tasks/${enc(id)}/move`,
  taskAssign: (id: string) => `${BASE}/tasks/${enc(id)}/assign`,
  taskRestore: (id: string) => `${BASE}/tasks/${enc(id)}/restore`,
  taskActivity: (id: string) => `${BASE}/tasks/${enc(id)}/activity`,
  taskChecklist: (id: string) => `${BASE}/tasks/${enc(id)}/checklist`,
  taskComments: (id: string) => `${BASE}/tasks/${enc(id)}/comments`,
  checklistItem: (id: string) => `${BASE}/checklist/${enc(id)}`,
  comment: (id: string) => `${BASE}/comments/${enc(id)}`,
  labels: `${BASE}/labels`,
  label: (id: string) => `${BASE}/labels/${enc(id)}`,
  deleted: (boardId: string) => `${BASE}/deleted?boardId=${enc(boardId)}`,
  my: `${BASE}/my`,
};

/** Membre du staff du tenant, tel que le rend `/tenants/[id]/staff`. */
export type TenantStaffMember = {
  staff_id: string;
  display_name: string | null;
  email: string | null;
};

export const taskBoardClient = {
  /** Tous les boards, archivés compris (le filtre est côté écran). */
  listBoards: () =>
    adminRequest<{ boards: BoardListItem[] }>(
      `${taskBoardUrls.boards}?includeArchived=1`
    ),
  /** `archive` : avec les cartes terminées depuis plus de 30 jours. */
  board: (id: string, archive = false) =>
    adminRequest<{ board: BoardDetail }>(
      archive ? `${taskBoardUrls.board(id)}?archive=1` : taskBoardUrls.board(id)
    ),
  myTasks: () => adminRequest<{ tasks: MyTask[] }>(taskBoardUrls.my),
  deleted: (boardId: string) =>
    adminRequest<{ tasks: DeletedTask[] }>(taskBoardUrls.deleted(boardId)),
  activity: (taskId: string) =>
    adminRequest<{ activity: TaskActivity[] }>(
      taskBoardUrls.taskActivity(taskId)
    ),
  task: (taskId: string) =>
    adminRequest<{
      task: { checklist: ChecklistItem[]; comments: TaskComment[] };
    }>(taskBoardUrls.task(taskId)),
  /** Staff du tenant actif (sélecteur d'assignation). */
  tenantStaff: (tenantId: string) =>
    adminRequest<{ staff: TenantStaffMember[] }>(
      `/api/admin/tenants/${enc(tenantId)}/staff`
    ),
};
