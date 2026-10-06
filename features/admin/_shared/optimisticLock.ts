// features/admin/_shared/optimisticLock.ts — verrou optimiste des fiches
// éditées (lot A2) : tournoi, équipe, actualité. Même motif que l'édition de
// match (features/admin/matches/service/match.ts).
//
// Le client renvoie `expected_updated_at` = le `updated_at` de la fiche qu'il
// a chargée. Si la ligne a changé entre-temps, le serveur refuse (409) au lieu
// d'écraser silencieusement le travail d'un·e autre membre du staff. Champ
// absent → aucun contrôle (rétro-compatible : bot, scripts, anciens écrans).
//
// Module PUR, partagé serveur (assertion) et navigateur (reconnaissance).

import { ConflictError } from '@/utils/admin/errors';

/** `reason` stable du 409 : l'écran le reconnaît sans comparer de texte. */
export const STALE_UPDATE_REASON = 'stale_update';

/** Nom du champ de corps porté par les requêtes d'édition. */
export const EXPECTED_UPDATED_AT = 'expected_updated_at';

function sameInstant(a: string, b: string): boolean {
  if (a === b) return true;
  // Même instant, écriture différente (`+00:00` / `Z`, millisecondes).
  const ta = Date.parse(a);
  const tb = Date.parse(b);
  return Number.isFinite(ta) && Number.isFinite(tb) && ta === tb;
}

/**
 * Lève un 409 `conflict` / `stale_update` si `expected` est fourni et diffère
 * de la version courante. Sans `expected` (ou sans version connue côté
 * serveur), ne fait rien.
 */
export function assertFreshVersion(
  expected: unknown,
  current: string | null | undefined,
  message: string
): void {
  if (typeof expected !== 'string' || expected === '') return;
  if (typeof current !== 'string' || current === '') return;
  if (sameInstant(expected, current)) return;
  throw new ConflictError(message, STALE_UPDATE_REASON);
}

/** `true` si l'erreur (AdminHttpError, AdminFetchError…) est ce 409. */
export function isStaleUpdateError(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const e = err as { status?: unknown; payload?: unknown };
  if (e.status !== 409) return false;
  const payload = e.payload as { reason?: unknown } | null | undefined;
  return payload?.reason === STALE_UPDATE_REASON;
}
