// features/admin/recycle-bin/schemas.ts — corbeille (éléments soft-deleted).
//
// zod seul, imports RELATIFS : lu par l'assemblage OpenAPI (Node sans `@/`).

import { looseBody, looseQuery } from '../../../utils/admin/pathParams';

export const DELETED_TYPES = [
  'stage',
  'team',
  'match',
  'partner',
  'cast_member',
  'adherent',
  'staff',
  'scrim',
] as const;

export type DeletedType = (typeof DELETED_TYPES)[number];

/** GET /api/admin/recycle-bin — `type` vérifié par le service (400 `Unknown type`). */
export const RecycleBinQuery = looseQuery(['type', 'limit', 'offset']);

/** PATCH /api/admin/recycle-bin — `{ id, type }` à restaurer. */
export const RecycleBinRestoreDoc = looseBody(['id', 'type']);
