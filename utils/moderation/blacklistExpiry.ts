// utils/moderation/blacklistExpiry.ts
//
// PRÉDICAT CENTRAL des sanctions temporaires (blacklist joueurs et entités).
//
// Jusqu'ici une entrée n'avait que `active` : une sanction de deux semaines
// restait en vigueur tant que personne ne pensait à la lever. Depuis la
// migration `blacklist_expires_at.sql`, une entrée peut porter `expires_at`.
// RÈGLE : une entrée dont l'échéance est passée est INACTIVE partout où la
// blacklist est vérifiée — même si le cron (`/api/cron/blacklist-expiry`) n'a
// pas encore basculé `active` à false. Le cron ne fait que rendre l'état
// visible et journalisé ; c'est ce prédicat qui fait foi entre-temps.
//
// Module PUR (aucun accès base) : importable par les écrans comme par les
// routes et les helpers de vérification.

export type ExpirableBlacklistEntry = {
  active?: boolean | null;
  expires_at?: string | null;
};

function expiryTime(entry: ExpirableBlacklistEntry): number | null {
  if (!entry.expires_at) return null;
  const t = Date.parse(entry.expires_at);
  return Number.isNaN(t) ? null : t;
}

/** Échéance passée (quel que soit `active`). */
export function isBlacklistEntryExpired(
  entry: ExpirableBlacklistEntry,
  now: Date = new Date()
): boolean {
  const t = expiryTime(entry);
  return t !== null && t <= now.getTime();
}

/**
 * L'entrée s'applique-t-elle ? `active` ET (pas d'échéance OU échéance future).
 * `active` absent (ligne lue sans la colonne) compte comme actif : les
 * requêtes de vérification filtrent déjà `active = true`.
 */
export function isBlacklistEntryEffective(
  entry: ExpirableBlacklistEntry,
  now: Date = new Date()
): boolean {
  if (entry.active === false) return false;
  return !isBlacklistEntryExpired(entry, now);
}

/** Durée maximale saisissable (10 ans) : au-delà, c'est un ban définitif. */
export const BLACKLIST_MAX_DURATION_DAYS = 3650;

/**
 * Échéance à écrire, depuis une date explicite OU une durée en jours.
 *   - `undefined` : rien de demandé (ne pas toucher la colonne) ;
 *   - `null`      : sanction sans échéance ;
 *   - ISO         : échéance.
 * `expires_at` l'emporte sur `duration_days` si les deux sont fournis.
 */
export function resolveBlacklistExpiry(
  input: { expires_at?: string | null; duration_days?: number | null },
  now: Date = new Date()
): string | null | undefined {
  if (input.expires_at !== undefined) {
    if (input.expires_at === null) return null;
    const t = Date.parse(input.expires_at);
    return Number.isNaN(t) ? undefined : new Date(t).toISOString();
  }
  if (input.duration_days === null) return null;
  if (typeof input.duration_days === 'number' && input.duration_days > 0) {
    return new Date(
      now.getTime() + input.duration_days * 86_400_000
    ).toISOString();
  }
  return undefined;
}

/** Message renvoyé quand une échéance est demandée avant la migration. */
export const BLACKLIST_EXPIRY_MIGRATION_PENDING =
  'Les sanctions temporaires ne sont pas encore disponibles : la migration blacklist_expires_at n’est pas appliquée.';
