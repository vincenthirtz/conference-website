// features/admin/moderation/blacklistExpiry.ts — échéance des sanctions
// (blacklists joueurs et entités) côté staff : filtre « expirées », saisie
// durée/date, et repli tant que la migration `blacklist_expires_at` n'est pas
// appliquée. Le prédicat d'application vit dans
// utils/moderation/blacklistExpiry.ts (partagé avec les vérifications).

import { ServiceUnavailableError, ValidationError } from '@/utils/admin/errors';
import {
  BLACKLIST_EXPIRY_MIGRATION_PENDING,
  resolveBlacklistExpiry,
} from '@/utils/moderation/blacklistExpiry';
import { isMissingColumnError } from '@/utils/moderation/missingColumn';

/** `expired=true` → ne garder que les entrées échues à `now`. */
export function expiredBeforeFilter(
  expired: unknown,
  now: Date = new Date()
): string | null {
  return expired === 'true' || expired === '1' ? now.toISOString() : null;
}

/**
 * Lit avec la colonne `expires_at`, puis sans si elle manque. Rend
 * `expiryAvailable` pour que l'écran masque la saisie d'échéance.
 */
export async function withExpiryFallback<T extends { error: unknown | null }>(
  run: (withExpiry: boolean) => Promise<T>
): Promise<T & { expiryAvailable: boolean }> {
  const first = await run(true);
  if (first.error && isMissingColumnError(first.error, 'expires_at')) {
    const second = await run(false);
    return { ...second, expiryAvailable: false };
  }
  return { ...first, expiryAvailable: true };
}

/**
 * Patch d'échéance depuis le corps validé. `undefined` = colonne non touchée.
 * À la création, une échéance passée est refusée (la sanction serait levée
 * avant même d'exister).
 */
export function expiryPatch(
  body: { expires_at?: string | null; duration_days?: number | null },
  opts: { creating: boolean },
  now: Date = new Date()
): { expires_at?: string | null } {
  const value = resolveBlacklistExpiry(body, now);
  if (value === undefined) return {};
  if (value !== null && opts.creating && Date.parse(value) <= now.getTime()) {
    throw new ValidationError("L'échéance doit être dans le futur.");
  }
  return { expires_at: value };
}

/**
 * Une écriture qui portait une échéance et échoue faute de colonne : 503
 * explicite plutôt qu'une sanction silencieusement rendue définitive.
 */
export function assertExpiryWritable(
  error: unknown,
  patch: { expires_at?: string | null }
): void {
  if (
    patch.expires_at !== undefined &&
    isMissingColumnError(error, 'expires_at')
  ) {
    throw new ServiceUnavailableError(BLACKLIST_EXPIRY_MIGRATION_PENDING);
  }
}
