// features/admin/diffusion/liveClient.ts — appels des cartes de diagnostic de
// « Twitch & interactions » (/admin/broadcast/live) : chaînes Twitch actives,
// santé du drop TCG. Sans temps réel ni sondage, elles lisent par le cache de
// requêtes.
//
// Le fichier portait aussi `liveUrls`, les URLs du pupitre de run (antenne,
// prochain match, fin de run/segment) : parties avec le run-of-show.
//
// Les chaînes sont reprises À L'IDENTIQUE (pas d'encodage ajouté).

import { adminRequest } from '@/utils/admin/adminHttp';

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
