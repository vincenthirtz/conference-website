// features/admin/communications/client.ts — appels typés du hub
// /admin/communications (campagnes e-mail, messages aux équipes, réseaux,
// notifications push, actualités). Plus aucune URL `/api/admin/…` dans les
// onglets : elles vivent ici.
//
// DEUX FORMES D'APPEL, ET POURQUOI.
// - Lectures et écritures simples : fonctions sur `adminRequest` (Bearer,
//   401 → connexion, `AdminHttpError`).
// - Écritures qui passaient par `useIdempotentMutation` : on NE les bascule
//   PAS sur `adminRequest`. Ce hook garde la même `Idempotency-Key` d'un essai
//   raté à l'autre (un double clic ou un nouvel essai après une coupure ne
//   renvoie pas une campagne deux fois) et met la requête en file de
//   synchronisation différée hors ligne. `adminRequest` tire une clé neuve à
//   chaque appel et n'a pas de file. Ces écritures sont donc décrites ici
//   comme des `AdminCall<T>` (URL + init + type de retour) et exécutées par
//   `useIdempotentCall` (hooks/useCommunications.ts), qui les confie au hook.

import type { AdminFetchOptions } from '@/hooks/useAdminFetch';
import { adminRequest, AdminHttpError } from '@/utils/admin/adminHttp';
import type {
  CampaignSummary,
  DryRunResult,
  SendResult,
} from '@/components/admin/communications/campaignShared';
import type { SetupState } from '@/components/admin/communications/PlatformConnectionStatus';
import type {
  NotificationPrefRow,
  NotificationPrefsResponse,
  NotificationTestResponse,
  SocialPostResponse,
  SocialPostsState,
  SubscriptionsSummary,
  TeamMessagesPostResponse,
  TeamMessagesState,
  TiktokCredentialsState,
} from './clientTypes';

/** Écriture décrite, exécutée par `useIdempotentCall`. */
export type AdminCall<T> = {
  url: string;
  init: AdminFetchOptions;
  /** Porte le type de la réponse ; jamais lu. */
  readonly __result?: T;
};

function call<T>(url: string, init: AdminFetchOptions): AdminCall<T> {
  return { url, init };
}

const BROADCAST = '/api/admin/broadcast';
const campaign = (id: string) => `${BROADCAST}/${encodeURIComponent(id)}`;

type SendReply = SendResult & { errors?: string[] };

/** Réponse d'un dry-run : compteurs de fenêtre + diff (nouveaux, non envoyés). */
export type CampaignDryRunReply = DryRunResult & {
  newCount?: number;
  unsentCount?: number;
  untracedPreviousSend?: boolean;
  alreadySent?: number;
  audienceTotal?: number;
};

export const campaignsClient = {
  list: (p: { limit: number; offset: number }) =>
    adminRequest<{ campaigns?: CampaignSummary[]; total?: number }>(
      `${BROADCAST}?limit=${p.limit}&offset=${p.offset}`
    ),
  subscriptions: () =>
    adminRequest<SubscriptionsSummary>(`${BROADCAST}/subscriptions`),
  /** Rendu HTML de la campagne, pour l'`<iframe>` du tiroir. */
  previewUrl: (id: string, label: string) =>
    `${campaign(id)}/preview${
      label.trim() ? `?label=${encodeURIComponent(label.trim())}` : ''
    }`,
  /** Dry-run : lecture pure côté serveur, sans clé d'idempotence (inchangé). */
  dryRun: (id: string, body: Record<string, unknown>) =>
    adminRequest<CampaignDryRunReply>(campaign(id), {
      method: 'POST',
      json: { ...body, dryRun: true },
    }),

  create: (payload: Record<string, unknown>) =>
    call<unknown>(BROADCAST, {
      method: 'POST',
      body: JSON.stringify(payload),
    }),
  update: (id: string, payload: Record<string, unknown>) =>
    call<unknown>(campaign(id), {
      method: 'PATCH',
      body: JSON.stringify(payload),
    }),
  remove: (id: string) => call<unknown>(campaign(id), { method: 'DELETE' }),
  duplicate: (id: string) =>
    call<unknown>(`${campaign(id)}/duplicate`, { method: 'POST' }),
  sendTest: (id: string, to: string) =>
    call<{ success?: boolean; error?: string }>(campaign(id), {
      method: 'POST',
      body: JSON.stringify({ testTo: to }),
    }),
  /** Envoi réel (en masse). Le corps porte la fenêtre et les filtres. */
  send: (id: string, body: Record<string, unknown>) =>
    call<SendReply>(campaign(id), {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  schedule: (id: string, waveSize: number) =>
    call<{ totalRecipients: number }>(`${campaign(id)}/schedule`, {
      method: 'POST',
      body: JSON.stringify({ waveSize }),
    }),
  cancelSchedule: (id: string) =>
    call<unknown>(`${campaign(id)}/schedule`, { method: 'DELETE' }),
  waveNow: (id: string) =>
    call<{ sent: number; failed: number; remainingPending: number }>(
      `${campaign(id)}/wave`,
      { method: 'POST' }
    ),
};

const TEAM_MESSAGES = '/api/admin/team-messages';

export const teamMessagesClient = {
  state: () => adminRequest<TeamMessagesState>(TEAM_MESSAGES),
  /** Aperçu (dry-run) : pas de clé d'idempotence, comme avant. */
  preview: (body: Record<string, unknown>) =>
    adminRequest<TeamMessagesPostResponse>(TEAM_MESSAGES, {
      method: 'POST',
      json: { ...body, dryRun: true },
    }),
  send: (body: Record<string, unknown>) =>
    call<TeamMessagesPostResponse>(TEAM_MESSAGES, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, dryRun: false }),
    }),
};

