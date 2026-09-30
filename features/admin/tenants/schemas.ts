// features/admin/tenants/schemas.ts — espaces (tenants), demandes
// d'onboarding, clés d'API, webhooks sortants, espace actif.
//
// Schémas DÉCLARÉS par les routes (spec OpenAPI : `x-zod-query`, `x-zod`).
// Ils NOMMENT les paramètres et champs sans jamais refuser une requête : la
// validation reste dans le service, dans l'ordre et avec les messages / codes
// historiques (`INVALID_TENANT_ID`, `INVALID_BODY`…) que les écrans lisent.
//
// Zod seul, imports RELATIFS : lu par l'assemblage OpenAPI (Node sans `@/`).

import * as z from 'zod';
import { looseBody, looseQuery } from '../../../utils/admin/pathParams';

/** Même motif que `isValidUUID` (utils/apiHelpers). */
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * UUID documenté (motif dans la spec) mais jamais refusé ici : invalide →
 * `undefined`, et le service répond le 400 historique de la route.
 */
const uuidParam = () => z.string().regex(UUID_RE).optional().catch(undefined);
/** Chaîne documentée, lue et normalisée par le service. */
const stringParam = () => z.string().optional().catch(undefined);

/* ----------------------------- Query ---------------------------------- */

/** `/tenants/[id]/*`, `/tenant-requests/[id]/*`, `/api-tokens/[id]`, `/webhooks/[id]/*`. */
export const IdQuery = z.looseObject({ id: uuidParam() });

/** `/tenants/[id]/discord-config/[guildId]` (+ `/channels`). */
export const TenantGuildQuery = z.looseObject({
  id: uuidParam(),
  guildId: stringParam(),
});

/** `/tenants/[id]/bot-invite?guildId=` — serveur pré-sélectionné (facultatif). */
export const BotInviteQuery = TenantGuildQuery;

/** `/tenants/[id]/api-tokens` — `?tokenId=` pour la révocation (DELETE). */
export const TenantApiTokensQuery = z.looseObject({
  id: uuidParam(),
  tokenId: stringParam(),
});

/** `/tenants/[id]/staff/[staffId]`. */
export const TenantStaffIdQuery = z.looseObject({
  id: uuidParam(),
  staffId: uuidParam(),
});

/** `/tenants/[id]/invitations/[invitationId]`. */
export const TenantInvitationIdQuery = z.looseObject({
  id: uuidParam(),
  invitationId: uuidParam(),
});

/** `/tenants/usage?window=month`. */
export const TenantUsageQuery = z.looseObject({ window: stringParam() });

/** `/tenant-requests?status=&limit=&offset=`. */
export const TenantRequestListQuery = z.looseObject({
  status: stringParam(),
  limit: stringParam(),
  offset: stringParam(),
});

/* ------------------------------ Corps --------------------------------- */

export const ActiveTenantDoc = looseBody(['tenant_id']);
export const TenantCreateDoc = looseBody(['slug', 'name', 'default_locale']);
export const TenantPatchDoc = looseBody([
  'name',
  'default_locale',
  'is_active',
  'network_share_scrims',
  'network_share_recruitment',
  'logo_url',
  'primary_color',
  'accent_color',
  'custom_domain',
  'slug',
]);
export const LifecycleDoc = looseBody(['state', 'reason', 'purgeAfterDays']);
export const RotateSecretsDoc = looseBody(['reason']);
export const AttachGuildDoc = looseBody(['guild_id']);
export const PlanCheckoutDoc = looseBody([
  'plan',
  'term',
  'cgvVersion',
  'cgvAccepted',
  'immediateExecutionWaiver',
]);
export const NonprofitRnaDoc = looseBody(['rna']);
export const TenantStaffAddDoc = looseBody(['staff_id', 'email', 'role']);
export const InvitationCreateDoc = looseBody(['email', 'role']);
export const DiscordConfigDoc = looseBody([
  'staff_log_channel_id',
  'matches_live_channel_id',
  'disputes_forum_channel_id',
  'news_ingest_channel_id',
  'scrims_announce_channel_id',
  'free_players_channel_id',
  'team_openings_channel_id',
  'mvp_results_channel_id',
  'captain_role_id',
  'substitute_role_id',
  'staff_role_owner_id',
  'staff_role_admin_id',
  'staff_role_caster_id',
  'teams_voice_category_id',
  'disputes_forum_tag_open_id',
  'disputes_forum_tag_pending_id',
  'disputes_forum_tag_resolved_id',
  'welcome_channel_id',
  'member_leave_channel_id',
  'placement_roles',
  'welcome_enabled',
  'welcome_message',
  'welcome_dm_message',
  'extras',
]);
export const TenantRequestRejectDoc = looseBody(['reason']);
export const ApiTokenPatchDoc = looseBody(['comp', 'comp_note']);
export const WebhookCreateDoc = looseBody([
  'url',
  'event_types',
  'description',
]);
export const WebhookPatchDoc = looseBody(['enabled']);

