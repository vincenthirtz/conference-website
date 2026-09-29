// features/admin/tenants/client.ts — espaces (fiche, staff, invitations,
// domaine, cycle de vie, Discord), onboarding (préparation, clés API,
// liens Discord en attente, demandes d'espace) — L10.
//
// SECRETS. Les réponses qui révèlent un secret UNE fois (rotation des clés
// bot, émission d'une clé API) ne passent JAMAIS par le cache de requêtes :
// les écrans appellent ces fonctions directement (ou par
// `useIdempotentMutation`) et ne gardent le clair qu'en état local, le temps
// de l'affichage.
//
// Les écritures déjà sur `useIdempotentMutation` (file hors ligne) le
// restent : ce module n'en expose que les chemins (`tenantsPaths`). Idem
// pour les listes lues par `useAdminResource`.

import type { DiscordConfig } from '@/utils/discord/discordConfigFields';
import { adminRequest } from '@/utils/admin/adminHttp';

const TENANTS = '/api/admin/tenants';
const PENDING = '/api/admin/pending-guild-links';
const REQUESTS = '/api/admin/tenant-requests';
const enc = encodeURIComponent;
const byId = (id: string) => `${TENANTS}/${enc(id)}`;

export const tenantsPaths = {
  list: TENANTS,
  byId,
  staff: (id: string) => `${byId(id)}/staff`,
  staffMember: (id: string, staffId: string) =>
    `${byId(id)}/staff/${enc(staffId)}`,
  invitations: (id: string) => `${byId(id)}/invitations`,
  invitation: (id: string, invitationId: string) =>
    `${byId(id)}/invitations/${enc(invitationId)}`,
  rotateSecrets: (id: string) => `${byId(id)}/rotate-secrets`,
  domain: (id: string) => `${byId(id)}/domain`,
  lifecycle: (id: string) => `${byId(id)}/lifecycle`,
  planCheckout: (id: string) => `${byId(id)}/plan-checkout`,
  guilds: (id: string) => `${byId(id)}/guilds`,
  discordConfigGuild: (id: string, guildId: string) =>
    `${byId(id)}/discord-config/${enc(guildId)}`,
  pendingGuildLinks: PENDING,
  pendingGuildLink: (guildId: string) => `${PENDING}/${enc(guildId)}`,
  claimGuildLink: (guildId: string) => `${PENDING}/${enc(guildId)}/claim`,
  rejectRequest: (requestId: string) => `${REQUESTS}/${enc(requestId)}/reject`,
  expireRequest: (requestId: string) => `${REQUESTS}/${enc(requestId)}/expire`,
} as const;

// --- Types de réponse

export type TenantDetail = {
  tenant: {
    id: string;
    slug: string;
    name: string;
    is_active: boolean;
    default_locale: string | null;
    network_share_scrims?: boolean | null;
    network_share_recruitment?: boolean | null;
    logo_url: string | null;
    primary_color: string | null;
    accent_color: string | null;
    custom_domain: string | null;
    created_at: string;
    updated_at: string;
    lifecycle_state:
      | 'active'
      | 'suspended'
      | 'archived'
      | 'purge_scheduled'
      | 'purged'
      | null;
    lifecycle_reason: string | null;
    purge_after: string | null;
  };
  guilds: {
    guild_id: string;
    guild_name: string | null;
    joined_at: string | null;
  }[];
  staff: {
    staff_id: string;
    display_name: string | null;
    email: string | null;
    role: string;
    added_at: string | null;
  }[];
};

export type TenantInvitation = {
  id: string;
  email: string;
  role: string;
  status: 'pending' | 'accepted' | 'revoked' | 'expired';
  expires_at: string;
  created_at: string;
};

export type TenantDomainState = {
  domain: string | null;
  state: 'pending' | 'verified' | 'failed' | null;
  checkedAt: string | null;
  error: string | null;
  records: { type: string; name: string; value: string; why: string }[];
};

export type ApiTokenRow = {
  id: string;
  name: string;
  token_prefix: string;
  scopes: string[];
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
  expires_at: string | null;
  comp: boolean;
  comp_note: string | null;
};

export type DiscordInventory = {
  guild: { id: string; name: string };
  channels: {
    id: string;
    name: string;
    type: number;
    parentId: string | null;
    position: number;
  }[];
  roles: {
    id: string;
    name: string;
    color: number;
    position: number;
    managed: boolean;
  }[];
};

export type PendingGuildLinksResponse<L = PendingGuildLink> = { links?: L[] };

export type PendingGuildLink = {
  guild_id: string;
  guild_name: string | null;
  requested_at: string | null;
};

export const tenantsClient = {
  detail: (id: string) => adminRequest<TenantDetail>(byId(id)),
  /** Vue d'ensemble — forme décrite par le panneau qui l'affiche. */
  overview: <T>(id: string) => adminRequest<T>(`${byId(id)}/overview`),
  invitations: (id: string) =>
    adminRequest<{ invitations?: TenantInvitation[] }>(
      tenantsPaths.invitations(id)
    ),
  /** Invitation directe (modale « Ouvrir l'accès ») — pas de secret. */
  invite: (id: string, body: { email: string; role: string }) =>
    adminRequest<{ emailSent?: boolean }>(tenantsPaths.invitations(id), {
      method: 'POST',
      json: body,
      idempotent: true,
    }),
  addStaff: (id: string, body: Record<string, unknown>) =>
    adminRequest(tenantsPaths.staff(id), {
      method: 'POST',
      json: body,
      idempotent: true,
    }),
  domain: (id: string) =>
    adminRequest<TenantDomainState>(tenantsPaths.domain(id)),
  /** Lien d'invitation du bot : state signé à courte durée, jamais en cache. */
  botInvite: (id: string) =>
    adminRequest<{ url: string | null; mode: 'direct' | 'manual' }>(
      `${byId(id)}/bot-invite`
    ),
  discordConfigs: (id: string) =>
    adminRequest<{ configs?: DiscordConfig[] }>(`${byId(id)}/discord-config`),
  discordInventory: (id: string, guildId: string) =>
    adminRequest<DiscordInventory>(
      `${tenantsPaths.discordConfigGuild(id, guildId)}/channels`
    ),

  /** Préparation des espaces — forme décrite par chaque écran lecteur. */
  readiness: <T>() => adminRequest<T>(`${TENANTS}/readiness`),
  usage: <T>() => adminRequest<T>(`${TENANTS}/usage`),

  apiTokens: (id: string) =>
    adminRequest<{ tokens?: ApiTokenRow[] }>(`${byId(id)}/api-tokens`),
  /** Émet une clé : le clair n'est renvoyé qu'ICI, une fois. Hors cache. */
  mintApiToken: (id: string, body: Record<string, unknown>) =>
    adminRequest<{ token: string }>(`${byId(id)}/api-tokens`, {
      method: 'POST',
      json: body,
      idempotent: true,
    }),
  revokeApiToken: (id: string, tokenId: string) =>
    adminRequest(`${byId(id)}/api-tokens?tokenId=${enc(tokenId)}`, {
      method: 'DELETE',
      idempotent: true,
    }),

  pendingGuildLinks: () => adminRequest<PendingGuildLinksResponse>(PENDING),
  tenantRequests: <T>(query: string) => adminRequest<T>(`${REQUESTS}?${query}`),
};
