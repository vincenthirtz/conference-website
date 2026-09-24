// components/Navbar/headerBars.ts
//
// Quelle barre d'en-tête afficher, et quel onglet joueuse est « actif ».
// Prédicats purs, sortis de `navbar.tsx` / `PlayerTopBar.tsx` pour être testés
// sans monter React (cf. tests/unit/navbarHeaderBars.test.ts).

export type HeaderBarsInput = {
  pathname: string;
  /** Session staff encore en cours de résolution. */
  staffLoading: boolean;
  isStaff: boolean;
  /** Liens admin qui passent le filtre de rôle. */
  adminLinkCount: number;
  playerLoading: boolean;
  hasPlayerUser: boolean;
};

export type HeaderBars = {
  showAdminBar: boolean;
  showPlayerBar: boolean;
};

/**
 * Les trois espaces du site. La barre d'en-tête dépend de l'ESPACE de la page,
 * pas de qui est connecté.
 *
 * `/player/[userId]` est le profil PUBLIC d'une joueuse (ISR, indexable) : il
 * vit sous /player pour des raisons de routage mais appartient au site public
 * — même règle que `_app.tsx`.
 */
export type NavSpace = 'public' | 'player' | 'admin';

export function routeSpace(pathname: string): NavSpace {
  if (pathname === '/admin' || pathname.startsWith('/admin/')) return 'admin';
  if (
    (pathname === '/player' || pathname.startsWith('/player/')) &&
    pathname !== '/player/[userId]'
  ) {
    return 'player';
  }
  return 'public';
}

/**
 * Une seule barre à la fois — et jamais aucune quand une page en réclame une.
 *
 * LA BARRE SUIT L'ESPACE (2026-09-24). Avant, la barre admin s'affichait
 * PARTOUT dès qu'on était staff, et elle remplace le menu public : sur
 * l'accueil ou une page tournoi, un membre du staff n'avait plus le menu du
 * site — seulement un sous-menu « Site ». Désormais :
 *   - espace public  → menu public, pour tout le monde, staff compris ;
 *   - /admin         → barre admin (si staff avec au moins un lien) ;
 *   - /player        → barre joueuse (si connectée), staff compris.
 * Le passage d'un espace à l'autre se fait par le menu de compte
 * (`accountLinks`), présent dans les trois.
 *
 * Invariant « jamais sans en-tête » (tests/unit/navbarHeaderNeverEmpty.test.ts)
 * préservé : `PlayerTopBar` ne se supprime jamais elle-même, et la barre admin
 * n'est montrée que si elle a au moins un lien — sinon le menu public reste.
 */
export function resolveHeaderBars(input: HeaderBarsInput): HeaderBars {
  const space = routeSpace(input.pathname);
  const showPlayerBar =
    space === 'player' &&
    !input.staffLoading &&
    !input.playerLoading &&
    input.hasPlayerUser;
  const showAdminBar =
    space === 'admin' &&
    !input.staffLoading &&
    input.isStaff &&
    input.adminLinkCount > 0;
  return { showAdminBar, showPlayerBar };
}

export type AccountLinkKey = 'player' | 'profile' | 'admin';
export type AccountLink = { key: AccountLinkKey; href: string };

/**
 * Le menu de compte : de quoi rejoindre les AUTRES espaces depuis celui où
 * l'on est. Sur le site public, une joueuse connectée n'avait aucun lien vers
 * son espace (les boutons Connexion / Inscription disparaissaient sans être
 * remplacés) ; dans l'admin, rien ne menait à l'espace joueuse.
 *
 * `canAdmin` : staff avec au moins un lien admin — la même garde que la barre.
 */
export function accountLinks(input: {
  space: NavSpace;
  hasUser: boolean;
  canAdmin: boolean;
}): AccountLink[] {
  if (!input.hasUser) return [];
  const out: AccountLink[] = [];
  if (input.space !== 'player') {
    out.push({ key: 'player', href: '/player' });
    out.push({ key: 'profile', href: '/player/profile' });
  }
  if (input.canAdmin && input.space !== 'admin') {
    out.push({ key: 'admin', href: '/admin' });
  }
  return out;
}

/**
 * Sous-routes rattachées à un onglet sans en partager le préfixe. Le fil d'un
 * match vit sur `/player/match/[id]` : sans cette table, « Mes matchs »
 * s'éteignait dès qu'on ouvrait l'un d'eux.
 */
const EXTRA_ACTIVE_PREFIXES: Record<string, string[]> = {
  '/player/matches': ['/player/match/'],
};

/**
 * Onglet actif. `/player` (tableau de bord) ne l'est qu'en correspondance
 * exacte — sinon il le serait sur toutes les pages de l'espace. Les autres le
 * sont aussi sur leurs sous-routes.
 */
export function isPlayerLinkActive(pathname: string, ref: string): boolean {
  if (ref === '/player') return pathname === '/player';
  if (pathname === ref || pathname.startsWith(`${ref}/`)) return true;
  return (EXTRA_ACTIVE_PREFIXES[ref] ?? []).some((prefix) =>
    pathname.startsWith(prefix)
  );
}
