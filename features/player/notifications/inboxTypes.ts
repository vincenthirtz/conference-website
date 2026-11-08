// features/player/notifications/inboxTypes.ts — types de la BOÎTE de
// notifications durable de la joueuse (lot 4, docs/PLAN-interactions-joueuses.md).
//
// FICHIER DU SITE, PAS UNE COPIE. `schemas.ts` (à côté) est livré par la
// synchronisation inverse depuis conference-api (.api-sync-manifest.json) et
// ne se modifie pas ici. Tant que l'API ne publie pas ses propres types de la
// boîte, le site décrit le contrat ici. Quand ils arriveront dans
// `schemas.ts`, ce fichier pourra n'en garder que des alias.
//
// Importé en TYPE seulement par les cloches de la barre (bundle public) :
// aucune dépendance à l'exécution hors fonctions pures.

import type { PlayerNotificationsPayload, TeamNotification } from './schemas';

/** Une entrée de GET /api/player/inbox, plus récentes d'abord. */
export type InboxItem = {
  id: string;
  /** `personal` : adressée à la joueuse ; `team` : à son équipe. */
  source: 'personal' | 'team';
  /**
   * Personnelles : nom de l'événement de l'outbox (`match.scheduled`,
   * `team.join.decided`, `scrim.*`…). Équipe : les types des notifications
   * d'équipe (`scrim_accepted`, `rules_reminder`…).
   */
  kind: string;
  /** Texte rangé à l'écriture, en français. */
  title: string;
  body: string;
  /** Chemin relatif côté joueuse, ou `null`. */
  url: string | null;
  teamId: string | null;
  createdAt: string;
  /** `null` = non lue. */
  readAt: string | null;
  /** Notification d'équipe : l'objet de /api/player/notifications/team. */
  team?: TeamNotification | null;
};

/** GET /api/player/inbox?limit=&before= */
export type InboxPayload = {
  items: InboxItem[];
  /** Curseur de la page suivante (`before=`), `null` = fin. */
  nextBefore: string | null;
  unreadCount: number;
};

/** Corps de POST /api/player/inbox/read. */
export type InboxReadInput = { ids: string[] } | { all: true };

/** Réponse de POST /api/player/inbox/read. */
export type InboxReadResult = { ok: true; unreadCount: number };

/** GET /api/player/notifications, avec le compteur de la boîte (lot 4). */
export type PlayerNotificationsWithInbox = PlayerNotificationsPayload & {
  /** Absent tant que l'API d'avant le lot 4 répond. */
  inboxUnread?: number;
};

/** Plafond de `ids` d'un POST /api/player/inbox/read. */
export const INBOX_READ_MAX_IDS = 100;

/** Taille d'une page de la liste. */
export const INBOX_PAGE_SIZE = 20;

/**
 * Vrai si la réponse a la forme du contrat. Une route absente (API d'avant le
 * lot 4) ou une réponse inattendue rendent faux : l'écran garde alors la
 * liste des notifications d'équipe d'avant.
 */
export function isInboxPayload(value: unknown): value is InboxPayload {
  if (!value || typeof value !== 'object') return false;
  const v = value as Partial<InboxPayload>;
  return (
    Array.isArray(v.items) &&
    typeof v.unreadCount === 'number' &&
    (v.nextBefore == null || typeof v.nextBefore === 'string')
  );
}
