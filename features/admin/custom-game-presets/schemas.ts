// features/admin/custom-game-presets/schemas.ts — entrées des routes staff des
// presets de partie personnalisée (`/api/admin/custom-game-presets/**`).
//
// La route déclare des `looseQuery` / `looseBody` (champs NOMMÉS pour la
// spec) ; le service valide avec les schémas d'origine ci-dessous, pour rendre
// les mêmes 400 (`INVALID_BODY` + `fields`, `INVALID_GAME`,
// `INVALID_TOURNAMENT_ID`, `INVALID_PRESET_ID`).
//
// zod seul, imports RELATIFS : ces schémas sont référencés par la spec
// OpenAPI (lib/apiContracts/admin/features.ts), assemblée par Node sans `@/`.
// `utils/customGamePresets` n'importe rien : il peut être atteint d'ici.

import * as z from 'zod';
import { looseBody, looseQuery } from '../../../utils/admin/pathParams';
import {
  PRESET_DESCRIPTION_MAX,
  PRESET_NAME_MAX,
} from '../../../utils/customGamePresets';

/* ---------------------------------------------------------------------------
 * Documentation (route)
 * ------------------------------------------------------------------------ */

export const PresetListQuery = looseQuery(['game', 'tournament_id']);
export const PresetIdQuery = looseQuery(['presetId']);

const EDITABLE = [
  'name',
  'import_code',
  'description',
  'map_pool',
  'enabled',
] as const;

export const PresetCreateDoc = looseBody([
  'game',
  'tournament_id',
  'stage_id',
  ...EDITABLE,
]);
export const PresetPatchDoc = looseBody(EDITABLE);

/* ---------------------------------------------------------------------------
 * Validation (service) — schémas d'origine, inchangés
 * ------------------------------------------------------------------------ */

export const presetUuid = z.string().uuid();

export const PresetCreateBody = z
  .object({
    game: z.string().optional(),
    tournament_id: presetUuid.nullable().optional(),
    stage_id: presetUuid.nullable().optional(),
    name: z.string().trim().min(1).max(PRESET_NAME_MAX),
    import_code: z.string().min(1),
    description: z
      .string()
      .trim()
      .max(PRESET_DESCRIPTION_MAX)
      .nullable()
      .optional(),
    map_pool: z.array(z.string()).optional(),
    enabled: z.boolean().optional(),
  })
  .refine((b) => !b.stage_id || !!b.tournament_id, {
    message: 'stage_id requires tournament_id',
    path: ['stage_id'],
  });

export const PresetPatchBody = z
  .object({
    name: z.string().trim().min(1).max(PRESET_NAME_MAX).optional(),
    import_code: z.string().min(1).optional(),
    description: z
      .string()
      .trim()
      .max(PRESET_DESCRIPTION_MAX)
      .nullable()
      .optional(),
    map_pool: z.array(z.string()).optional(),
    enabled: z.boolean().optional(),
  })
  .refine(
    (b) =>
      b.name !== undefined ||
      b.import_code !== undefined ||
      b.description !== undefined ||
      b.map_pool !== undefined ||
      b.enabled !== undefined,
    { message: 'Nothing to update.' }
  );
