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

import { logger } from '../../../utils/logger';
/**
 * HelloAsso webhook endpoint.
 *
 * Configure this URL in the HelloAsso dashboard:
 *   https://yoursite.com/api/helloasso/webhook?token=<HELLOASSO_WEBHOOK_SECRET>
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
  if (!provided || !constantTimeEqual(provided, expectedSecret)) {
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
      DEFAULT_TENANT_ID
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
    try {
      const correlation = await resolvePlanCorrelation(event);
      if (correlation) {
        const result = await applyTenantPlanPayment({
          helloassoPaymentId: event.data.id,
          tenantId: correlation.tenantId,
          plan: correlation.plan,
          amountCents: event.data.amount,
          checkoutIntentId: correlation.checkoutIntentId,
        });
        logger.info(
          `[helloasso/webhook] tenant plan payment ${event.data.id}: ${result.status} tenant=${correlation.tenantId} plan=${correlation.plan} via=${correlation.source}`
        );
      }
    } catch (err) {
      // Ne casse jamais l'ACK webhook : on log et on répond 200 (HelloAsso ne
      // doit pas retenter en boucle sur une erreur applicative).
      logger.error('[helloasso/webhook] tenant plan apply error', err);
    }
  }

  // Always respond 200 so HelloAsso doesn't retry
  return res.status(200).json({ ok: true });
}
