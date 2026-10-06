// features/admin/integrations/client.ts — clés API et webhooks sortants de
// l'espace courant (/admin/api-tokens, /admin/webhooks) — L10.
//
// SECRETS. La création d'une clé API renvoie le clair, celle d'un webhook son
// secret de signature, UNE seule fois : ces écritures restent sur
// `useIdempotentMutation` (chemins ci-dessous), leur réponse n'est gardée
// qu'en état local le temps de l'affichage et n'entre jamais dans le cache
// de requêtes. Les lectures (listes, livraisons) ne portent aucun secret.

import { adminRequest } from '@/utils/admin/adminHttp';

const TOKENS = '/api/admin/api-tokens';
const WEBHOOKS = '/api/admin/webhooks';
const enc = encodeURIComponent;

export const integrationsPaths = {
  apiTokens: TOKENS,
  apiToken: (id: string) => `${TOKENS}/${enc(id)}`,
  webhooks: WEBHOOKS,
  webhook: (id: string) => `${WEBHOOKS}/${enc(id)}`,
  webhookTest: (id: string) => `${WEBHOOKS}/${enc(id)}/test`,
  webhookRedeliver: (id: string) => `${WEBHOOKS}/${enc(id)}/redeliver`,
  /** Révèle le nouveau secret UNE fois : réponse jamais mise en cache. */
  webhookRotateSecret: (id: string) => `${WEBHOOKS}/${enc(id)}/rotate-secret`,
} as const;

/** Résultat d'un envoi immédiat (test ou renvoi). */
export type WebhookSendResult = {
  ok: boolean;
  status: number | null;
  error: string | null;
};

export type ApiTokenListRow = {
  id: string;
  name: string;
  token_prefix: string;
  scopes: string[];
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
  expires_at?: string | null;
  created_by?: string | null;
  created_by_name?: string | null;
  comp?: boolean | null;
  comp_note?: string | null;
};

export type WebhookSubscription = {
  id: string;
  url: string;
  event_types: string[];
  description: string | null;
  enabled: boolean;
  consecutive_failures: number;
  disabled_at: string | null;
  last_delivery_at: string | null;
  last_error: string | null;
  created_at: string;
};

export type WebhookDelivery = {
  id: string;
  event_name: string;
  status: string;
  attempts: number;
  response_status: number | null;
  last_error: string | null;
  delivered_at: string | null;
  created_at: string;
};

export const integrationsClient = {
  apiTokens: () => adminRequest<{ tokens?: ApiTokenListRow[] }>(TOKENS),
  webhooks: () =>
    adminRequest<{
      subscriptions?: WebhookSubscription[];
      availableEvents?: string[];
    }>(WEBHOOKS),
  webhookDeliveries: (id: string) =>
    adminRequest<{ deliveries?: WebhookDelivery[] }>(
      `${integrationsPaths.webhook(id)}/deliveries`
    ),
};
