// features/admin/tasks/errors.ts — erreurs du Kanban qui PRÉSERVENT le `code`
// métier historique dans le corps de réponse.
//
// POURQUOI. Le client lit `payload.code` pour choisir sa réaction :
// `wip_exceeded` (rollback du glisser-déposer + toast « limite atteinte »,
// avec `limit` / `current`), `column_not_empty`, `label_exists`,
// `not_deleted`, `column_gone`… Ces codes sont aussi ceux du cœur partagé avec
// le bot (`utils/taskBoard.ts`). Une `AdminError` ordinaire les écraserait par
// son code générique (`conflict`, `not_found`) : le rollback WIP casserait
// sans bruit. `LegacyAdminError` garde le statut et la classe, mais sérialise
// le code métier.

import { LegacyAdminError } from '@/utils/admin/errors';
import type { CoreErr } from '@/utils/taskBoard';

/** Erreur à code métier propre à l'admin (`column_not_empty`, `label_exists`). */
export function taskBoardError(
  status: number,
  message: string,
  code: string
): LegacyAdminError {
  return new LegacyAdminError(status, message, { code });
}

/** Traduit l'échec d'un cœur (`createTaskCore`, `moveTaskCore`…) à l'identique. */
export function taskBoardErrorFromCore(result: CoreErr): LegacyAdminError {
  return new LegacyAdminError(result.status, result.error, {
    code: result.code,
    extra:
      result.code === 'wip_exceeded'
        ? { limit: result.limit, current: result.current }
        : undefined,
  });
}
