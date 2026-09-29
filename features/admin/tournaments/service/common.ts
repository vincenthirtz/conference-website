// features/admin/tournaments/service/common.ts — petites aides partagées par
// les services du module tournoi.

import type { ServiceContext } from '@/utils/admin/serviceContext';
import { LegacyAdminError, adminErrorFromStatus } from '@/utils/admin/errors';
import { isValidUUID } from '@/utils/apiHelpers';
import { firstString } from '@/utils/admin/pathParams';

/** Staff à l'origine du geste (null pour un acteur bot / système). */
export function staffIdOf(ctx: ServiceContext): string | null {
  return ctx.actor.kind === 'staff' ? ctx.actor.staffId : null;
}

/**
 * `[id]` des routes dont l'erreur portait un code métier : même message, même
 * `code` qu'avant la migration.
 */
export function codedTournamentId(
  raw: unknown,
  message: string,
  code: string
): string {
  const id = firstString(raw);
  if (!id || !isValidUUID(id)) {
    throw new LegacyAdminError(400, message, { code });
  }
  return id;
}

/** Erreur historique `{ error }` (sans code métier) : statut + message. */
export function fail(status: number, message: string): never {
  throw adminErrorFromStatus(status, message);
}

/** Erreur historique avec `code` métier et champs annexes. */
export function failWith(
  status: number,
  message: string,
  code?: string,
  extra?: Record<string, unknown>
): never {
  throw new LegacyAdminError(status, message, { code, extra });
}

/** Réponse dont le statut dépend du geste (201 création, 207 partiel…). */
export type StatusResult<T> = { status: number; body: T };
