// features/admin/caster/client.ts — cockpit caster (/admin/caster) : chat et
// modération Twitch, scrutin MVP du public (L10).
//
// MÉCANIQUE INCHANGÉE. Le chat Twitch (EventSub, envois, modération) et le
// scrutin MVP sont du temps réel : leurs écritures restent sur
// `useIdempotentMutation` (chemins ci-dessous) et leurs lectures sont des
// appels directs gardés en état local — rien ici ne passe par le cache de
// requêtes.

import { adminRequest } from '@/utils/admin/adminHttp';
import type { CasterRecentMatch } from './service';

const TWITCH = '/api/admin/twitch';

export const casterPaths = {
  eventSubSubscribe: `${TWITCH}/eventsub/subscribe`,
  chat: `${TWITCH}/chat`,
  ban: `${TWITCH}/moderation/ban`,
  clearChat: `${TWITCH}/moderation/clear`,
} as const;

export type MvpPublicCandidates = {
  candidates?: { label: string; memberId: string }[];
  team1Name?: string | null;
  team2Name?: string | null;
};

export const casterClient = {
  /** Statut de la connexion broadcaster — forme décrite par le hook lecteur. */
  twitchConnection: <T>() => adminRequest<T>(`${TWITCH}/connection`),
  recentMatches: () =>
    adminRequest<{ matches?: CasterRecentMatch[] }>(
      '/api/admin/caster/recent-matches'
    ),
  mvpPublic: (matchId: string) =>
    adminRequest<MvpPublicCandidates>(
      `/api/admin/matches/${encodeURIComponent(matchId)}/mvp-public`
    ),
};
