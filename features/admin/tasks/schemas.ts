// features/admin/tasks/schemas.ts — entrées des routes admin du Kanban
// interne (staff-only), lot L15 (docs/PLAN-industrialisation-admin.md).
//
// Les corps (création / édition de board, colonne, carte, label, checklist,
// commentaire) restent définis dans `utils/taskBoardSchemas.ts` : l'API bot
// (`pages/api/bot/v1/tasks/*`) les partage. On les RÉEXPORTE ici, on ne les
// recopie pas — une règle de validation ne s'écrit qu'une fois.
//
// Ce fichier ajoute ce qui n'existait qu'en ligne dans les anciennes routes :
// les paramètres de chemin (`[id]`, message d'erreur historique inchangé), la
// query de la liste des boards et de la corbeille, le corps d'assignation.
//
// Imports RELATIFS uniquement (transitivement), et rien qui tire Supabase :
// la spec OpenAPI référence ces schémas (lib/apiContracts/admin/features.ts)
// et son assembleur tourne sous Node seul au prebuild, sans alias `@/`.

import * as z from 'zod';
import { uuidPathParam } from '../../../utils/admin/pathParams';
import { deletedTasksQuerySchema } from '../../../utils/taskBoardSchemas';

export {
  createBoardBodySchema as CreateBoardBody,
  patchBoardBodySchema as PatchBoardBody,
  createColumnBodySchema as CreateColumnBody,
  patchColumnBodySchema as PatchColumnBody,
  createTaskBodySchema as CreateTaskBody,
  patchTaskBodySchema as PatchTaskBody,
  moveTaskBodySchema as MoveTaskBody,
  createCommentBodySchema as CreateCommentBody,
  createChecklistItemBodySchema as CreateChecklistItemBody,
  patchChecklistItemBodySchema as PatchChecklistItemBody,
  createLabelBodySchema as CreateLabelBody,
  patchLabelBodySchema as PatchLabelBody,
} from '../../../utils/taskBoardSchemas';

/**
 * `[id]` d'une route dynamique (Next le livre en chaîne unique). Le message
 * est celui que renvoyait la route avant migration (« Board id invalide »,
 * « Task id invalide »…). `.regex` et non `.refine` : il devient un
 * `pattern` dans la spec.
 */
function idQuery(message: string) {
  return z.object({ id: uuidPathParam(message) });
}

export const BoardIdQuery = idQuery('Board id invalide');
export const ColumnIdQuery = idQuery('Colonne id invalide');
export const TaskIdQuery = idQuery('Task id invalide');
export const LabelIdQuery = idQuery('Label id invalide');
export const CommentIdQuery = idQuery('Commentaire id invalide');
export const ChecklistItemIdQuery = idQuery('Item id invalide');

/**
 * `GET boards/[id]?archive=1|true` : rend aussi les cartes TERMINÉES depuis
 * plus de `DONE_ARCHIVE_DAYS` jours, masquées par défaut (« afficher
 * l'archive »). Toute autre valeur = masquées.
 */
export const BoardDetailQuery = BoardIdQuery.extend({
  archive: z
    .unknown()
    .optional()
    .transform((v) => v === '1' || v === 'true'),
});

/** `GET boards?includeArchived=1|true` ; toute autre valeur = non archivés. */
export const ListBoardsQuery = z.object({
  includeArchived: z
    .unknown()
    .optional()
    .transform((v) => v === '1' || v === 'true'),
});

/**
 * Corbeille : `?boardId=<uuid>&limit=<n>` — le schéma partagé tel quel (un
 * `z.object`, exigé par la spec). Une clé RÉPÉTÉE est désormais refusée
 * (400) au lieu de prendre la première valeur.
 */
export const DeletedTasksQuery = deletedTasksQuerySchema;

/** (Dés)assignation : `null` = désassigner. */
export const AssignTaskBody = z.object({
  assigneeStaffId: z.string().uuid().nullable(),
});
