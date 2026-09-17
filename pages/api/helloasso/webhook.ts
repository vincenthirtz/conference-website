import crypto from 'crypto';
import type { NextApiRequest, NextApiResponse } from 'next';
import type { HelloAssoWebhookEvent } from '@/utils/helloasso';
import { emitBotEvent } from '@/utils/botEvents';
import { DEFAULT_TENANT_ID } from '@/utils/tenant';
import { applyRateLimit } from '@/utils/rateLimit';
import {
  resolvePlanCorrelation,
  applyTenantPlanPayment,
} from '@/utils/billing/tenantPlanBilling';
import {
  resolvePrizeCorrelation,
  applyPrizeContribution,
} from '@/utils/billing/prizePoolFunding';
import {
  isValidWebhookToken,
  tenantIdBySlugForWebhook,
} from '@/utils/billing/helloassoAccount';
import {
  buildDonationRow,
  classifyDonation,
} from '@/utils/helloasso/donationEvent';
import { supabaseAdmin } from '@/utils/supabase';

import { logger } from '../../../utils/logger';
/**
 * HelloAsso webhook endpoint.
 *
 * Configure this URL in the HelloAsso dashboard:
 *   - compte de l'ASSOCIATION :
 *       https://yoursite.com/api/helloasso/webhook?token=<HELLOASSO_WEBHOOK_SECRET>
 *   - compte d'un ESPACE TIERS (sa propre association) :
 *       https://yoursite.com/api/helloasso/webhook?tenant=<slug>&token=<jeton dérivé>
 *     Le jeton est dérivé par espace (`utils/billing/helloassoAccount.ts`) et
 *     affiché dans l'écran de connexion HelloAsso de l'espace. Un secret
 *     PARTAGÉ entre associations aurait permis à chacune de déclarer des
 *     paiements pour les autres.
 *
 * HelloAsso sends POST requests for payment events.
 *
 * ── Authentication ───────────────────────────────────────────────
 * HelloAsso n'envoie PAS de signature HMAC standard sur ses notifications
 * (cf. https://dev.helloasso.com/docs/notifications — la doc ne documente
 * aucun header de signature). L'approche retenue est donc un SECRET PARTAGÉ
 * configuré dans l'URL du webhook côté dashboard HelloAsso :
 *
 *   - query param `?token=<secret>`  (recommandé, simple à configurer)
 *   - OU header `x-helloasso-signature: <secret>`  (si on préfère hors-URL)
 *
 * Le secret attendu vient de `process.env.HELLOASSO_WEBHOOK_SECRET`. La
 * comparaison est en temps constant (`crypto.timingSafeEqual`) pour éviter
 * les timing attacks. Sans ce gate, n'importe qui pouvait POST un faux
 * paiement `{eventType:'Payment', data:{state:'Authorized'}}` et déclencher
 * l'event `helloasso.payment.received`.
 *
 * FAIL-CLOSED : si `HELLOASSO_WEBHOOK_SECRET` n'est pas configuré en env, on
 * répond 503 (et on warn) plutôt que d'accepter aveuglément — un webhook de
 * paiement non authentifié est un risque qu'on refuse d'ouvrir par défaut.
 */

const WEBHOOK_SECRET_ENV = 'HELLOASSO_WEBHOOK_SECRET';

