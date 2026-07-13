// pages/api/admin/webhooks/index.ts
//
// GET  — list the active tenant's webhook subscriptions (metadata only; never
//        the signing secret). Includes disabled ones so the operator can audit.
// POST — create a subscription (url + event filter). The **secret** is returned
//        ONCE in the response (HMAC signing key) — sha256 is NOT used here; the
//        dispatcher needs the clear secret to sign, so it's stored clear
//        (service-role only) and revealed once at creation.
//
// Auth : admin+ on the active tenant (withStaffRoute). Tenant-scoped via
// `ctx.tenantId`. Rate-limited 10/min per IP.

import { z } from 'zod';
import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, type AuthenticatedStaffContext } from '@/utils/staff';
import { applyRateLimit } from '@/utils/rateLimit';
import { logStaffAction } from '@/utils/staffLogs';
import { logger } from '@/utils/logger';
import {
  generateWebhookSecret,
  parseWebhookEventTypes,
  WEBHOOK_EVENT_TYPES,
} from '@/utils/webhooks';

const createBodySchema = z.object({
  url: z
    .string()
    .trim()
    .url()
    .refine((u) => /^https?:\/\//i.test(u), 'URL doit être http(s).')
    .refine((u) => u.length <= 2000, 'URL trop longue.'),
  event_types: z.array(z.string()).min(1),
  description: z.string().trim().max(200).optional(),
});

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  if (applyRateLimit(req, res, { max: 10, windowMs: 60_000 }, 'admin-webhooks')) {
    return;
  }
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'GET') return handleList(res, ctx);
  if (req.method === 'POST') return handleCreate(req, res, ctx);

  res.setHeader('Allow', 'GET, POST');
  return res.status(405).json({ error: 'Method not allowed.' });
}

async function handleList(
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  const { data, error } = await supabaseAdmin
    .from('webhook_subscriptions')
    .select(
      'id, url, event_types, description, enabled, consecutive_failures, disabled_at, last_delivery_at, last_error, created_at'
    )
    .eq('tenant_id', ctx.tenantId)
    .order('created_at', { ascending: false });

  if (error) {
    logger.error('[admin/webhooks] list error', error, { tenantId: ctx.tenantId });
    return res.status(500).json({ error: 'Server error.' });
  }
  return res.status(200).json({
    subscriptions: data ?? [],
    availableEvents: WEBHOOK_EVENT_TYPES,
  });
}

async function handleCreate(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  const parsed = createBodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid body.', code: 'INVALID_BODY' });
  }

  const eventResult = parseWebhookEventTypes(parsed.data.event_types);
  if (!eventResult.ok) {
    return res.status(400).json({
      error: `Events invalides : ${eventResult.invalid.join(', ')}.`,
      code: 'INVALID_EVENT_TYPES',
      availableEvents: WEBHOOK_EVENT_TYPES,
    });
  }

  const secret = generateWebhookSecret();

  const { data, error } = await supabaseAdmin
    .from('webhook_subscriptions')
    .insert({
      tenant_id: ctx.tenantId,
      url: parsed.data.url,
      secret,
      event_types: eventResult.types,
      description: parsed.data.description ?? null,
      created_by: ctx.staff.id,
    })
    .select('id, url, event_types, description, enabled, created_at')
    .single();

  if (error || !data) {
    logger.error('[admin/webhooks] insert error', error, { tenantId: ctx.tenantId });
    return res.status(500).json({ error: 'Failed to create subscription.' });
  }

  await logStaffAction({
    staff_id: ctx.staff.id,
    action: 'other',
    entity_type: 'webhook_subscription',
    entity_id: data.id,
    tenant_id: ctx.tenantId,
    payload: {
      action: 'create_webhook',
      url: data.url,
      event_types: eventResult.types,
    },
  });

  // `secret` (clair) renvoyé UNE SEULE FOIS ici.
  return res.status(201).json({ secret, subscription: data });
}

export default withStaffRoute(handler, 'admin');
