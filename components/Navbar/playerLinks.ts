export type PlayerLinkKey =
  | 'dashboard'
  | 'matches'
  | 'discovery'
  | 'notifications'
  | 'profile'
  | 'library';

export type PlayerLink = { key: PlayerLinkKey; ref: string };

const BASE_PLAYER_LINKS: PlayerLink[] = [
  { key: 'dashboard', ref: '/player' },
  { key: 'matches', ref: '/player/matches' },
  { key: 'discovery', ref: '/player/discovery' },
  { key: 'notifications', ref: '/player/notifications' },
  { key: 'profile', ref: '/player/profile' },
];

// Women's Library (lot 4) : un lien du menu compte, pas un 6e onglet de la
// barre basse (figée à 5 entrées, cf. playerNavItems). Masqué tant que
// `NEXT_PUBLIC_LIBRARY_ENTRY` ne vaut pas `1` (bêta fermée,
// features/player/library/entry.ts). Le drapeau est lu ICI, sans importer ce
// module : la navbar est sur toutes les pages publiques, qui ne doivent pas
// atteindre features/player (adminBoundariesGuard).
const LIBRARY_LINK: PlayerLink = { key: 'library', ref: '/player/library' };

/** Les liens de l'espace joueuse, avec ou sans l'entrée de la Library. */
export function buildPlayerLinks(libraryEntry: boolean): PlayerLink[] {
  return libraryEntry
    ? [...BASE_PLAYER_LINKS, LIBRARY_LINK]
    : [...BASE_PLAYER_LINKS];
}

export const PLAYER_LINKS: PlayerLink[] = buildPlayerLinks(
  process.env.NEXT_PUBLIC_LIBRARY_ENTRY === '1'
);
