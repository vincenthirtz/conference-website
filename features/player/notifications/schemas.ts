// features/player/notifications/schemas.ts — notifications de la joueuse :
// compteurs « en attente » (cloche + écran), préférences par canal,
// abonnement Web Push de l'appareil (lot P15). Zod seul : importé par les
// services, le client, et — en TYPE seulement — par la cloche de la barre du
// haut (components/Navbar/PlayerTopBarBell.tsx), qui ne doit tirer ni
// TanStack ni le reste de features/player dans le bundle public.
//
// Système multi-canal : outbox + deux dispatchers — push OPT-OUT (absent =
// activé), e-mail digest OPT-IN (absent = désactivé). Le combo
// (`broadcast`, `email`) est à part : OPT-OUT (abonnée par défaut), posé par
// la désinscription RGPD.

import * as z from 'zod';

/** Compteurs agrégés de GET /api/player/notifications. */
export type PlayerNotificationsPayload = {
  hasTeam: boolean;
  /** Vrai pour la capitaine OU une manager de l'équipe. */
  isCaptain: boolean;
  isManager: boolean;
  /**
   * Équipe que l'appelante gère (capitaine ou manager) : les abonnements
   * temps réel du client filtrent dessus sans aller-retour de plus.
   */
  captainTeamId: string | null;
  /** Équipe d'appartenance (== captainTeamId pour une capitaine/manager). */
  memberTeamId: string | null;
  unreadMessages: number;
  pendingScrims: number;
  pendingJoinRequests: number;
  /** Invitations d'équipe en attente adressées à l'appelante. */
  pendingInvites: number;
  checkinPending: 0 | 1;
  /** Grilles de planning de scrim ouvertes qui attendent ses dispos. */
  pendingPlannings: number;
  /**
   * Notifications de son équipe (scrim accepté, scrim pris en compte) qu'ELLE
   * n'a pas encore lues, sur les 30 derniers jours.
   */
  teamNotifications: number;
  total: number;
  /**
   * Non lues de la BOÎTE de notifications (lot 4) : personnelles + d'équipe,
   * le même nombre que `unreadCount` de GET /api/player/inbox. Hors `total`
   * (qui compte ce qui est « en attente ») : ses notifications d'équipe y
   * sont déjà dans `teamNotifications`.
   */
  inboxUnread: number;
};

/**
 * Une notification adressée à l'équipe (GET /api/player/notifications/team).
 * `text` : le texte rangé avec la notification, en français — le REPLI de
 * l'écran, qui compose sinon sa phrase dans la langue de la joueuse depuis
 * `kind` et `opponentTeamName`.
 */
export type TeamNotification = {
  id: string;
  /**
   * `scrim_accepted` | `scrim_acknowledged` | `rules_validation_requested`
   * | `rules_reminder` (règlement d'un tournoi à valider : adressées aux seuls
   * membres qui doivent encore valider). D'autres pourront s'ajouter.
   */
  kind: string;
  text: string;
  createdAt: string;
  /** Lue par l'appelante (le « lu » est propre à chaque membre). */
  read: boolean;
  fromTeamName: string | null;
  targetTeamName: string | null;
  /** L'équipe en face de celle qui reçoit la notification ; `null` = inconnue. */
  opponentTeamName: string | null;
  /** Créneau du scrim porté par la notification (ISO), ou `null`. */
  scrimDate: string | null;
  /**
   * Tournoi porté par la notification (règlement à valider : lien vers la
   * liseuse, nom dans la phrase), ou `null`.
   */
  tournamentId: string | null;
  tournamentName: string | null;
};

/** GET /api/player/notifications/team — les notifications de l'équipe. */
export type TeamNotificationsPayload = {
  /** Équipe dont les notifications sont rendues ; `null` = aucune équipe. */
  teamId: string | null;
  notifications: TeamNotification[];
  unread: number;
};

/** POST /api/player/notifications/team — marque tout comme lu. */
export type TeamNotificationsReadResult = { marked: number };

export type NotificationChannel = 'push' | 'email';

