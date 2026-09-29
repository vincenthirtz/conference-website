// features/admin/tcg/schemas.ts — entrées des routes staff du TCG
// (`/api/admin/tcg/**`).
//
// Paramètres et corps « historiques » : champs NOMMÉS pour la spec
// (`looseQuery` / `looseBody`) ; le service valide avec les schémas et les
// messages d'origine (`INVALID_BODY`, `INVALID_USER_ID`, `VALIDATION`…).
// La query de `/overview` a déjà son schéma (lib/apiContracts/admin/tcg).
//
// zod seul, imports RELATIFS : ces schémas sont référencés par la spec
// OpenAPI (lib/apiContracts/admin/features.ts), assemblée par Node sans `@/`.

import { looseBody, looseQuery } from '../../../utils/admin/pathParams';

export const TcgCatalogueQuery = looseQuery(['userId']);
export const TcgEngagementQuery = looseQuery(['weeks']);
export const TcgPlayersQuery = looseQuery(['q']);
export const TcgFanartListQuery = looseQuery(['status']);

export const TcgGrantDoc = looseBody([
  'userId',
  'amount',
  'reason',
  'idempotencyKey',
]);
export const TcgPhotoDecisionDoc = looseBody([
  'userId',
  'decision',
  'photoPath',
  'reason',
]);
export const TcgFanartDecisionDoc = looseBody([
  'action',
  'id',
  'rarity',
  'notes',
]);
