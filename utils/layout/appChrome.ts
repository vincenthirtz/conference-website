// utils/layout/appChrome.ts
//
// Ce que la coquille de l'application (`pages/_app.tsx`) monte autour d'une
// page : en-tête, pied de page, réseaux flottants, mesure d'audience,
// indexation, manifeste PWA. Refonte des menus, plan 9.
//
// Ces règles étaient des conditions éparpillées dans `_app.tsx`
// (`!isAdmin && …`, `!isEmbed && …`) ; chaque cas particulier se devinait en
// relisant le rendu. Elles sont ici, UNE ligne par cas, testées
// (tests/unit/appChrome.test.ts).
//
// PUR : ne lit que le motif de route (`router.pathname`).

/**
 * Surface « Le Ruban » posée par `_app` (`data-surface`) : l'admin, l'espace
 * joueuse, ou aucune (site public, qui ne bouge pas).
 */
export type RubanSurface = 'admin' | 'player';

/**
 * Pages de l'espace joueuse HORS `/player/*` : le périmètre de
 * docs/PLAN-industrialisation-joueur.md § 1 (scripts/player-metrics.ts,
 * `PAGES`). Motifs de route exacts (`router.pathname`) : `/team/[slug]` (fiche
 * publique), `/rejoindre` (marché public) et `/team/create` (création d'équipe
 * anonyme, publique — décision du 2026-09-29 : pas de Ruban sur le public) n'en
 * sont pas.
 */
export const PLAYER_SPACE_ROUTES: ReadonlySet<string> = new Set([
  '/espace-capitaine',
  '/team/[slug]/edit',
  '/checkin/[token]',
  '/invitation/[token]',
  '/rejoindre/[token]',
]);

export type AppChrome = {
  /** Page nue : ni en-tête, ni pied, ni bannière (iframes, overlays OBS). */
  bare: boolean;
  navbar: boolean;
  footer: boolean;
  floatingSocials: boolean;
  analytics: boolean;
  noindex: boolean;
  /** Surface « application » (admin, espace joueuse). */
  appScope: boolean;
  /** `data-surface` « Le Ruban » (null : site public). */
  surface: RubanSurface | null;
  manifest: string;
};

export function resolveAppChrome(pathname: string): AppChrome {
  const isAdmin = pathname === '/admin' || pathname.startsWith('/admin/');
  // `/player/[userId]` : profil PUBLIC (ISR, indexable) sous /player pour des
  // raisons de routage — il relève du site, pas de l'espace privé.
  const isPlayer =
    (pathname === '/player' || pathname.startsWith('/player/')) &&
    pathname !== '/player/[userId]';
  const isEmbed = pathname.startsWith('/embed');
  const isOverlay = pathname.startsWith('/overlay');
  // Aperçus de développement (404 en production) : ils montent leur propre
  // coquille, comme un overlay.
  const isDevPreview = pathname.startsWith('/dev/');
  // Retours OAuth / liens magiques et accès refusé : 200 sans contenu à indexer.
  const isTechnical = pathname.startsWith('/auth/') || pathname === '/403';

  const bare = isEmbed || isOverlay || isDevPreview;
  const appScope = isAdmin || isPlayer;
  // Distinct d'`isPlayer` : la surface couvre aussi les parcours joueuse hors
  // /player (création d'équipe, check-in à jeton…) sans toucher à leur
  // indexation ni à leur manifeste.
  const surface: RubanSurface | null = isAdmin
    ? 'admin'
    : isPlayer || PLAYER_SPACE_ROUTES.has(pathname)
      ? 'player'
      : null;

  return {
    bare,
    navbar: !bare,
    // Admin : un outil interne, pas le site — le pied de page marketing n'y
    // apportait que du défilement (décision du plan 9). L'espace joueuse le
    // garde : c'est par lui qu'on rejoint le reste du site.
    footer: !bare && !isAdmin,
    floatingSocials: !bare && !isAdmin,
    // Surfaces internes non mesurées : leur trafic fausserait l'entonnoir.
    analytics: !bare && !isAdmin,
    noindex: appScope || bare || isTechnical,
    appScope,
    surface,
    manifest: isAdmin
      ? '/admin/manifest.webmanifest'
      : isPlayer
        ? '/player/manifest.webmanifest'
        : '/site.webmanifest',
  };
}
