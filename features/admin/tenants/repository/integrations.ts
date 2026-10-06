// features/admin/tenants/repository/integrations.ts — clés d'API publiques,
// webhooks sortants, secrets du bot, file d'onboarding.
//
// SECRETS. Aucune lecture de ce fichier ne rend `token_hash`, le `secret` d'un
// webhook (hors exception ci-dessous), ni un jeton de `tenant_requests`. Le seul secret LU est
// l'empreinte courante de la clé bot, pour la garder valable 48 h pendant une
// rotation — elle ne quitte jamais le service. Exception assumée :
// `getWebhookSigningTarget` lit le secret d'un webhook pour SIGNER un envoi
// immédiat (test, renvoi) ; lui non plus ne quitte jamais le service.

import type { AdminDb } from '@/utils/admin/serviceContext';
import type { Database } from '@/types/database.generated';
import {
  API_TOKEN_LIST_COLUMNS,
  TENANT_API_TOKEN_LIST_COLUMNS,
  TENANT_REQUEST_COLUMNS,
  WEBHOOK_CREATED_COLUMNS,
  WEBHOOK_DELIVERY_COLUMNS,
  WEBHOOK_LIST_COLUMNS,
} from '../schemas';

type WebhookUpdate =
  Database['public']['Tables']['webhook_subscriptions']['Update'];
type TenantSecretsUpsert =
  Database['public']['Tables']['tenant_secrets']['Insert'];

/* ------------------------------ clés d'API ----------------------------- */

export async function listApiTokens(db: AdminDb, tenantId: string) {
  const { data, error } = await db
    .from('tenant_api_tokens')
    .select(API_TOKEN_LIST_COLUMNS)
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false });
  return { rows: data ?? [], error };
}

export async function listTenantApiTokens(db: AdminDb, tenantId: string) {
  const { data, error } = await db
    .from('tenant_api_tokens')
    .select(TENANT_API_TOKEN_LIST_COLUMNS)
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false });
  return { rows: data ?? [], error };
}

