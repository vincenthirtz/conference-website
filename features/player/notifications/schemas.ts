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

import { z } from 'zod';

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
  total: number;
};

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