/**
 * GET/PUT /api/player/push/prefs. `push` et `email` : event_type → activé,
 * exhaustifs sur le catalogue de chaque canal ; `broadcastEmail` : abonnement
 * aux annonces/campagnes (opt-OUT, défaut `true`).
 */
export type NotificationPrefs = {
  push: Record<string, boolean>;
  email: Record<string, boolean>;
  broadcastEmail: boolean;
};

/** Corps de PUT /api/player/push/prefs — un interrupteur à la fois. */
export const NotificationPrefPutBody = z.object({
  eventType: z.string().min(1),
  channel: z.enum(['push', 'email']),
  enabled: z.boolean(),
});
export type NotificationPrefPutInput = z.infer<typeof NotificationPrefPutBody>;

/** Corps de DELETE /api/player/push/unsubscribe. */
export const PushUnsubscribeBody = z.object({
  endpoint: z.string().trim().url('endpoint must be a valid URL').max(2048),
});

/* ------------------------------------------------------------------ *
 * Boîte de notifications (lot 4, docs/PLAN-interactions-joueuses.md)
 * ------------------------------------------------------------------ */

/** Taille d'une page de GET /api/player/inbox, par défaut et au plus. */
export const INBOX_PAGE_DEFAULT = 20;
export const INBOX_PAGE_MAX = 50;
/** Plafond de `ids` d'un POST /api/player/inbox/read. */
export const INBOX_READ_MAX_IDS = 100;

/** GET /api/player/inbox?limit=&before= */
export const PlayerInboxQuery = z.object({
  limit: z.coerce
    .number({ error: 'Nombre invalide.' })
    .int({ error: 'Nombre invalide.' })
    .min(1, { error: 'Nombre invalide.' })
    .max(INBOX_PAGE_MAX, { error: 'Nombre invalide.' })
    .optional()
    .meta({ description: 'Taille de la page (1 à 50, 20 par défaut).' }),
  before: z
    .string({ error: 'Date invalide.' })
    .datetime({ offset: true, error: 'Date invalide.' })
    .optional()
    .meta({
      description:
        'Curseur : les entrées STRICTEMENT plus anciennes (`nextBefore` ' +
        'de la page précédente).',
    }),
});
export type PlayerInboxQueryInput = z.infer<typeof PlayerInboxQuery>;

/**
 * Corps de POST /api/player/inbox/read : des `ids` (entrées de la liste,
 * personnelles ou d'équipe), ou `all: true` (tout ce qui est non lu).
 */
export const PlayerInboxReadBody = z.object({
  ids: z
    .array(z.string().min(1).max(64), { error: 'Liste invalide.' })
    .max(INBOX_READ_MAX_IDS, { error: 'Trop d’entrées.' })
    .optional(),
  all: z.literal(true).optional(),
});
export type PlayerInboxReadInput = z.infer<typeof PlayerInboxReadBody>;

/** Une entrée de GET /api/player/inbox, plus récentes d'abord. */
export type InboxItem = {
  /** Personnelle : `player_notifications.id` ; équipe : `demandes.id`. */
  id: string;
  /** `personal` : adressée à la joueuse ; `team` : à son équipe. */
  source: 'personal' | 'team';
  /**
   * Personnelle : l'événement de l'outbox (`match.rescheduled`…). Équipe : le
   * type de la notification (`scrim_accepted`, `rules_reminder`…).
   */
  kind: string;
  /** Texte rangé à l'écriture, en français. */
  title: string;
  body: string;
  /** Chemin relatif côté joueuse, ou `null`. */
  url: string | null;
  teamId: string | null;
  createdAt: string;
  /**
   * `null` = non lue. Équipe : l'instant de lecture n'est pas gardé, une
   * entrée lue rend sa date de création.
   */
  readAt: string | null;
  /** Équipe : l'objet de GET /api/player/notifications/team ; sinon `null`. */
  team: TeamNotification | null;
};

/** GET /api/player/inbox */
export type InboxPayload = {
  items: InboxItem[];
  /** Curseur de la page suivante (`before=`), `null` = fin. */
  nextBefore: string | null;
  /** Non lues : personnelles + d'équipe. */
  unreadCount: number;
};

/** POST /api/player/inbox/read */
export type InboxReadResult = { ok: true; unreadCount: number };
