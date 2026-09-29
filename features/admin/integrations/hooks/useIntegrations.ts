// features/admin/integrations/hooks/useIntegrations.ts — listes des clés API
// et des webhooks (sans secret). Les créations restent hors cache.

import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback } from 'react';
import { adminKey } from '../../_shared/query';
import { integrationsClient as client } from '../client';

export const integrationsKeys = {
  apiTokens: adminKey('api-tokens'),
  webhooks: adminKey('webhooks'),
  deliveries: (id: string) => adminKey('webhooks', 'deliveries', id),
};

export function useApiTokens() {
  return useQuery({
    queryKey: integrationsKeys.apiTokens,
    queryFn: async () => (await client.apiTokens()).tokens ?? [],
  });
}

export function useWebhooks() {
  return useQuery({
    queryKey: integrationsKeys.webhooks,
    queryFn: async () => {
      const res = await client.webhooks();
      return {
        subscriptions: res.subscriptions ?? [],
        availableEvents: res.availableEvents ?? [],
      };
    },
  });
}

/** Dernières livraisons d'un abonnement — lues à l'ouverture du volet. */
export function useWebhookDeliveries(id: string | null) {
  return useQuery({
    queryKey: integrationsKeys.deliveries(id ?? ''),
    queryFn: async () =>
      (await client.webhookDeliveries(id as string)).deliveries ?? [],
    enabled: !!id,
    refetchOnWindowFocus: false,
  });
}

/** Relit une liste et attend la fin (après une écriture). */
export function useReloadIntegrations() {
  const qc = useQueryClient();
  return useCallback(
    (key: 'apiTokens' | 'webhooks') =>
      qc.invalidateQueries({ queryKey: integrationsKeys[key], exact: true }),
    [qc]
  );
}
