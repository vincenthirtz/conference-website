// features/admin/_shared/legacyParse.ts — validation « à l'ancienne » côté
// service (pas dans un schéma de route : ce fichier dépend de `@/`, la spec
// OpenAPI ne doit pas l'atteindre).

import type { z } from 'zod';
import { LegacyAdminError } from '@/utils/admin/errors';
import { formatZodError } from '@/utils/validation';

/**
 * L'échec rend EXACTEMENT le 400 des routes qui répondaient
 * `{ error: formatZodError(e), fields: e.flatten().fieldErrors }` (messages et
 * `fields` en tableaux par champ), là où la validation de `defineAdminRoute`
 * rendrait `fields` en chaînes.
 */
export function parseWithLegacyFields<S extends z.ZodType>(
  schema: S,
  raw: unknown
): z.output<S> {
  const parsed = schema.safeParse(raw);
  if (parsed.success) return parsed.data;
  throw new LegacyAdminError(400, formatZodError(parsed.error), {
    extra: { fields: parsed.error.flatten().fieldErrors },
  });
}
