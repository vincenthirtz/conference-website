// components/Navbar/playerBellCounts.ts — ce que comptent les cloches de la
// joueuse (barre du haut, barre publique), depuis GET /api/player/notifications.
//
// Lot 4 (boîte durable) : la pastille = actions en attente + notifications
// non lues de la boîte (`inboxUnread`). Les notifications d'ÉQUIPE non lues
// sont DANS la boîte : elles sortent alors des actions en attente
// (`total - teamNotifications`), sinon elles compteraient deux fois.
//
// API d'avant le lot 4 (pas d'`inboxUnread`) : la pastille reste `total`,
// comme avant.
//
// Fichier pur, sans dépendance : atteint par le bundle public.

export type BellCountsInput = {
  total: number;
  teamNotifications?: number;
  inboxUnread?: number;
};

export type BellCounts = {
  /** Actions en attente (messages, scrims, candidatures, check-in…). */
  pending: number;
  /** Notifications non lues de la boîte ; 0 sans boîte. */
  unread: number;
  /** Ce que montre la pastille. */
  total: number;
  /** L'API rend le compteur de la boîte. */
  hasInbox: boolean;
};

const count = (n: unknown): number =>
  typeof n === 'number' && Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;

export function playerBellCounts(json: BellCountsInput): BellCounts {
  const total = count(json.total);
  if (typeof json.inboxUnread !== 'number') {
    return { pending: total, unread: 0, total, hasInbox: false };
  }
  const pending = Math.max(0, total - count(json.teamNotifications));
  const unread = count(json.inboxUnread);
  return { pending, unread, total: pending + unread, hasInbox: true };
}