/** Constant-time string comparison (longueurs comparées hors-bande). */
function constantTimeEqual(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function extractProvidedSecret(req: NextApiRequest): string | null {
  // 1) query param ?token=
  const rawToken = req.query.token;
  const token = Array.isArray(rawToken) ? rawToken[0] : rawToken;
  if (typeof token === 'string' && token.length > 0) return token;

  // 2) header x-helloasso-signature
  const rawHeader = req.headers['x-helloasso-signature'];
  const header = Array.isArray(rawHeader) ? rawHeader[0] : rawHeader;
  if (typeof header === 'string' && header.length > 0) return header;

  return null;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Dedicated rate-limit bucket: a public webhook URL must not be a DoS vector.
  if (
    applyRateLimit(
      req,
      res,
      { max: 60, windowMs: 60 * 1000 },
      'helloasso-webhook'
    )
  ) {
    return;
  }

  // ── Auth gate (avant toute logique métier) ──────────────────────
  const expectedSecret = process.env[WEBHOOK_SECRET_ENV];
  if (!expectedSecret) {
    // Fail-closed : pas de secret configuré → on refuse au lieu d'accepter.
    logger.warn(
      '[helloasso/webhook] webhook secret not configured — rejecting (set HELLOASSO_WEBHOOK_SECRET)'
    );
    return res.status(503).json({ error: 'Webhook not configured' });
  }

  const provided = extractProvidedSecret(req);
  if (!provided) {
    logger.warn('[helloasso/webhook] rejected: missing secret');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // POUR QUI cette notification parle-t-elle ? Sans `tenant`, c'est le compte
  // de l'association (secret plateforme). Avec, c'est celui d'un espace tiers,
  // et le jeton est le sien — dérivé, jamais partagé.
  const rawTenant = req.query.tenant;
  const tenantSlug = Array.isArray(rawTenant) ? rawTenant[0] : rawTenant;
  let authTenantId = DEFAULT_TENANT_ID;
  let authSource: 'platform' | 'tenant' = 'platform';

  if (typeof tenantSlug === 'string' && tenantSlug.length > 0) {
    const tenantId = await tenantIdBySlugForWebhook(tenantSlug);
    if (!tenantId || !isValidWebhookToken(tenantId, provided)) {
      logger.warn(
        '[helloasso/webhook] rejected: invalid tenant token (slug=%s)',
        tenantSlug
      );
      return res.status(401).json({ error: 'Unauthorized' });
    }
    authTenantId = tenantId;
    authSource = 'tenant';
  } else if (!constantTimeEqual(provided, expectedSecret)) {
    logger.warn('[helloasso/webhook] rejected: invalid or missing secret');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const event = req.body as HelloAssoWebhookEvent;

  if (!event?.eventType || !event?.data) {
    return res.status(400).json({ error: 'Invalid webhook payload' });
  }

  // Log the event for now — extend with DB writes or emails as needed
  logger.info(
    `[helloasso/webhook] ${event.eventType} — amount=${event.data.amount} state=${event.data.state} payer=${event.data.payer?.email ?? 'unknown'}`
  );

  if (event.eventType === 'Payment' && event.data.state === 'Authorized') {
    const payerName = [event.data.payer?.firstName, event.data.payer?.lastName]
      .filter(Boolean)
      .join(' ')
      .trim();
    void emitBotEvent(
      'helloasso.payment.received',
      {
        helloasso_payment_id: event.data.id,
        amount: event.data.amount,
        currency: 'EUR',
        payer_name: payerName || null,
        payer_email: event.data.payer?.email ?? null,
      },
      authTenantId
    ).catch((err) =>
      logger.warn(
        '[helloasso/webhook] helloasso.payment.received emit failed',
        err
      )
    );

    // ── AJOUT « Régie solidaire » : don ciblé tenant + plan ────────────────
    // Corrélation via la metadata du checkout-intent (canal primaire) ou le
    // mapping tenant_plan_checkouts (fallback). Un don GÉNÉRIQUE (sans
    // metadata plan) ne matche pas → comportement inchangé.
    // Ce que les corrélations ont établi, relu plus bas pour décider si le
    // paiement est un DON (alerte OBS). `null` = inconnu : la lecture a échoué.
    let planCorrelated: boolean | null = null;
    let prizeCorrelated: boolean | null = null;
    try {
      // Les abonnements de plan se paient à L'ASSOCIATION : une notification
      // venue du compte d'un espace tiers n'a rien à y appliquer.
      const correlation =
        authSource === 'platform' ? await resolvePlanCorrelation(event) : null;
      planCorrelated = correlation != null;
      if (correlation) {
        const result = await applyTenantPlanPayment({
          helloassoPaymentId: event.data.id,
          tenantId: correlation.tenantId,
          plan: correlation.plan,
          amountCents: event.data.amount,
          checkoutIntentId: correlation.checkoutIntentId,
          // La période payée vient de la corrélation (metadata, ou mapping en
          // secours). Sans elle, un paiement mensuel prolongerait d'un an.
          term: correlation.term,
        });
        logger.info(
          `[helloasso/webhook] tenant plan payment ${event.data.id}: ${result.status} tenant=${correlation.tenantId} plan=${correlation.plan} term=${correlation.term} via=${correlation.source}`
        );
      }
    } catch (err) {
      // Ne casse jamais l'ACK webhook : on log et on répond 200 (HelloAsso ne
      // doit pas retenter en boucle sur une erreur applicative).
      logger.error('[helloasso/webhook] tenant plan apply error', err);
    }

    // ── AJOUT « cash-prize crowdfundé » : contribution ciblée cagnotte ─────
    // Corrélation via la metadata du checkout-intent (kind:'prize_pool') ou le
    // mapping prize_pool_checkouts (fallback). Un don GÉNÉRIQUE ou un don plan
    // ne matche pas → comportement inchangé. Idempotent sur helloasso_payment_id
    // (colonne TEXT), d'où le String(...).
    try {
      const prize = await resolvePrizeCorrelation(event);
      prizeCorrelated = prize != null;
      // La cagnotte doit appartenir à l'espace qui s'authentifie : sinon une
      // association pourrait créditer la cagnotte d'une autre avec un paiement
      // encaissé chez elle.
      if (prize && prize.tenantId !== authTenantId) {
        logger.warn(
          '[helloasso/webhook] cagnotte %s hors de l’espace authentifié (%s)',
          prize.prizePoolId,
          authTenantId
        );
      } else if (prize) {
        const result = await applyPrizeContribution(
          prize,
          String(event.data.id),
          event.data.amount
        );
        logger.info(
          `[helloasso/webhook] prize contribution ${event.data.id}: ${result.status} pool=${prize.prizePoolId} via=${prize.source}`
        );
      }
    } catch (err) {
      logger.error('[helloasso/webhook] prize contribution apply error', err);
    }

    // ── AJOUT « alerte don » (source OBS /overlay/don-alert) ──────────────
    // Un don générique est persisté — montant et formulaire, JAMAIS le payeur
    // (cf. utils/helloasso/donationEvent.ts). Idempotent sur
    // (tenant_id, helloasso_payment_id) : un rejeu n'ajoute rien.
    try {
      const classification = classifyDonation(event, {
        source: authSource,
        planCorrelated,
        prizeCorrelated,
      });
      // Sans donnée personnelle : sert à vérifier dans les logs quels
      // formulaires arrivent et comment ils sont classés.
      logger.info(
        `[helloasso/webhook] payment ${event.data.id} form: formType=${classification.formType ?? 'none'} formSlug=${classification.formSlug ?? 'none'} donation=${classification.isDonation ? 'yes' : `no (${classification.reason})`}`
      );
      const row = buildDonationRow(event, authTenantId, classification);
      if (row) {
        const { error } = await supabaseAdmin
          .from('helloasso_donations')
          .upsert(row, {
            onConflict: 'tenant_id,helloasso_payment_id',
            ignoreDuplicates: true,
          });
        if (error) {
          logger.error('[helloasso/webhook] donation insert error', error);
        }
      }
    } catch (err) {
      logger.error('[helloasso/webhook] donation record error', err);
    }
  }

  // Always respond 200 so HelloAsso doesn't retry
  return res.status(200).json({ ok: true });
}
