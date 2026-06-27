export type PlayerLink = { title: string; ref: string };

export const PLAYER_LINKS: PlayerLink[] = [
  { title: 'Tableau de bord', ref: '/player' },
  { title: 'Mes matchs', ref: '/player/matches' },
  { title: 'Notifications', ref: '/player/notifications' },
  { title: 'Mon profil', ref: '/player/profile' },
];
