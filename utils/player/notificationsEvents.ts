// utils/player/notificationsEvents.ts — « les notifications de la joueuse ont
// changé » (notifications d'équipe marquées lues…), dit à la fenêtre.
//
// La cloche de la barre du haut (components/Navbar/PlayerTopBarBell.tsx) relit
// alors son compteur sans attendre son cycle de 90 s. Fichier neutre, sans
// dépendance : la cloche est atteinte par le bundle public et ne doit tirer
// ni TanStack ni features/player.

export const PLAYER_NOTIFICATIONS_CHANGED = 'owwc:player-notifications-changed';

export function announcePlayerNotificationsChanged(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(PLAYER_NOTIFICATIONS_CHANGED));
}
