// features/player/_shared/shell/playerNavItems.ts — les entrées de la
// navigation de la coquille joueuse (lot P8) : barre basse en PWA mobile,
// rail latéral en desktop. Quatre entrées, dans cet ordre (plan § « Le Ruban »
// sur une surface player) : Accueil, Équipe, Matchs, TCG.
//
// Prédicat pur, testé sans React (tests/unit/playerShell.test.tsx).

export type PlayerNavKey = 'home' | 'team' | 'matches' | 'tcg';

export type PlayerNavItem = {
  key: PlayerNavKey;
  href: string;
  /** Autres routes où l'entrée reste allumée (préfixes de `router.pathname`). */
  also?: string[];
};

export const PLAYER_NAV_ITEMS: readonly PlayerNavItem[] = [
  { key: 'home', href: '/player' },
  {
    key: 'team',
    href: '/player/manage-team',
    also: ['/player/my-teams', '/player/join-team', '/player/request-captain'],
  },
  { key: 'matches', href: '/player/matches', also: ['/player/match/'] },
  { key: 'tcg', href: '/player/tcg' },
];

/**
 * L'entrée est-elle celle de la page courante ? `/player` seulement en
 * correspondance exacte (sinon tout l'espace l'allumerait) ; les autres par
 * préfixe de segment (`/player/tcg/echanges` allume TCG, pas `/player/tcg-guide`).
 */
export function isPlayerNavItemActive(
  pathname: string,
  item: PlayerNavItem
): boolean {
  if (item.href === '/player') return pathname === '/player';
  const within = (ref: string) =>
    ref.endsWith('/')
      ? pathname.startsWith(ref)
      : pathname === ref || pathname.startsWith(`${ref}/`);
  return within(item.href) || (item.also ?? []).some(within);
}
