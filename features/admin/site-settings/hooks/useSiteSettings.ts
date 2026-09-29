// features/admin/site-settings/hooks/useSiteSettings.ts — onglets de
// /admin/site-settings sur cache de requêtes.
//
// Ces écrans ÉDITENT une copie locale des valeurs serveur : un rafraîchissement
// au retour sur l'onglet du navigateur écraserait une saisie en cours. D'où
// `refetchOnWindowFocus: false` ; chaque mutation recharge sa ressource
// (même comportement que l'ancien `await load()`).

import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryKey,
} from '@tanstack/react-query';
import { adminKey } from '../../_shared/query';
import { siteSettingsClient as client } from '../client';

export const siteSettingsKeys = {
  all: adminKey('site-settings'),
  list: () => [...siteSettingsKeys.all, 'list'] as const,
  seasonalLogos: () => [...siteSettingsKeys.all, 'seasonal-logos'] as const,
  teamRoles: () => [...siteSettingsKeys.all, 'team-roles'] as const,
  discordWebhooks: () => [...siteSettingsKeys.all, 'discord-webhooks'] as const,
  emailSender: () => [...siteSettingsKeys.all, 'email-sender'] as const,
  helloAsso: () => [...siteSettingsKeys.all, 'helloasso'] as const,
};

const EDITABLE = { refetchOnWindowFocus: false } as const;

export function useSiteSettingsList() {
  return useQuery({
    queryKey: siteSettingsKeys.list(),
    queryFn: client.list,
    ...EDITABLE,
  });
}

export function useSeasonalLogos() {
  return useQuery({
    queryKey: siteSettingsKeys.seasonalLogos(),
    queryFn: client.seasonalLogos,
    ...EDITABLE,
  });
}

export function useTeamRolesSetting() {
  return useQuery({
    queryKey: siteSettingsKeys.teamRoles(),
    queryFn: client.teamRoles,
    ...EDITABLE,
  });
}

export function useGlobalDiscordWebhooks() {
  return useQuery({
    queryKey: siteSettingsKeys.discordWebhooks(),
    queryFn: client.discordWebhooks,
    ...EDITABLE,
  });
}

export function useEmailSender() {
  return useQuery({
    queryKey: siteSettingsKeys.emailSender(),
    queryFn: client.emailSender,
    ...EDITABLE,
  });
}

export function useHelloAssoAccount() {
  return useQuery({
    queryKey: siteSettingsKeys.helloAsso(),
    queryFn: client.helloAsso,
    ...EDITABLE,
  });
}

/**
 * Mutation qui, en cas de succès, relance la lecture de `key` sans l'attendre :
 * l'écran affiche son toast tout de suite, puis son état de chargement
 * pendant la relecture (ordre de l'ancien « toast puis load() »).
 */
function useReloadingMutation<V, R>(
  key: QueryKey,
  mutationFn: (vars: V) => Promise<R>
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: key });
    },
  });
}

export const useUpsertSiteSetting = () =>
  useReloadingMutation(siteSettingsKeys.list(), client.upsert);

/** La réponse EST la nouvelle valeur : on la pose dans le cache, sans relire. */
export function useSaveSeasonalLogos() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: client.saveSeasonalLogos,
    onSuccess: (data) =>
      qc.setQueryData(siteSettingsKeys.seasonalLogos(), data),
  });
}

export function useSaveTeamRoles() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: client.saveTeamRoles,
    onSuccess: (json, roles) =>
      qc.setQueryData(siteSettingsKeys.teamRoles(), {
        roles: json.roles || roles,
      }),
  });
}

export const useSaveDiscordWebhook = () =>
  useReloadingMutation(
    siteSettingsKeys.discordWebhooks(),
    client.saveDiscordWebhook
  );
export const useDeleteDiscordWebhook = () =>
  useReloadingMutation(
    siteSettingsKeys.discordWebhooks(),
    client.deleteDiscordWebhook
  );
export const useTestDiscordWebhook = () =>
  useMutation({ mutationFn: client.testDiscordWebhook });

export const useSaveEmailSender = () =>
  useReloadingMutation(siteSettingsKeys.emailSender(), client.saveEmailSender);
export const useClearEmailSender = () =>
  useReloadingMutation(siteSettingsKeys.emailSender(), () =>
    client.clearEmailSender()
  );

export const useSaveHelloAsso = () =>
  useReloadingMutation(siteSettingsKeys.helloAsso(), client.saveHelloAsso);
export const useClearHelloAsso = () =>
  useReloadingMutation(siteSettingsKeys.helloAsso(), () =>
    client.clearHelloAsso()
  );
