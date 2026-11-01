// features/admin/caster/client.ts — cockpit caster (/admin/caster) : chat et
// modération Twitch, scrutin MVP du public (L10).
//
// MÉCANIQUE INCHANGÉE. Le chat Twitch (EventSub, envois, modération) et le
// scrutin MVP sont du temps réel : leurs écritures restent sur
// `useIdempotentMutation` (chemins ci-dessous) et leurs lectures sont des
// appels directs gardés en état local — rien ici ne passe par le cache de
// requêtes.

import { adminRequest } from '@/utils/admin/adminHttp';
import type { CasterScene, CasterSceneType } from '@/types/caster';
import type { CasterRecentMatch } from './model';

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

const SCENES = '/api/admin/caster/scenes';
const THEMES = '/api/admin/caster/themes';
const oneScene = (id: string) => `${SCENES}/${encodeURIComponent(id)}`;
const oneTheme = (id: string) => `${THEMES}/${encodeURIComponent(id)}`;

export type CasterSceneDraft = {
  name: string;
  type: CasterSceneType;
  overlay: string | null;
  data: Record<string, unknown>;
  sort_order: number;
};

export type CasterScenePatch = {
  name?: string;
  data?: Record<string, unknown>;
  sort_order?: number;
};

/**
 * Scènes et thèmes : la base ne reçoit plus le jeton de la personne (docs/AUTH-BETTER-AUTH.md).
 * Une saisie ou un ordre écrase la même valeur s'il est répété : seules les créations et
 * suppressions portent une clé d'idempotence.
 */
export const casterScenesClient = {
  list: () => adminRequest<{ scenes: CasterScene[] }>(SCENES),
  create: (scene: CasterSceneDraft) =>
    adminRequest<{ id: string }>(SCENES, {
      method: 'POST',
      json: scene,
      idempotent: true,
    }),
  update: (id: string, patch: CasterScenePatch) =>
    adminRequest<null>(oneScene(id), { method: 'PATCH', json: patch }),
  remove: (id: string) =>
    adminRequest<null>(oneScene(id), { method: 'DELETE', idempotent: true }),
};

export const casterThemesClient = {
  create: (theme: { name: string; data: Record<string, unknown> }) =>
    adminRequest<{ id: string }>(THEMES, {
      method: 'POST',
      json: theme,
      idempotent: true,
    }),
  update: (id: string, data: Record<string, unknown>) =>
    adminRequest<null>(oneTheme(id), { method: 'PATCH', json: { data } }),
  remove: (id: string) =>
    adminRequest<null>(oneTheme(id), { method: 'DELETE', idempotent: true }),
  activate: (id: string) =>
    adminRequest<null>(`${oneTheme(id)}/activate`, {
      method: 'POST',
      idempotent: true,
    }),
};
