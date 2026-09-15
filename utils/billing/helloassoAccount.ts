// utils/billing/helloassoAccount.ts
//
// « Quel compte HelloAsso encaisse pour cet espace ? »
//
// POURQUOI CE MODULE (correctif du 2026-09-16, backlog Q036). Les identifiants
// HelloAsso étaient ceux de la PLATEFORME, pour tout le monde : un staff
// d'espace tiers ouvrait une cagnotte, le public payait, et l'argent arrivait
// sur le compte de l'association — sans aucun moyen de le reverser. Collecter
// pour autrui n'est pas un détail technique : c'est un risque juridique et
// comptable, et la page publique promettait le contraire.
//
// DÉSORMAIS : chaque espace apporte SON compte (secrets chiffrés par tenant,
// `integration_secrets`), obtenu depuis son back-office HelloAsso (« Mon compte
// › Intégrations et API », privilège `Checkout`). L'espace de la Coupe garde
// celui de l'environnement — c'est le compte de l'association, et c'est bien
// elle qui organise.
//
// SANS COMPTE, ON NE COLLECTE PAS. `resolveCollectingAccount` rend `null`, et
// les appelants refusent d'ouvrir une cagnotte ou de créer un paiement. Un
// refus explicite vaut mieux qu'un encaissement au mauvais endroit.
//
// LE WEBHOOK A BESOIN D'UN JETON PAR ESPACE. Chaque association configure
// elle-même l'URL de notification dans son back-office : si toutes portaient le
// même secret, chaque organisation connaîtrait celui des autres et pourrait
// déclarer des paiements à leur place. Le jeton est donc DÉRIVÉ
// (`HMAC(HELLOASSO_WEBHOOK_SECRET, tenantId)`) : rien de plus à stocker, rien à
// révoquer une par une, et la rotation du secret plateforme les invalide tous.

import crypto from 'crypto';

import { supabaseAdmin } from '@/utils/supabase';
import { logger } from '@/utils/logger';
import { DEFAULT_TENANT_ID } from '@/utils/tenant';
import {
  getIntegrationSecret,
  hasIntegrationSecret,
} from '@/utils/integrationSecrets';
import type { HelloAssoCredentials } from '@/utils/helloasso';

/**
 * Le compte de la PLATEFORME ne porte pas d'identifiants ici : ils vivent dans
 * l'environnement, et `createCheckoutIntent` les lit tout seul quand on ne lui
 * en passe pas. Les rapatrier aurait fait lever ce module quand l'environnement
 * est incomplet — une panne de configuration déguisée en « non relié ».
 */
export type CollectingAccount =
  | { source: 'platform'; credentials?: undefined }
  | { source: 'tenant'; credentials: HelloAssoCredentials };

/**
 * Le compte qui encaisse POUR cet espace, ou `null` s'il n'en a pas.
 *
 * L'espace historique (la Coupe) encaisse sur le compte de l'association ;
 * tout autre espace doit avoir connecté le sien.
 */
export async function resolveCollectingAccount(
  tenantId: string
): Promise<CollectingAccount | null> {
  if (tenantId === DEFAULT_TENANT_ID) return { source: 'platform' };

  const [clientId, clientSecret, orgSlug] = await Promise.all([
    getIntegrationSecret(tenantId, 'helloasso_client_id'),
    getIntegrationSecret(tenantId, 'helloasso_client_secret'),
    getIntegrationSecret(tenantId, 'helloasso_org_slug'),
  ]);
  if (!clientId || !clientSecret || !orgSlug) return null;
  return { source: 'tenant', credentials: { clientId, clientSecret, orgSlug } };
}

/**
 * L'espace peut-il encaisser ? Lecture LÉGÈRE (présence des secrets, sans
 * déchiffrement) pour les écrans et les réponses publiques.
 */
export async function canCollectForTenant(tenantId: string): Promise<boolean> {
  if (tenantId === DEFAULT_TENANT_ID) return true;
  const [hasId, hasSecret, hasSlug] = await Promise.all([
    hasIntegrationSecret(tenantId, 'helloasso_client_id'),
    hasIntegrationSecret(tenantId, 'helloasso_client_secret'),
    hasIntegrationSecret(tenantId, 'helloasso_org_slug'),
  ]);
  return hasId && hasSecret && hasSlug;
}

/* ---------------------------------------------------------------------------
 * Jeton de notification, dérivé par espace
 * ------------------------------------------------------------------------- */

/** `null` si le secret plateforme manque : on ne fabrique pas un jeton vide. */
export function helloAssoWebhookToken(tenantId: string): string | null {
  const secret = process.env.HELLOASSO_WEBHOOK_SECRET;
  if (!secret) return null;
  return crypto
    .createHmac('sha256', secret)
    .update(`helloasso-webhook:${tenantId}`)
    .digest('base64url');
}

/**
 * Le jeton présenté correspond-il à cet espace ?
 *
 * Comparaison à temps constant, et longueurs comparées hors-bande (une
 * comparaison de longueurs différentes lèverait dans `timingSafeEqual`).
 */
export function isValidWebhookToken(
  tenantId: string,
  provided: string
): boolean {
  const expected = helloAssoWebhookToken(tenantId);
  if (!expected) return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/** L'espace désigné par un slug, pour l'URL de notification d'une association. */
export async function tenantIdBySlugForWebhook(
  slug: string
): Promise<string | null> {
  if (!supabaseAdmin) return null;
  const { data, error } = await supabaseAdmin
    .from('tenants')
    .select('id, is_active')
    .eq('slug', slug)
    .maybeSingle();
  if (error) {
    logger.error('[helloasso] espace introuvable par slug: %s', error.message);
    return null;
  }
  const row = data as { id: string; is_active: boolean | null } | null;
  if (!row || row.is_active === false) return null;
  return row.id;
}

/** L'URL à coller dans le back-office HelloAsso de l'espace. */
export function helloAssoNotificationUrl(
  siteUrl: string,
  tenantSlug: string,
  tenantId: string
): string | null {
  const token = helloAssoWebhookToken(tenantId);
  if (!token) return null;
  const url = new URL('/api/helloasso/webhook', siteUrl);
  url.searchParams.set('tenant', tenantSlug);
  url.searchParams.set('token', token);
  return url.toString();
}
