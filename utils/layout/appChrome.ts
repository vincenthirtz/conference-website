// utils/layout/appChrome.ts
//
// Ce que la coquille de l'application (`pages/_app.tsx`) monte autour d'une
// page : en-tête, pied de page, réseaux flottants, mesure d'audience,
// indexation, manifeste PWA. Refonte des menus, plan 9.
//
// Ces règles étaient des conditions éparpillées dans `_app.tsx`
// (`!isCaster && …`, `!isAdmin && !isCaster && …`) ; chaque cas particulier se
// devinait en relisant le rendu. Elles sont ici, UNE ligne par cas, testées
// (tests/unit/appChrome.test.ts).
//
// PUR : ne lit que le motif de route (`router.pathname`).

export type AppChrome = {
  /** Page nue : ni en-tête, ni pied, ni bannière (iframes, overlays OBS). */
  bare: boolean;
  navbar: boolean;
  footer: boolean;
  floatingSocials: boolean;
  analytics: boolean;
  noindex: boolean;
  /** Surface « application » (admin, cockpit caster, espace joueuse). */
  appScope: boolean;
  manifest: string;
};

export function resolveAppChrome(pathname: string): AppChrome {
  const isAdmin = pathname === '/admin' || pathname.startsWith('/admin/');
  const isCaster = pathname === '/caster' || pathname.startsWith('/caster/');
  // `/player/[userId]` : profil PUBLIC (ISR, indexable) sous /player pour des
  // raisons de routage — il relève du site, pas de l'espace privé.
  const isPlayer =
    (pathname === '/player' || pathname.startsWith('/player/')) &&
    pathname !== '/player/[userId]';
  const isEmbed = pathname.startsWith('/embed');
  const isOverlay = pathname.startsWith('/overlay');
  // Retours OAuth / liens magiques et accès refusé : 200 sans contenu à indexer.
  const isTechnical = pathname.startsWith('/auth/') || pathname === '/403';

  const bare = isEmbed || isOverlay;
  const appScope = isAdmin || isCaster || isPlayer;

  return {
    bare,
    // Le cockpit caster a sa propre barre légère.
    navbar: !bare && !isCaster,
    // Admin : un outil interne, pas le site — le pied de page marketing n'y
    // apportait que du défilement (décision du plan 9). L'espace joueuse le
    // garde : c'est par lui qu'on rejoint le reste du site.
    footer: !bare && !isCaster && !isAdmin,
    floatingSocials: !bare && !isCaster && !isAdmin,
    // Surfaces internes non mesurées : leur trafic fausserait l'entonnoir.
    analytics: !bare && !isCaster && !isAdmin,
    noindex: appScope || bare || isTechnical,
    appScope,
    manifest: isAdmin
      ? '/admin/manifest.webmanifest'
      : isCaster
        ? '/caster/manifest.webmanifest'
        : isPlayer
          ? '/player/manifest.webmanifest'
          : '/site.webmanifest',
  };
}
