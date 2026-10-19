export type PlayerLinkKey =
  | 'dashboard'
  | 'matches'
  | 'discovery'
  | 'notifications'
  | 'profile'
  | 'library';

export type PlayerLink = { key: PlayerLinkKey; ref: string };

export const PLAYER_LINKS: PlayerLink[] = [
  { key: 'dashboard', ref: '/player' },
  { key: 'matches', ref: '/player/matches' },
  { key: 'discovery', ref: '/player/discovery' },
  { key: 'notifications', ref: '/player/notifications' },
  { key: 'profile', ref: '/player/profile' },
  // Women's Library (lot 4) : un lien du menu compte, pas un 6e onglet de la
  // barre basse (figée à 5 entrées, cf. playerNavItems).
  { key: 'library', ref: '/player/library' },
];
