// features/admin/communications/hooks/useCommunications.ts — lectures en
// cache (TanStack Query) et exécution des écritures idempotentes du hub
// /admin/communications.

import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  useIdempotentMutation,
  type UseIdempotentMutationOptions,
} from '@/hooks/useIdempotentMutation';
import { adminKey } from '../../_shared/query';
import {
  campaignsClient,
  socialClient,
  staffNotificationsClient,
  teamMessagesClient,
  type AdminCall,
} from '../client';

export const communicationsKeys = {
  all: adminKey('communications'),
  campaigns: () => [...communicationsKeys.all, 'campaigns'] as const,
  campaignPage: (limit: number, offset: number) =>
    [...communicationsKeys.campaigns(), 'page', limit, offset] as const,
  subscriptions: () => [...communicationsKeys.campaigns(), 'subscriptions'],
  teamMessages: () => [...communicationsKeys.all, 'team-messages'] as const,
  social: () => [...communicationsKeys.all, 'social'] as const,
  socialState: () => [...communicationsKeys.social(), 'state'] as const,
  instagramSetup: () => [...communicationsKeys.social(), 'instagram'] as const,
  tiktok: () => [...communicationsKeys.social(), 'tiktok'] as const,
  notificationPrefs: () =>
    [...communicationsKeys.all, 'notification-prefs'] as const,
};

/**
 * Exécute un `AdminCall` par `useIdempotentMutation` : même clé conservée
 * d'un essai raté à l'autre, même file hors ligne, mêmes erreurs qu'avant.
 */
export function useIdempotentCall(options?: UseIdempotentMutationOptions) {
  const { mutateJson, regenerate } = useIdempotentMutation(options);
  const run = useCallback(
    <T>(c: AdminCall<T>) => mutateJson<T>(c.url, c.init),
    [mutateJson]
  );
  return { run, regenerate };
}

// ---- Campagnes -------------------------------------------------------------

export function useCampaignsPage(limit: number, offset: number) {
  return useQuery({
    queryKey: communicationsKeys.campaignPage(limit, offset),
    queryFn: () => campaignsClient.list({ limit, offset }),
  });
}

/** Recharge les listes de campagnes (toutes pages) après une écriture. */
export function useRefreshCampaigns() {
  const qc = useQueryClient();
  return useCallback(
    () =>
      qc.invalidateQueries({
        queryKey: [...communicationsKeys.campaigns(), 'page'],
      }),
    [qc]
  );
}

export function useCampaignSubscriptions() {
  return useQuery({
    queryKey: communicationsKeys.subscriptions(),
    queryFn: campaignsClient.subscriptions,
  });
}

// ---- Messages aux équipes --------------------------------------------------

export function useTeamMessagesState() {
  return useQuery({
    queryKey: communicationsKeys.teamMessages(),
    queryFn: teamMessagesClient.state,
    // La sélection d'équipes est réinitialisée à chaque chargement (comme
    // avant) : un rechargement au retour sur l'onglet du navigateur effacerait
    // en silence ce que le staff vient de cocher.
    refetchOnWindowFocus: false,
  });
}

// ---- Réseaux ---------------------------------------------------------------

export function useSocialPostsState() {
  return useQuery({
    queryKey: communicationsKeys.socialState(),
    queryFn: socialClient.state,
  });
}

/** Best-effort : son échec ne bloque pas le composeur (cf. SocialPostsPanel). */
export function useInstagramSetup() {
  return useQuery({
    queryKey: communicationsKeys.instagramSetup(),
    queryFn: socialClient.instagramSetup,
    retry: false,
  });
}

export function useTiktokCredentials() {
  return useQuery({
    queryKey: communicationsKeys.tiktok(),
    queryFn: socialClient.tiktokCredentials,
  });
}

// ---- Notifications push ----------------------------------------------------

export function useNotificationPrefs() {
  return useQuery({
    queryKey: communicationsKeys.notificationPrefs(),
    queryFn: staffNotificationsClient.prefs,
    // Les préférences sont éditées localement avant « Enregistrer » : un
    // rechargement en arrière-plan ne doit pas écraser la saisie.
    refetchOnWindowFocus: false,
  });
}