export async function getApiTokenForRevoke(
  db: AdminDb,
  tenantId: string,
  tokenId: string
) {
  const { data, error } = await db
    .from('tenant_api_tokens')
    .select('id, name, token_prefix, revoked_at')
    .eq('id', tokenId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  return { row: data, error };
}

export async function getApiTokenForPatch(
  db: AdminDb,
  tenantId: string,
  tokenId: string
) {
  const { data, error } = await db
    .from('tenant_api_tokens')
    .select('id, name, token_prefix, comp, comp_note')
    .eq('id', tokenId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  return { row: data, error };
}

export async function revokeApiToken(
  db: AdminDb,
  tenantId: string,
  tokenId: string,
  revokedAt: string
) {
  const { error } = await db
    .from('tenant_api_tokens')
    .update({ revoked_at: revokedAt })
    .eq('id', tokenId)
    .eq('tenant_id', tenantId);
  return { error };
}

export async function updateApiTokenComp(
  db: AdminDb,
  tenantId: string,
  tokenId: string,
  update: { comp?: boolean; comp_note?: string | null }
) {
  const { data, error } = await db
    .from('tenant_api_tokens')
    .update(update)
    .eq('id', tokenId)
    .eq('tenant_id', tenantId)
    .select('id, name, token_prefix, scopes, comp, comp_note, revoked_at')
    .single();
  return { row: data, error };
}

/* ------------------------------ webhooks ------------------------------- */

export async function listWebhooks(db: AdminDb, tenantId: string) {
  const { data, error } = await db
    .from('webhook_subscriptions')
    .select(WEBHOOK_LIST_COLUMNS)
    .eq('tenant_id', tenantId)
    .order('created_at', { ascending: false });
  return { rows: data ?? [], error };
}

/** Le secret est ÉCRIT (le dispatcher en a besoin en clair), jamais relu ici. */
export async function insertWebhook(
  db: AdminDb,
  row: Database['public']['Tables']['webhook_subscriptions']['Insert']
) {
  const { data, error } = await db
    .from('webhook_subscriptions')
    .insert(row)
    .select(WEBHOOK_CREATED_COLUMNS)
    .single();
  return { row: data, error };
}

export async function updateWebhook(
  db: AdminDb,
  tenantId: string,
  id: string,
  patch: WebhookUpdate
) {
  const { data, error } = await db
    .from('webhook_subscriptions')
    .update(patch)
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .select(WEBHOOK_LIST_COLUMNS)
    .maybeSingle();
  return { row: data, error };
}

/** État courant (sans secret) — base du journal avant / après d'une modification. */
export async function getWebhook(db: AdminDb, tenantId: string, id: string) {
  const { data, error } = await db
    .from('webhook_subscriptions')
    .select(WEBHOOK_LIST_COLUMNS)
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  return { row: data, error };
}

/**
 * SEULE lecture du secret d'un abonnement : il signe un envoi immédiat
 * (test, renvoi) et ne quitte JAMAIS le service — ni réponse, ni journal.
 */
export async function getWebhookSigningTarget(
  db: AdminDb,
  tenantId: string,
  id: string
) {
  const { data, error } = await db
    .from('webhook_subscriptions')
    .select('id, url, secret')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  return { row: data, error };
}

export async function getWebhookDelivery(
  db: AdminDb,
  subscriptionId: string,
  deliveryId: string
) {
  const { data, error } = await db
    .from('webhook_deliveries')
    .select('id, outbox_event_id, event_name, status, attempts')
    .eq('id', deliveryId)
    .eq('subscription_id', subscriptionId)
    .maybeSingle();
  return { row: data, error };
}

export async function updateWebhookDelivery(
  db: AdminDb,
  deliveryId: string,
  patch: Database['public']['Tables']['webhook_deliveries']['Update']
) {
  const { data, error } = await db
    .from('webhook_deliveries')
    .update(patch)
    .eq('id', deliveryId)
    .select(WEBHOOK_DELIVERY_COLUMNS)
    .maybeSingle();
  return { row: data, error };
}

/** Enveloppe outbox d'un event (le corps exact qu'avait envoyé le dispatcher). */
export async function getOutboxPayload(
  db: AdminDb,
  tenantId: string,
  eventId: string
) {
  const { data, error } = await db
    .from('bot_event_outbox')
    .select('event_id, event_name, payload')
    .eq('event_id', eventId)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  return { row: data, error };
}

export async function deleteWebhook(db: AdminDb, tenantId: string, id: string) {
  const { data, error } = await db
    .from('webhook_subscriptions')
    .delete()
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .select('id')
    .maybeSingle();
  return { row: data, error };
}

export async function getWebhookId(db: AdminDb, tenantId: string, id: string) {
  const { data, error } = await db
    .from('webhook_subscriptions')
    .select('id')
    .eq('id', id)
    .eq('tenant_id', tenantId)
    .maybeSingle();
  return { row: data, error };
}

export async function listWebhookDeliveries(
  db: AdminDb,
  subscriptionId: string,
  limit: number
) {
  const { data, error } = await db
    .from('webhook_deliveries')
    .select(WEBHOOK_DELIVERY_COLUMNS)
    .eq('subscription_id', subscriptionId)
    .order('created_at', { ascending: false })
    .limit(limit);
  return { rows: data ?? [], error };
}

/* ----------------------------- secrets bot ----------------------------- */

export async function clearPreviousBotKey(db: AdminDb, tenantId: string) {
  const { error } = await db
    .from('tenant_secrets')
    .update({ previous_key_hash: null, previous_key_expires_at: null })
    .eq('tenant_id', tenantId);
  return { error };
}

/** Empreinte courante (sha256) : devient la « précédente » à la rotation. */
export async function getCurrentBotKeyHash(db: AdminDb, tenantId: string) {
  const { data } = await db
    .from('tenant_secrets')
    .select('bot_api_key_hash')
    .eq('tenant_id', tenantId)
    .maybeSingle();
  return data?.bot_api_key_hash ?? null;
}

export async function upsertTenantSecrets(
  db: AdminDb,
  row: TenantSecretsUpsert
) {
  const { error } = await db
    .from('tenant_secrets')
    .upsert(row, { onConflict: 'tenant_id' });
  return { error };
}

/* ------------------------- file d'onboarding --------------------------- */

export type TenantRequestFilter =
  | { kind: 'all' }
  | { kind: 'in'; statuses: string[] }
  | { kind: 'eq'; status: string };

export async function countTenantRequests(
  db: AdminDb,
  filter: TenantRequestFilter
) {
  let q = db.from('tenant_requests').select('id', { count: 'exact' });
  if (filter.kind === 'in') q = q.in('status', filter.statuses);
  else if (filter.kind === 'eq') q = q.eq('status', filter.status);
  const { count, error } = await q;
  return { count, error };
}

export async function listTenantRequests(
  db: AdminDb,
  filter: TenantRequestFilter,
  offset: number,
  limit: number
) {
  let q = db
    .from('tenant_requests')
    .select(TENANT_REQUEST_COLUMNS)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (filter.kind === 'in') q = q.in('status', filter.statuses);
  else if (filter.kind === 'eq') q = q.eq('status', filter.status);
  const { data, error } = await q;
  return { rows: data ?? [], error };
}

export async function getTenantRequest(db: AdminDb, id: string) {
  const { data, error } = await db
    .from('tenant_requests')
    .select('id, status, requested_slug')
    .eq('id', id)
    .maybeSingle();
  return { row: data, error };
}

/** Transition atomique : seulement depuis un statut `pending_*`. */
export async function closeTenantRequest(
  db: AdminDb,
  id: string,
  pending: string[],
  patch: Database['public']['Tables']['tenant_requests']['Update']
) {
  const { data, error } = await db
    .from('tenant_requests')
    .update(patch)
    .eq('id', id)
    .in('status', pending)
    .select('id, status')
    .maybeSingle();
  return { row: data, error };
}
