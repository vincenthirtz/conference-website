// features/admin/events/service/common.ts — briques partagées des services du
// run-of-show : erreurs au format historique des routes d'origine.

import type { z } from 'zod';
import type { ServiceContext } from '@/utils/admin/serviceContext';
import { LegacyAdminError } from '@/utils/admin/errors';

/** Erreur au corps historique (`code` métier et champs annexes conservés). */
export function fail(
  status: number,
  error: string,
  code?: string,
  extra?: Record<string, unknown>
): LegacyAdminError {
  return new LegacyAdminError(status, error, { code, extra });
}

/** Erreur base : journalisée avec son détail, rendue avec le message d'origine. */
export function dbFail(
  ctx: ServiceContext,
  where: string,
  err: unknown,
  error: string,
  code?: string
): LegacyAdminError {
  ctx.logger.error(where, err);
  return fail(500, error, code);
}

/**
 * Parse d'un corps avec l'échec historique des routes du run-of-show :
 * `400 { error: 'Invalid payload.', code: 'INVALID_PAYLOAD', details }`.
 */
export function parsePayload<S extends z.ZodType>(
  schema: S,
  raw: unknown
): z.output<S> {
  const parsed = schema.safeParse(raw ?? {});
  if (parsed.success) return parsed.data;
  throw fail(400, 'Invalid payload.', 'INVALID_PAYLOAD', {
    details: parsed.error.flatten(),
  });
}

/** Ligne lue par une fonction de repository `{ row }`. */
export type RowOf<F extends (...args: never[]) => Promise<{ row: unknown }>> =
  NonNullable<Awaited<ReturnType<F>>['row']>;

export const runNotFound = () => fail(404, 'Event run not found.');
