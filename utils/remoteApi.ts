// utils/remoteApi.ts
//
// Bascule progressive des appels navigateur vers l'API sortie du site
// (dépôt conference-api, servie sur api.owwomenscup.fr derrière CloudFront).
//
// UN SEUL POINT DE BASCULE. Le front appelle `/api/...` en relatif depuis ~300
// fichiers. Plutôt que de les toucher un à un, `installRemoteApiFetch()` (posé
// au chargement de _app) réécrit ces URL vers l'API distante — mais SEULEMENT
// pour les familles listées dans NEXT_PUBLIC_API_REMOTE_PREFIXES. On bascule et
// on revient en arrière famille par famille en changeant une variable Netlify,
// sans toucher au code.
//
// VARIABLES ABSENTES = COMPORTEMENT D'AVANT, À L'IDENTIQUE : aucune réécriture,
// fetch natif intact, CSP inchangée (cf. proxy.ts).
//
// CROSS-ORIGIN SANS COOKIES. Les appels authentifiés portent le jeton Supabase
// en `Authorization: Bearer` (useAdminFetch & co) ; l'API distante répond avec
// `Access-Control-Allow-Origin: *`, sans credentials. Les cookies du site
// (session `sb-*`, tenant actif, états OAuth) sont posés sur owwomenscup.fr et
// ne partent PAS vers api.owwomenscup.fr. D'où COOKIE_BOUND_PREFIXES : ces
// familles lisent des cookies côté serveur et restent sur le site quoi que dise
// la variable, jusqu'à une étape dédiée au domaine des cookies.
//
// Ce fichier part dans le navigateur : rien de serveur ici.

/**
 * Familles qui dépendent d'un cookie du site, jamais réécrites :
 *   - /api/admin/   utils/staff.ts lit le cookie de tenant actif sur CHAQUE route
 *   - /api/auth/    flux OAuth (Battle.net, Twitch, Discord) : états en cookie
 *   - /api/twitch/  callback broadcaster (cookie d'état)
 *   - /api/onboard/ suivi d'onboarding (cookie)
 */
export const COOKIE_BOUND_PREFIXES = [
  '/api/admin/',
  '/api/auth/',
  '/api/twitch/',
  '/api/onboard/',
] as const;

export type RemoteApiConfig = {
  /** Origine https de l'API distante, sans slash final. */
  origin: string;
  /** Préfixes de chemin à réécrire, chacun commençant par `/api/`. */
  prefixes: string[];
};

const ORIGIN_RE = /^https:\/\/[A-Za-z0-9.-]+(:\d+)?$/;

/**
 * Origine https stricte (sans chemin), ou '' si invalide. Aussi utilisée par
 * proxy.ts pour la CSP : la valeur part telle quelle dans un en-tête HTTP.
 */
export function sanitizeApiOrigin(raw: string | undefined): string {
  const trimmed = (raw || '').trim().replace(/\/+$/, '');
  return ORIGIN_RE.test(trimmed) ? trimmed : '';
}

/**
 * Config à partir des valeurs brutes. Pure et testable. `null` dès qu'il manque
 * l'origine ou qu'aucun préfixe exploitable ne reste : mieux vaut ne rien
 * réécrire qu'une config à moitié appliquée.
 */
export function buildRemoteApiConfig(
  baseRaw: string | undefined,
  prefixesRaw: string | undefined
): RemoteApiConfig | null {
  const origin = sanitizeApiOrigin(baseRaw);
  if (!origin) return null;
  const prefixes = (prefixesRaw || '')
    .split(',')
    .map((p) => p.trim())
    .filter((p) => p.startsWith('/api/') && !/[\s?#]/.test(p))
    .filter(
      (p) =>
        !COOKIE_BOUND_PREFIXES.some(
          (blocked) => p.startsWith(blocked) || blocked.startsWith(p)
        )
    );
  return prefixes.length ? { origin, prefixes } : null;
}

/** Lit la config depuis l'env (références littérales : inlinées au build). */
export function readRemoteApiConfig(): RemoteApiConfig | null {
  return buildRemoteApiConfig(
    process.env.NEXT_PUBLIC_API_BASE_URL,
    process.env.NEXT_PUBLIC_API_REMOTE_PREFIXES
  );
}

/**
 * URL réécrite vers l'API distante, ou `null` si l'appel doit rester sur le
 * site. N'accepte que les chemins relatifs `/api/...` ou les URL absolues de
 * la page courante (`pageOrigin`) : un appel vers un tiers n'est jamais touché.
 */
export function remoteApiUrl(
  input: string,
  config: RemoteApiConfig,
  pageOrigin: string
): string | null {
  let path: string;
  if (input.startsWith('/api/')) {
    path = input;
  } else {
    let u: URL;
    try {
      u = new URL(input);
    } catch {
      return null;
    }
    if (u.origin !== pageOrigin || !u.pathname.startsWith('/api/')) return null;
    path = u.pathname + u.search + u.hash;
  }
  const pathname = path.split(/[?#]/, 1)[0];
  if (COOKIE_BOUND_PREFIXES.some((p) => pathname.startsWith(p))) return null;
  if (!config.prefixes.some((p) => pathname.startsWith(p))) return null;
  return config.origin + path;
}

const INSTALLED = Symbol.for('owwc.remoteApiFetch');

/**
 * Remplace window.fetch par une version qui réécrit les familles basculées.
 * Idempotent ; sans config, ne fait rien (fetch natif intact). Les objets
 * `Request` passent tels quels : on ne reconstruit pas un corps déjà lu.
 */
export function installRemoteApiFetch(
  config: RemoteApiConfig | null = readRemoteApiConfig()
): void {
  if (!config || typeof window === 'undefined') return;
  const w = window as typeof window & { [INSTALLED]?: true };
  if (w[INSTALLED]) return;
  w[INSTALLED] = true;

  const nativeFetch = window.fetch.bind(window);
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const raw =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : null;
    const target =
      raw === null ? null : remoteApiUrl(raw, config, window.location.origin);
    return nativeFetch(target ?? input, init);
  };
}
