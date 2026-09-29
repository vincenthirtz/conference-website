// features/admin/diffusion/liveClient.ts — appels de la régie en direct
// (console live /admin/broadcast/live, régie /admin/regie) et de ses cartes
// de diagnostic.
//
// DEUX NIVEAUX, À DESSEIN (lot L10, règles « régie en direct »).
// - `liveUrls` : les URLs SEULES. Les écrans de pilotage (antenne, prochain
//   match, fin de run/segment) continuent d'appeler `adminFetchJson` /
//   `mutateJson` (useIdempotentMutation : clé conservée d'un essai raté à
//   l'autre, file hors ligne) avec le MÊME init, dans le même ordre ; seules
//   les chaînes ont déménagé ici. Leur état reste en `useState`, fusionné par
//   le temps réel et le sondage de secours — rien de tout ça ne passe par le
//   cache de requêtes.
// - `broadcastCardsClient` : cartes sans temps réel ni sondage (chaînes
//   Twitch actives, santé du drop TCG), passées sur le cache de requêtes.
//
// Les chaînes sont reprises À L'IDENTIQUE (pas d'encodage ajouté).

import { adminRequest } from '@/utils/admin/adminHttp';

export const liveUrls = {
  broadcastState: '/api/admin/broadcast/state',
  nextMatch: '/api/admin/broadcast/next-match',
  eventRun: (runId: string) => `/api/admin/events/${runId}`,
  endRun: (runId: string) => `/api/admin/events/${runId}/end`,
  endSegment: (runId: string, segmentId: string) =>
    `/api/admin/events/${runId}/segments/${segmentId}/end`,
  startSegment: (runId: string, segmentId: string) =>
    `/api/admin/events/${runId}/segments/${segmentId}/start`,
};

export type TwitchChannelRow = { channel: string; label: string | null };

type TcgDropSubscription = {
  id: string | null;
  status: string | null;
  rewardId: string | null;
};

export type TcgDropEventSubState = {
  rewardId: string | null;
  /** Optionnels : une API plus ancienne (déploiement en cours) ne les rend pas. */
  featuredRewardId?: string | null;
  featuredFanartId?: string | null;
  featuredCandidates?: Array<{ id: string; title: string }>;
  callbackUrl: string;
  secretConfigured: boolean;
  hasScope: boolean;
  subscriptions: TcgDropSubscription[] | null;
};

const TCG_EVENTSUB = '/api/admin/twitch/eventsub/tcg-drop';
const TCG_SETUP = '/api/admin/twitch/tcg-drop/setup';

export const broadcastCardsClient = {
  /** Lecture seule, ouverte au rôle caster ; pas de redirection sur 401. */
  activeTwitchChannels: () =>
    adminRequest<{ items: TwitchChannelRow[] }>(
      '/api/admin/diffusion/twitch-channels',
      { skipAuthRedirect: true }
    ),
  tcgDropState: () => adminRequest<TcgDropEventSubState>(TCG_EVENTSUB),
  /** Récompense de drop (reprise si elle existe déjà). */
  tcgDropSetupReward: (
    body: { cost?: number; featuredFanartId?: string } = {}
  ) =>
    adminRequest<{ rewardId: string }>(TCG_SETUP, {
      method: 'POST',
      json: body,
    }),
  /** Abonnement EventSub (vérifie l'existence avant de créer). */
  tcgDropSubscribe: (body: { rewardId: string; featuredFanartId?: string }) =>
    adminRequest<unknown>(TCG_EVENTSUB, { method: 'POST', json: body }),
};
