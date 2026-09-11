// utils/social/oauthReturn.ts
//
// Le retour d'un parcours OAuth (Instagram, TikTok) arrive dans l'URL du
// panneau Réseaux : `?tab=social&instagram=error&reason=bad_state`. Les deux
// callbacks l'écrivaient, personne ne le lisait — une reconnexion Instagram
// ratée ramenait sur l'admin sans un mot, la cause n'existant que dans les logs
// Netlify (2026-09-11). Logique PURE : lecture et nettoyage de la query.

export type OauthPlatform = 'instagram' | 'tiktok';

export type OauthOutcome = 'connected' | 'cancelled' | 'error';

export type OauthReturn = {
  platform: OauthPlatform;
  outcome: OauthOutcome;
  /** Code court posé par le callback (`bad_state`, `exchange_failed`…). */
  reason: string | null;
  /** Compte connecté, sur un succès. */
  handle: string | null;
};

const PLATFORMS: readonly OauthPlatform[] = ['instagram', 'tiktok'];
const OUTCOMES: ReadonlySet<string> = new Set([
  'connected',
  'cancelled',
  'error',
]);

/** Paramètres posés par les callbacks, à retirer une fois le message affiché. */
export const OAUTH_QUERY_KEYS = [
  'instagram',
  'tiktok',
  'reason',
  'handle',
] as const;

function first(v: unknown): string | null {
  const value = Array.isArray(v) ? v[0] : v;
  return typeof value === 'string' && value ? value : null;
}

/** Le retour OAuth porté par la query, ou `null` s'il n'y en a pas. */
export function readOauthReturn(
  query: Record<string, unknown>
): OauthReturn | null {
  for (const platform of PLATFORMS) {
    const outcome = first(query[platform]);
    if (outcome && OUTCOMES.has(outcome)) {
      return {
        platform,
        outcome: outcome as OauthOutcome,
        reason: first(query.reason),
        handle: first(query.handle),
      };
    }
  }
  return null;
}

/**
 * La query sans les paramètres OAuth : un rechargement ne doit pas rejouer le
 * message, et `tab=social` doit rester pour ne pas changer d'onglet.
 */
export function withoutOauthParams(
  query: Record<string, unknown>
): Record<string, string | string[]> {
  const drop: ReadonlySet<string> = new Set(OAUTH_QUERY_KEYS);
  const out: Record<string, string | string[]> = {};
  for (const [key, value] of Object.entries(query)) {
    if (drop.has(key)) continue;
    if (typeof value === 'string') out[key] = value;
    else if (Array.isArray(value)) {
      out[key] = value.filter((v): v is string => typeof v === 'string');
    }
  }
  return out;
}
