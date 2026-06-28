export type PlayerLinkKey =
  | 'dashboard'
  | 'matches'
  | 'notifications'
  | 'profile';

export type PlayerLink = { key: PlayerLinkKey; ref: string };

export const PLAYER_LINKS: PlayerLink[] = [
  { key: 'dashboard', ref: '/player' },
  { key: 'matches', ref: '/player/matches' },
  { key: 'notifications', ref: '/player/notifications' },
  { key: 'profile', ref: '/player/profile' },
];
