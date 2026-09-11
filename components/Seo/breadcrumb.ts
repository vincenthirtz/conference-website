// components/Seo/breadcrumb.ts
//
// Fil d'Ariane JSON-LD (BreadcrumbList) émis automatiquement par DefaultSeo.
//
// L'ancienne version transformait CHAQUE segment d'URL en élément du fil :
// `/tournament/<uuid>/bracket` donnait « Accueil › Tournament › <uuid> ›
// Bracket du tournoi… », avec des liens vers /tournament (404) et un UUID
// brut comme nom. Google lit ces fils pour le chemin affiché sous le titre
// du résultat : un intermédiaire qui mène à une 404 ou qui porte un
// identifiant n'aide personne, et ça se voit dans la Search Console.
//
// Règles :
//   - un segment intermédiaire n'est émis que s'il correspond à une vraie page
//     liste, déclarée dans INTERMEDIATES (ex. /tournament → /tournaments) ;
//   - un segment DYNAMIQUE (`[id]`, `[slug]`…) n'est jamais émis comme nom :
//     on ne connaît pas le nom de l'entité à ce niveau, on l'omet ;
//   - le dernier élément porte le titre de la page, ou son segment statique
//     mis en forme ; dynamique sans titre → omis ;
//   - pas de fil si la page fournit déjà le sien, si c'est la home, une page
//     d'erreur, ou si le fil se réduirait à « Accueil ».
//
// Les libellés restent en français : les robots voient le rendu SSR, qui est
// toujours FR (cf. LanguageProvider). Ce n'est pas du texte affiché.

export type BreadcrumbListItem = {
  '@type': 'ListItem';
  position: number;
  name: string;
  item: string;
};

export type BreadcrumbSchema = {
  '@context': 'https://schema.org';
  '@type': 'BreadcrumbList';
  itemListElement: BreadcrumbListItem[];
};

/**
 * Préfixe de ROUTE (motif Next, pas l'URL) → page liste réelle qui le
 * représente. Un préfixe absent d'ici n'a pas de page index (/team, /match,
 * /player…) et n'apparaît pas dans le fil.
 */
const INTERMEDIATES: Record<string, { path: string; name: string }> = {
  '/tournament': { path: '/tournaments', name: 'Tournois' },
  '/news': { path: '/news', name: 'Actualités' },
  '/leagues': { path: '/leagues', name: 'Ligues & saisons' },
  '/scrim': { path: '/scrims', name: 'Scrims' },
  '/developpeurs': { path: '/developpeurs', name: 'Développeurs' },
  '/partenaires': { path: '/partenaires', name: 'Partenaires' },
  '/rejoindre': { path: '/rejoindre', name: 'Trouver une équipe' },
};

/** Routes d'erreur : l'URL affichée n'est pas celle de la page rendue. */
const ERROR_ROUTES = new Set(['/404', '/500', '/_error']);

const HOME_NAME = 'Accueil';

function isDynamicSegment(segment: string): boolean {
  return segment.startsWith('[') && segment.endsWith(']');
}

function humanize(segment: string): string {
  let decoded = segment;
  try {
    decoded = decodeURIComponent(segment);
  } catch {
    // Séquence % invalide : on garde le segment tel quel.
  }
  return decoded.replace(/-/g, ' ').replace(/^\p{L}/u, (c) => c.toUpperCase());
}

function splitPath(path: string): string[] {
  return path.split(/[?#]/)[0].split('/').filter(Boolean);
}

/**
 * Vrai si l'un des JSON-LD de la page est déjà un BreadcrumbList (à la racine
 * ou dans un `@graph`). Deux fils contradictoires sur une même URL, c'est ce
 * que faisait /tournament/[id], qui construit le sien avec le vrai nom.
 */
export function hasBreadcrumbList(
  jsonLd: Record<string, unknown> | Record<string, unknown>[] | undefined
): boolean {
  if (!jsonLd) return false;
  const entries = Array.isArray(jsonLd) ? jsonLd : [jsonLd];
  return entries.some((entry) => {
    if (!entry || typeof entry !== 'object') return false;
    const type = entry['@type'];
    if (type === 'BreadcrumbList') return true;
    if (Array.isArray(type) && type.includes('BreadcrumbList')) return true;
    const graph = entry['@graph'];
    return Array.isArray(graph)
      ? hasBreadcrumbList(graph as Record<string, unknown>[])
      : false;
  });
}

export type BuildBreadcrumbInput = {
  /** URL réelle (`router.asPath`), query/hash tolérés. */
  path: string;
  /** Motif de route Next (`router.pathname`), ex. `/tournament/[id]/bracket`. */
  route: string;
  /** Titre résolu de la page (sans le suffixe du site). */
  title?: string;
  /** Origine absolue, sans slash final. */
  baseUrl: string;
};

export function buildBreadcrumbSchema({
  path,
  route,
  title,
  baseUrl,
}: BuildBreadcrumbInput): BreadcrumbSchema | null {
  if (!baseUrl) return null;
  if (ERROR_ROUTES.has(route)) return null;

  const pathSegments = splitPath(path);
  const routeSegments = splitPath(route);
  if (pathSegments.length === 0) return null; // home
  // Route catch-all ou URL réécrite : impossible d'aligner motif et URL, on
  // préfère ne rien dire plutôt qu'un fil faux.
  if (pathSegments.length !== routeSegments.length) return null;

  const crumbs: { name: string; path: string }[] = [];
  const last = pathSegments.length - 1;

  for (let i = 0; i < last; i++) {
    const intermediate =
      INTERMEDIATES[`/${routeSegments.slice(0, i + 1).join('/')}`];
    if (intermediate) crumbs.push(intermediate);
  }

  const currentPath = `/${pathSegments.join('/')}`;
  const currentName = title?.trim()
    ? title.trim()
    : isDynamicSegment(routeSegments[last])
      ? null
      : humanize(pathSegments[last]);
  if (currentName && !crumbs.some((c) => c.path === currentPath)) {
    crumbs.push({ name: currentName, path: currentPath });
  }

  if (crumbs.length === 0) return null;

  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [{ name: HOME_NAME, path: '' }, ...crumbs].map(
      (crumb, i) => ({
        '@type': 'ListItem' as const,
        position: i + 1,
        name: crumb.name,
        item: `${baseUrl}${crumb.path}`,
      })
    ),
  };
}
