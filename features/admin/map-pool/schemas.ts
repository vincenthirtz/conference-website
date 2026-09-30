// features/admin/map-pool/schemas.ts — entrées des routes staff du catalogue
// de maps du tenant (`/api/admin/map-pool/**`).
//
// Corps et paramètres « historiques » : champs NOMMÉS pour la spec
// (`looseBody` / `looseQuery`), validés par le service avec les messages et
// codes d'origine (`INVALID_BODY` + `fields`, `INVALID_GAME`, `INVALID_MAP_ID`).
//
// zod seul, imports RELATIFS : ces schémas sont référencés par la spec
// OpenAPI (lib/apiContracts/admin/features.ts), assemblée par Node sans `@/`.

import * as z from 'zod';
import { looseBody, looseQuery } from '../../../utils/admin/pathParams';

/* ---------------------------------------------------------------------------
 * Documentation (route) — la validation fine est dans le service
 * ------------------------------------------------------------------------ */

export const MapPoolListQuery = looseQuery(['game']);
export const MapPoolIdQuery = looseQuery(['mapId']);

const MAP_FIELDS = [
  'map_name',
  'map_type',
  'image_url',
  'enabled',
  'order_index',
] as const;

export const MapPoolCreateDoc = looseBody(['game', ...MAP_FIELDS]);
export const MapPoolPatchDoc = looseBody(MAP_FIELDS);
export const MapPoolImportDoc = looseBody(['game']);

/* ---------------------------------------------------------------------------
 * Validation (service) — schémas d'origine, inchangés
 * ------------------------------------------------------------------------ */

export const MapPoolCreateBody = z.object({
  game: z.string(),
  map_name: z.string().trim().min(1).max(120),
  map_type: z.string().trim().max(60).nullable().optional(),
  image_url: z.string().trim().max(500).nullable().optional(),
  enabled: z.boolean().optional(),
  order_index: z.number().int().nullable().optional(),
});

export const MapPoolPatchBody = z
  .object({
    map_name: z.string().trim().min(1).max(120).optional(),
    map_type: z.string().trim().max(60).nullable().optional(),
    image_url: z.string().trim().max(500).nullable().optional(),
    enabled: z.boolean().optional(),
    order_index: z.number().int().nullable().optional(),
  })
  .refine(
    (b) =>
      b.map_name !== undefined ||
      b.map_type !== undefined ||
      b.image_url !== undefined ||
      b.enabled !== undefined ||
      b.order_index !== undefined,
    { message: 'Nothing to update.' }
  );

export const MapPoolImportBody = z.object({ game: z.string() });
