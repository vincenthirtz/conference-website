// features/admin/tenants/hooks/useTenants.ts — lectures des espaces et de
// l'onboarding (L10). Aucune lecture ici ne porte de secret : la rotation des
// clés bot et l'émission de clés API restent hors cache (cf. client.ts).

import {
  keepPreviousData,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { useCallback } from 'react';
import { adminKey, EDITOR_QUERY_OPTIONS } from '../../_shared/query';
import type { DiscordConfig } from '@/utils/discord/discordConfigFields';
import { tenantsClient as client } from '../client';

export const tenantsKeys = {
  all: adminKey('tenants'),
  detail: (id: string) => adminKey('tenants', 'detail', id),
  overview: (id: string) => adminKey('tenants', 'overview', id),
  invitations: (id: string) => adminKey('tenants', 'invitations', id),
  domain: (id: string) => adminKey('tenants', 'domain', id),
  discordConfigs: (id: string) => adminKey('tenants', 'discord-config', id),
  discordInventory: (id: string, guildId: string) =>
    adminKey('tenants', 'discord-inventory', id, guildId),
  apiTokens: (id: string) => adminKey('tenants', 'api-tokens', id),
  readiness: adminKey('tenants', 'readiness'),
  usage: adminKey('tenants', 'usage'),
  pendingGuildLinks: adminKey('pending-guild-links'),
  tenantRequests: (query: string) => adminKey('tenant-requests', query),
  tenantRequestsAll: adminKey('tenant-requests'),
};

/**
 * Fiche d'un espace. Hydrate le formulaire « Général » : pas de relecture
 * automatique. Le panneau « Cycle de vie » lit la même clé — une requête.
 */
export function useTenantDetail(id: string) {
  return useQuery({
    queryKey: tenantsKeys.detail(id),
    queryFn: () => client.detail(id),
    enabled: !!id,
    ...EDITOR_QUERY_OPTIONS,
  });
}

/** Relit la fiche (staff, serveurs…) — le formulaire n'est pas réhydraté. */
export function useReloadTenant(id: string) {
  const qc = useQueryClient();
  return useCallback(
    () => qc.invalidateQueries({ queryKey: tenantsKeys.detail(id) }),
    [qc, id]
  );
}

export function useTenantOverview<T>(id: string) {
  return useQuery({
    queryKey: tenantsKeys.overview(id),
    queryFn: () => client.overview<T>(id),
    enabled: !!id,
    refetchOnWindowFocus: false,
  });
}

export function useTenantInvitations(id: string) {
  return useQuery({
    queryKey: tenantsKeys.invitations(id),
    queryFn: async () => (await client.invitations(id)).invitations ?? [],
    enabled: !!id,
  });
}

export function useTenantDomain(id: string) {
  return useQuery({
    queryKey: tenantsKeys.domain(id),
    queryFn: () => client.domain(id),
    enabled: !!id,
    refetchOnWindowFocus: false,
  });
}

/** Config du serveur, ou une config vide s'il n'en a pas encore. */
export function effectiveConfig(
  configs: DiscordConfig[],
  guildId: string
): DiscordConfig {
  const found = configs.find((c) => String(c.guild_id) === String(guildId));
  return (
    found ?? {
      guild_id: guildId,
      staff_log_channel_id: null,
      matches_live_channel_id: null,
      disputes_forum_channel_id: null,
      news_ingest_channel_id: null,
      scrims_announce_channel_id: null,
      free_players_channel_id: null,
      team_openings_channel_id: null,
      mvp_results_channel_id: null,
      teams_voice_category_id: null,
      captain_role_id: null,
      substitute_role_id: null,
      staff_role_owner_id: null,
      staff_role_admin_id: null,
      staff_role_caster_id: null,
      disputes_forum_tag_open_id: null,
      disputes_forum_tag_pending_id: null,
      disputes_forum_tag_resolved_id: null,
      member_leave_channel_id: null,
      welcome_enabled: false,
      welcome_channel_id: null,
      welcome_message: null,
      welcome_dm_message: null,
      placement_roles: null,
    }
  );
}

/** Configs Discord d'un espace : hydrate le formulaire de réglages. */
export function useTenantDiscordConfigs(id: string) {
  return useQuery({
    queryKey: tenantsKeys.discordConfigs(id),
    queryFn: async () => (await client.discordConfigs(id)).configs ?? [],
    enabled: !!id,
    ...EDITOR_QUERY_OPTIONS,
  });
}

/** Inventaire salons/rôles du serveur — chargé à la demande (bouton). */
export function useDiscordInventory(
  id: string,
  guildId: string,
  enabled: boolean
) {
  return useQuery({
    queryKey: tenantsKeys.discordInventory(id, guildId),
    queryFn: () => client.discordInventory(id, guildId),
    enabled: enabled && !!id && !!guildId,
    retry: false,
    ...EDITOR_QUERY_OPTIONS,
  });
}

export function useTenantApiTokens(id: string | null) {
  return useQuery({
    queryKey: tenantsKeys.apiTokens(id ?? ''),
    queryFn: async () => (await client.apiTokens(id as string)).tokens ?? [],
    enabled: !!id,
  });
}

/** Préparation de tous les espaces (clés API, blocages, invitation bot). */
export function useTenantsReadiness<T>() {
  return useQuery({
    queryKey: tenantsKeys.readiness,
    queryFn: () => client.readiness<T>(),
  });
}

export function useTenantsUsage<T>() {
  return useQuery({
    queryKey: tenantsKeys.usage,
    queryFn: () => client.usage<T>(),
  });
}

/**
 * Liens Discord en attente — endpoint owner-only : un refus (403 manager)
 * se lit comme « aucun lien », jamais comme une erreur affichée.
 */
export function usePendingGuildLinksSoft() {
  return useQuery({
    queryKey: [...tenantsKeys.pendingGuildLinks, 'soft'],
    queryFn: async () =>
      (await client.pendingGuildLinks().catch(() => ({ links: [] }))).links ??
      [],
  });
}

/** Page de demandes d'espace ; la page précédente reste affichée pendant la lecture. */
export function useTenantRequests<T>(query: string) {
  return useQuery({
    queryKey: tenantsKeys.tenantRequests(query),
    queryFn: () => client.tenantRequests<T>(query),
    placeholderData: keepPreviousData,
  });
}