const SOCIAL_POSTS = '/api/admin/social-posts';
const INSTAGRAM_SECRET = '/api/admin/instagram/secret';
const TIKTOK_CREDENTIALS = '/api/admin/tiktok/credentials';

export const socialClient = {
  state: () => adminRequest<SocialPostsState>(SOCIAL_POSTS),
  instagramSetup: () => adminRequest<SetupState>(INSTAGRAM_SECRET),
  preview: (body: Record<string, unknown>) =>
    adminRequest<SocialPostResponse>(SOCIAL_POSTS, {
      method: 'POST',
      json: { ...body, dryRun: true },
    }),
  publish: (body: Record<string, unknown>) =>
    call<SocialPostResponse>(SOCIAL_POSTS, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, dryRun: false }),
    }),
  saveInstagramSecret: (appSecret: string) =>
    adminRequest<unknown>(INSTAGRAM_SECRET, {
      method: 'PUT',
      json: { appSecret },
    }),
  saveBluesky: (handle: string, appPassword: string) =>
    adminRequest<unknown>('/api/admin/bluesky/credentials', {
      method: 'PUT',
      json: { handle, appPassword },
    }),
  tiktokCredentials: () =>
    adminRequest<TiktokCredentialsState>(TIKTOK_CREDENTIALS),
  saveTiktokCredentials: (clientKey: string, clientSecret: string) =>
    adminRequest<unknown>(TIKTOK_CREDENTIALS, {
      method: 'PUT',
      json: { clientKey, clientSecret },
    }),
  /**
   * Navigations de document volontaires (pas de `<Link>`) : ces routes
   * répondent par une 302 vers l'écran de consentement de la plateforme.
   */
  instagramAuthorizeUrl: '/api/admin/instagram/authorize',
  tiktokAuthorizeUrl: '/api/admin/tiktok/authorize',
};

const NOTIFS = '/api/admin/notifications';

export const staffNotificationsClient = {
  ackAll: () => adminRequest<unknown>(`${NOTIFS}/ack-all`, { method: 'POST' }),
  prefs: () => adminRequest<NotificationPrefsResponse>(`${NOTIFS}/prefs`),
  savePrefs: (prefs: NotificationPrefRow[]) =>
    adminRequest<NotificationPrefsResponse>(`${NOTIFS}/prefs`, {
      method: 'PUT',
      json: { prefs },
    }),
  subscribe: (subscription: PushSubscriptionJSON, userAgent: string) =>
    adminRequest<unknown>(`${NOTIFS}/subscribe`, {
      method: 'POST',
      json: { subscription, user_agent: userAgent },
    }),
  unsubscribe: (endpoint: string) =>
    adminRequest<unknown>(`${NOTIFS}/unsubscribe`, {
      method: 'DELETE',
      json: { endpoint },
    }),
  sendTest: () =>
    adminRequest<NotificationTestResponse>(`${NOTIFS}/test`, {
      method: 'POST',
    }),
};

export const newsListClient = {
  remove: (id: string) =>
    adminRequest<unknown>(`/api/admin/news/${id}`, { method: 'DELETE' }),
};

/**
 * Message d'erreur d'une lecture/aperçu, à l'identique de l'ancien
 * `adminFetch` + `res.json()` : le champ `error` du corps s'il existe, sinon
 * le libellé de repli de l'écran ; une panne réseau garde son propre message.
 */
export function bodyErrorOr(err: unknown, fallback: string): string {
  if (err instanceof AdminHttpError) {
    const p = err.payload as { error?: unknown } | null;
    return p && typeof p === 'object' && p.error ? String(p.error) : fallback;
  }
  return (err as Error)?.message || fallback;
}
