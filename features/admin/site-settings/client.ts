// features/admin/site-settings/client.ts — appels typés des onglets de
// /admin/site-settings (L10). Les identifiants e-mail et HelloAsso ont leur
// route dans d'autres modules (communications, tenants) mais ne sont lus que
// par ces onglets : leur client vit ici.

import { adminRequest } from '@/utils/admin/adminHttp';
import type { DiscordChannelType } from '@/utils/discord/channels';
import type { SeasonalLogo } from '@/utils/seasonalLogo';
import type { TeamRole } from '@/utils/teamRoles';

const BASE = '/api/admin/site-settings';

export type SiteSetting = {
  key: string;
  value: string;
  description: string | null;
  updated_at: string;
};

export type SeasonalLogosPayload = {
  logos: SeasonalLogo[];
  activeId: string | null;
  today: string;
};

export type GlobalWebhookRow = {
  id: string;
  tournament_id: string | null;
  channel_type: DiscordChannelType;
  webhook_url: string;
  role_mention: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
};

export type GlobalWebhooksResponse = {
  channelTypes: readonly DiscordChannelType[];
  globals: GlobalWebhookRow[];
};

export type EmailSenderState = {
  usesPlatformAccount: boolean;
  configured: boolean;
  fromEmail: string | null;
  fromName: string | null;
  encryptionReady: boolean;
};

export type HelloAssoAccountState = {
  usesPlatformAccount: boolean;
  connected: boolean;
  organizationSlug: string | null;
  notificationUrl: string | null;
  encryptionReady: boolean;
};

export const siteSettingsClient = {
  list: () => adminRequest<{ items?: SiteSetting[] }>(BASE),
  upsert: (body: { key: string; value: string; description: string | null }) =>
    adminRequest(BASE, { method: 'POST', json: body, idempotent: true }),

  seasonalLogos: () =>
    adminRequest<SeasonalLogosPayload>(`${BASE}/seasonal-logos`),
  saveSeasonalLogos: (logos: SeasonalLogo[]) =>
    adminRequest<SeasonalLogosPayload>(`${BASE}/seasonal-logos`, {
      method: 'PUT',
      json: { logos },
      idempotent: true,
    }),

  teamRoles: () => adminRequest<{ roles: TeamRole[] }>(`${BASE}/team-roles`),
  saveTeamRoles: (roles: TeamRole[]) =>
    adminRequest<{ roles?: TeamRole[] }>(`${BASE}/team-roles`, {
      method: 'PUT',
      json: { roles },
      idempotent: true,
    }),

  discordWebhooks: () =>
    adminRequest<GlobalWebhooksResponse>(`${BASE}/discord-webhooks`),
  saveDiscordWebhook: (body: {
    channelType: DiscordChannelType;
    webhookUrl: string;
    roleMention: string | null;
    isActive: boolean;
  }) =>
    adminRequest(`${BASE}/discord-webhooks`, {
      method: 'PUT',
      json: body,
      idempotent: true,
    }),
  deleteDiscordWebhook: (channelType: DiscordChannelType) =>
    adminRequest(
      `${BASE}/discord-webhooks?channelType=${encodeURIComponent(channelType)}`,
      { method: 'DELETE', idempotent: true }
    ),
  testDiscordWebhook: (channelType: DiscordChannelType) =>
    adminRequest(`${BASE}/discord-test`, {
      method: 'POST',
      json: { channelType },
      idempotent: true,
    }),

  emailSender: () =>
    adminRequest<EmailSenderState>('/api/admin/email/credentials'),
  saveEmailSender: (body: {
    apiKey: string;
    fromEmail: string;
    fromName: string;
  }) =>
    adminRequest('/api/admin/email/credentials', {
      method: 'PUT',
      json: body,
      idempotent: true,
    }),
  clearEmailSender: () =>
    adminRequest('/api/admin/email/credentials', {
      method: 'DELETE',
      idempotent: true,
    }),

  helloAsso: () =>
    adminRequest<HelloAssoAccountState>('/api/admin/helloasso/credentials'),
  saveHelloAsso: (body: {
    clientId: string;
    clientSecret: string;
    organizationSlug: string;
  }) =>
    adminRequest('/api/admin/helloasso/credentials', {
      method: 'PUT',
      json: body,
      idempotent: true,
    }),
  clearHelloAsso: () =>
    adminRequest('/api/admin/helloasso/credentials', {
      method: 'DELETE',
      idempotent: true,
    }),
};
