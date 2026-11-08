// features/player/notifications/client.ts — appels typés des notifications
// de la joueuse (lot P15).
//
// Les COMPTEURS et la LISTE des notifications d'équipe suivent la portée
// (`?as=`, `?teamId=`) : `subject: 'follow'`. Les PRÉFÉRENCES ne la suivent
// jamais : `subject: 'self'`, rien n'est suffixé (l'écran les masque en
// inspection). Marquer « lu » est `self` aussi : seule l'équipe active part.
//
// La cloche de la barre du haut N'UTILISE PAS ce client : montée par `_app`,
// elle ne doit tirer ni TanStack ni features/player dans le bundle public ;
// elle garde son propre relevé (components/Navbar/PlayerTopBarBell.tsx).

import { playerRequest, type PlayerScope } from '@/utils/player/playerHttp';
import type {
  NotificationPrefPutInput,
  NotificationPrefs,
  PlayerNotificationsPayload,
  TeamNotificationsPayload,
  TeamNotificationsReadResult,
} from './schemas';
import type { InboxReadInput, InboxReadResult } from './inboxTypes';

export const notificationsUrls = {
  counters: '/api/player/notifications',
  team: '/api/player/notifications/team',
  prefs: '/api/player/push/prefs',
  inbox: '/api/player/inbox',
  inboxRead: '/api/player/inbox/read',
};

/** `?limit=` puis `?before=` (curseur) de la liste de la boîte. */
export function inboxUrl(limit: number, before: string | null): string {
  const params = new URLSearchParams({ limit: String(limit) });
  if (before) params.set('before', before);
  return `${notificationsUrls.inbox}?${params.toString()}`;
}

export const notificationsClient = {
  /**
   * La boîte (lot 4) : TOUTES les équipes de la joueuse, donc jamais
   * `?teamId=` ; le sujet inspecté, lui, suit (`?as=`). La réponse n'est pas
   * typée ici : l'écran vérifie sa forme (API d'avant le lot 4 → 404 ou autre
   * chose), cf. `isInboxPayload`.
   */
  inbox: (scope: PlayerScope, limit: number, before: string | null) =>
    playerRequest<unknown>(inboxUrl(limit, before), {
      scope: { ...scope, teamId: null },
      skipAuthRedirect: true,
    }),
  /** Marquer lu : la joueuse elle-même, jamais en inspection. */
  markInboxRead: (body: InboxReadInput) =>
    playerRequest<InboxReadResult>(notificationsUrls.inboxRead, {
      method: 'POST',
      json: body,
      skipAuthRedirect: true,
    }),
  counters: (scope: PlayerScope) =>
    playerRequest<PlayerNotificationsPayload>(notificationsUrls.counters, {
      scope,
      skipAuthRedirect: true,
    }),
  team: (scope: PlayerScope) =>
    playerRequest<TeamNotificationsPayload>(notificationsUrls.team, {
      scope,
      skipAuthRedirect: true,
    }),
  markTeamRead: (scope: PlayerScope) =>
    playerRequest<TeamNotificationsReadResult>(notificationsUrls.team, {
      method: 'POST',
      scope: { subjectId: null, actAs: false, teamId: scope.teamId },
      skipAuthRedirect: true,
    }),
  prefs: () =>
    playerRequest<NotificationPrefs>(notificationsUrls.prefs, {
      skipAuthRedirect: true,
    }),
  setPref: (body: NotificationPrefPutInput) =>
    playerRequest<NotificationPrefs>(notificationsUrls.prefs, {
      method: 'PUT',
      json: body,
      idempotent: true,
    }),
};
