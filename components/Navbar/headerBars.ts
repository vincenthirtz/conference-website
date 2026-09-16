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
 * Une seule barre à la fois — et jamais aucune quand une page en réclame une.
 *
 * SUR /player, LA BARRE JOUEUSE GAGNE, staff compris. Avant, « staff » primait
 * partout : une capitaine qui est AUSSI staff n'avait sur son espace joueuse
 * que la barre admin, sans « Mes matchs », « Notifications » ni « Profil ». On
 * a écarté l'empilement des deux barres (88 px d'en-tête sur mobile, et tous
 * les `pt-24` de l'espace joueuse à revoir la veille du tournoi) : la barre
 * joueuse porte à la place un lien retour vers l'administration. Hors /player,
 * rien ne change — et l'admin inspecte l'espace d'une joueuse depuis
 * `/admin/users/[id]/player-view`, qui reste sous la barre admin.
 *
 * Invariant « jamais sans en-tête » (tests/unit/navbarHeaderNeverEmpty.test.ts)
 * préservé : `PlayerTopBar` ne se supprime jamais elle-même, et la barre admin
 * n'est montrée que si elle a au moins un lien.
 */
export function resolveHeaderBars(input: HeaderBarsInput): HeaderBars {
  const isPlayerRoute = input.pathname.startsWith('/player');
  const showPlayerBar =
    isPlayerRoute &&
    !input.staffLoading &&
    !input.playerLoading &&
    input.hasPlayerUser;
  const showAdminBar =
    !showPlayerBar &&
    !input.staffLoading &&
    input.isStaff &&
    input.adminLinkCount > 0;
  return { showAdminBar, showPlayerBar };
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
