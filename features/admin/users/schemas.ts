// features/admin/users/schemas.ts — entrées des routes staff sur les comptes.
// Zod seul : référencé par la spec (lib/apiContracts, `x-zod-query`).

import { z } from 'zod';
import { looseBody, looseQuery } from '../../../utils/admin/pathParams';

export const UserSearchQuery = z.object({
  q: z
    .string({ error: 'Query must be at least 2 characters' })
    .trim()
    .min(2, { error: 'Query must be at least 2 characters' })
    .max(100, { error: 'Query too long (max 100 characters)' })
    .meta({ description: 'Email, pseudo ou BattleTag (2 à 100 caractères).' }),
});

/* ---------------------------------------------------------------------------
 * Routes « historiques » migrées (vague serveur 2) — champs NOMMÉS pour la
 * spec, validés par le service avec les messages et l'ordre d'origine.
 * ------------------------------------------------------------------------ */

/** `[userId]` : chaque route garde son contrôle (et son message) d'origine. */
export const UserIdPathQuery = looseQuery(['userId']);

export const CreateUserDoc = looseBody([
  'email',
  'password',
  'display_name',
  'role',
]);

export const UsersManageListQuery = looseQuery([
  'search',
  'role',
  'limit',
  'offset',
  'sort',
  'dir',
  'filters',
]);

export const UsersManagePatchDoc = looseBody([
  'userId',
  'action',
  'role',
  'teamId',
  'battleTag',
  'display_name',
  'duration',
]);

export const UsersManageDeleteDoc = looseBody(['userId']);

export const StaffPermissionsDoc = looseBody(['extraPermissions']);

export const PlayerActionDoc = looseBody(['action', 'teamId', 'battleTag']);
