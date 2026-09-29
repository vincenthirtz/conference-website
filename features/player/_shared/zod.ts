// features/player/_shared/zod.ts — briques zod communes aux schémas joueuse
// (lot P4). Zod seul, sans alias `@/` : importé par lib/apiContracts.

import { z } from 'zod';

/**
 * UUID au sens d'`isValidUUID` (utils/apiHelpers) : 8-4-4-4-12 hexadécimal,
 * sans contrainte de version ni de variante. `z.uuid()` est plus strict
 * (RFC 9562) et refuserait des identifiants que les routes acceptaient.
 */
export const looseUuid = (message: string) =>
  z
    .string({ error: message })
    .regex(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
      message
    );

/**
 * Champ TOLÉRANT : une valeur non textuelle est ignorée (→ `undefined`),
 * comme le faisaient les routes (`typeof x === 'string' ? … : ignoré`) ; une
 * chaîne passe par `inner`. Clé absente = absente.
 */
export const stringOrIgnored = <
  T extends z.ZodType<unknown, string | undefined>,
>(
  inner: T
) =>
  z
    .unknown()
    .transform((v) => (typeof v === 'string' ? v : undefined))
    .pipe(inner.optional())
    .optional();
