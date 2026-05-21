import type { NextApiRequest, NextApiResponse } from 'next';
import type { HelloAssoWebhookEvent } from '@/utils/helloasso';
import { emitBotEvent } from '@/utils/botEvents';
import { DEFAULT_TENANT_ID } from '@/utils/tenant';

import { logger } from '../../../utils/logger';
/**
 * HelloAsso webhook endpoint.
 *
 * Configure this URL in the HelloAsso dashboard:
 *   https://yoursite.com/api/helloasso/webhook
 *
 * HelloAsso sends POST requests for payment events.
 * For now we log the event; extend this to store donations in Supabase
 * or send confirmation emails as needed.
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
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
  }

  // Always respond 200 so HelloAsso doesn't retry
  return res.status(200).json({ ok: true });
}
