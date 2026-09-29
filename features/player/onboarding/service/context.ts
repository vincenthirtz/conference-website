// features/player/onboarding/service/context.ts — contexte des étapes de la
// création d'équipe anonyme (lot P11) et l'erreur « codée » qu'elles lèvent.
//
// Chaque refus porte le CODE historique de la route (`NAME_REQUIRED`,
// `TOO_MANY_MEMBERS`…) : le wizard /team/create le traduit (code → i18n),
// le texte `error` reste le repli.

import type { AdminDb } from '@/utils/admin/serviceContext';
import type { Logger } from '@/utils/logger';
import { LegacyAdminError } from '@/utils/admin/errors';

export type OnboardingCtx = {
  db: AdminDb;
  tenantId: string;
  logger: Logger;
};

/** Refus du parcours : statut + code historique (+ `fields`, `fieldErrors`). */
export function createTeamError(
  status: number,
  code: string,
  error: string,
  extra?: Record<string, unknown>
): LegacyAdminError {
  return new LegacyAdminError(status, error, { code, extra });
}

/** Message d'une exception inconnue, avec repli. */
export function messageOf(err: unknown, fallback: string): string {
  return (err as Error)?.message || fallback;
}
