// lib/analytics/config.ts
//
// Configuration de l'analytics web, volontairement AGNOSTIQUE du fournisseur.
//
// Deux fournisseurs sont supportés — Plausible et Umami — parce qu'ils partagent
// les propriétés qui nous intéressent : sans cookie, sans identifiant
// persistant, auto-hébergeables, et pilotés par un simple `<script>` + une
// fonction globale. Le choix se fait par variable d'environnement, ce qui évite
// de trancher « Plausible Cloud vs Umami sur la Freebox » dans le code.
//
// Rien n'est chargé tant que les trois variables ne sont pas posées : sur un
// environnement non configuré (dev local, preview) l'analytics est un no-op
// complet et la CSP reste byte-identique (cf. proxy.ts).

export type AnalyticsProvider = 'plausible' | 'umami';

export type AnalyticsConfig = {
  provider: AnalyticsProvider;
  /** Origine du collecteur, sans slash final (ex. `https://plausible.io`). */
  host: string;
  /** Plausible → `data-domain` ; Umami → `data-website-id`. */
  siteId: string;
  /** URL complète du script à injecter. */
  scriptSrc: string;
};

export type RawAnalyticsEnv = {
  provider?: string;
  host?: string;
  siteId?: string;
};

const PROVIDERS: readonly string[] = ['plausible', 'umami'];

/** Retire le(s) slash(es) final(aux) — `https://x.fr/` et `https://x.fr` équivalents. */
function normalizeHost(raw: string): string {
  return raw.trim().replace(/\/+$/, '');
}

/**
 * Origine du collecteur telle qu'elle peut être insérée dans un en-tête CSP,
 * ou `''` si elle ne passe pas le filtre.
 *
 * Partagée avec le middleware (proxy.ts), qui l'ajoute à `script-src` et
 * `connect-src`. Le filtre est volontairement plus strict que `normalizeHost` :
 * https obligatoire (pas de dégradation en clair) et RIEN d'autre qu'un hôte
 * et un port éventuel — pas de chemin, pas d'espace, pas de `;` ni de `'`, qui
 * permettraient de clore la directive et d'en injecter une autre.
 */
export function sanitizeAnalyticsOrigin(raw: string | undefined): string {
  const host = normalizeHost(raw || '');
  return /^https:\/\/[A-Za-z0-9.-]+(:\d+)?$/.test(host) ? host : '';
}

/**
 * Chemin du script selon le fournisseur.
 *
 * Les deux variantes sont MANUELLES à dessein : le script par défaut de
 * Plausible comme celui d'Umami suivent tout seuls les navigations via l'API
 * History, ce qui ferait double comptage avec notre propre envoi de pageview
 * sur `router.events` (cf. AnalyticsScript). On garde donc la main.
 */
function scriptPath(provider: AnalyticsProvider): string {
  return provider === 'plausible' ? '/js/script.manual.js' : '/script.js';
}

/**
 * Construit la config à partir de valeurs brutes. Pure et testable : c'est
 * `readAnalyticsConfig()` qui va chercher `process.env`.
 *
 * Retourne `null` dès qu'une valeur manque ou que le fournisseur est inconnu —
 * on préfère un analytics silencieusement désactivé à une config à moitié
 * appliquée qui enverrait des événements dans le vide.
 */
export function buildAnalyticsConfig(
  raw: RawAnalyticsEnv
): AnalyticsConfig | null {
  const provider = (raw.provider || '').trim().toLowerCase();
  const host = normalizeHost(raw.host || '');
  const siteId = (raw.siteId || '').trim();

  if (!PROVIDERS.includes(provider)) return null;
  if (!host || !siteId) return null;
  // Le collecteur doit être une origine absolue : un chemin relatif ne pourrait
  // pas être autorisé dans la CSP côté middleware.
  if (!/^https?:\/\//i.test(host)) return null;

  const typedProvider = provider as AnalyticsProvider;
  return {
    provider: typedProvider,
    host,
    siteId,
    scriptSrc: `${host}${scriptPath(typedProvider)}`,
  };
}

/**
 * Config effective de l'environnement courant.
 *
 * Les `process.env.NEXT_PUBLIC_*` sont référencés LITTÉRALEMENT : Next remplace
 * ces expressions à la compilation, un accès dynamique (`env[nom]`) ne serait
 * pas inliné dans le bundle client et vaudrait toujours `undefined`.
 */
export function readAnalyticsConfig(): AnalyticsConfig | null {
  return buildAnalyticsConfig({
    provider: process.env.NEXT_PUBLIC_ANALYTICS_PROVIDER,
    host: process.env.NEXT_PUBLIC_ANALYTICS_HOST,
    siteId: process.env.NEXT_PUBLIC_ANALYTICS_SITE_ID,
  });
}