/* --------------------------- Colonnes --------------------------------- */

export const TENANT_ACTIVE_COLUMNS =
  'id, slug, name, is_active, default_locale' as const;

export const TENANT_LIST_COLUMNS =
  'id, slug, name, is_active, default_locale, created_at, plan, plan_status, plan_expires_at' as const;

export const TENANT_CREATED_COLUMNS =
  'id, slug, name, is_active, default_locale, created_at, plan, plan_status, plan_expires_at, plan_is_trial' as const;

/** Fiche d'un espace (marque blanche comprise). Jamais `custom_domain_token`. */
export const TENANT_DETAIL_COLUMNS =
  'id, slug, name, is_active, default_locale, logo_url, primary_color, accent_color, custom_domain, created_at, network_share_scrims, network_share_recruitment' as const;

/** Métadonnées d'une clé d'API : jamais `token_hash`. */
export const API_TOKEN_LIST_COLUMNS =
  'id, name, token_prefix, scopes, created_at, last_used_at, revoked_at, expires_at, created_by, comp, comp_note' as const;
export const TENANT_API_TOKEN_LIST_COLUMNS =
  'id, name, token_prefix, scopes, created_at, last_used_at, revoked_at, expires_at, comp, comp_note' as const;

/** Abonnement webhook : jamais `secret`. */
export const WEBHOOK_LIST_COLUMNS =
  'id, url, event_types, description, enabled, consecutive_failures, disabled_at, last_delivery_at, last_error, created_at' as const;
export const WEBHOOK_CREATED_COLUMNS =
  'id, url, event_types, description, enabled, created_at' as const;
export const WEBHOOK_DELIVERY_COLUMNS =
  'id, event_name, status, attempts, response_status, last_error, delivered_at, created_at' as const;

/** File d'onboarding : ni jeton de vérification, ni jeton de révélation. */
export const TENANT_REQUEST_COLUMNS =
  'id, status, requested_slug, requested_name, requester_email, requester_discord_user_id, requester_discord_display_name, created_at, created_tenant_id, created_guild_id, rejection_reason' as const;

/** Toutes les colonnes de `tenant_discord_config` (ce que rendait le `select('*')`). */
export const DISCORD_CONFIG_COLUMNS =
  'guild_id, staff_log_channel_id, matches_live_channel_id, disputes_forum_channel_id, news_ingest_channel_id, scrims_announce_channel_id, free_players_channel_id, team_openings_channel_id, mvp_results_channel_id, captain_role_id, substitute_role_id, staff_role_owner_id, staff_role_admin_id, staff_role_caster_id, teams_voice_category_id, disputes_forum_tag_open_id, disputes_forum_tag_pending_id, disputes_forum_tag_resolved_id, welcome_enabled, welcome_channel_id, welcome_message, welcome_dm_message, member_leave_channel_id, placement_roles, extras, created_at, updated_at' as const;

/* ------------- File d'onboarding Discord : rejet / rattachement ------------- */

/** `/pending-guild-links/[guildId]/*` — snowflake vérifié par le service (`INVALID_GUILD_ID`). */
export const PendingGuildIdQuery = z.looseObject({ guildId: stringParam() });

/** POST `…/claim` : espace existant (`tenant_id`) OU à créer (`new_tenant`). */
export const GuildClaimDoc = looseBody(['tenant_id', 'new_tenant']);

/** `/staff/[staffId]/pole-admin` — UUID vérifié par le service (`INVALID_STAFF_ID`). */
export const StaffIdQuery = z.looseObject({ staffId: uuidParam() });

/** PUT `/helloasso/credentials` : identifiants API de l'association. */
export const HelloAssoCredentialsDoc = looseBody([
  'clientId',
  'clientSecret',
  'organizationSlug',
]);

/**
 * POST /api/admin/discord/team-channels — UNE action nommée (`refresh`,
 * `provision`, `repair`, `delete-channel`, `delete-role`, `grant-access`,
 * `revoke-access`, `grant-role`, `revoke-role`), validée par le service
 * (400 `INVALID_BODY`).
 */
export const TeamChannelActionDoc = looseBody([
  'action',
  'teamId',
  'channel',
  'discordUserId',
]);

/** GET /api/admin/docs/openapi?format=json|yaml (défaut YAML). */
export const OpenApiSpecQuery = looseQuery(['format']);
