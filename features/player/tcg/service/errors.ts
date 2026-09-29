// features/player/tcg/service/errors.ts — refus des services TCG, au contrat
// HISTORIQUE des routes (message, `code` stable, champs annexes).

import type { z } from 'zod';
import { LegacyAdminError } from '@/utils/admin/errors';
import { parseBody } from '@/utils/player/errors';

/** Refus au corps historique : `{ error, code?, ...extra }`. */
export function refuse(
  status: number,
  error: string,
  code?: string,
  extra?: Record<string, unknown>
): LegacyAdminError {
  return new LegacyAdminError(status, error, { code, extra });
}

/**
 * Valide un corps avec son schéma partagé (P4) : en échec, EXACTEMENT la
 * réponse d'avant (`message` et `code` historiques), `fields` en plus.
 */
export function parseOrRefuse<S extends z.ZodType>(
  schema: S,
  body: unknown,
  opts: { message?: string; code?: string } = {}
): z.output<S> {
  const parsed = parseBody(schema, body, opts);
  if (!parsed.ok) {
    throw refuse(400, parsed.body.error, parsed.body.code, {
      fields: parsed.body.fields,
    });
  }
  return parsed.data;
}
