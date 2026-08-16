// pages/api/admin/webhooks/[id]/deliveries.ts
//
// GET — recent delivery attempts for a webhook subscription (visibility /
// debugging). Scoped to the active tenant: the subscription must belong to
// `ctx.tenantId` (checked before reading its deliveries).
//
// Auth : admin+ on the active tenant.

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, type AuthenticatedStaffContext } from '@/utils/staff';
import { applyRateLimit } from '@/utils/rateLimit';
import { logger } from '@/utils/logger';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MAX_ROWS = 50;

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed.' });
  }
  if (
    applyRateLimit(
      req,
      res,
      { max: 30, windowMs: 60_000 },
      'admin-webhook-deliveries'
    )
  ) {
    return;
  }
  res.setHeader('Cache-Control', 'no-store');

  const rawId = req.query.id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;
  if (!id || !UUID_RE.test(id)) {
    return res.status(400).json({ error: 'Invalid id.', code: 'INVALID_ID' });
  }

  // Ownership : la subscription doit appartenir au tenant courant.
  const { data: sub, error: subErr } = await supabaseAdmin
    .from('webhook_subscriptions')
    .select('id')
    .eq('id', id)
    .eq('tenant_id', ctx.tenantId)
    .maybeSingle();
  if (subErr) {
    logger.error('[admin/webhooks/deliveries] sub lookup error', subErr);
    return res.status(500).json({ error: 'Server error.' });
  }
  if (!sub) {
    return res.status(404).json({ error: 'Not found.', code: 'NOT_FOUND' });
  }

  const { data, error } = await supabaseAdmin
    .from('webhook_deliveries')
    .select(
      'id, event_name, status, attempts, response_status, last_error, delivered_at, created_at'
    )
    .eq('subscription_id', id)
    .order('created_at', { ascending: false })
    .limit(MAX_ROWS);

  if (error) {
    logger.error('[admin/webhooks/deliveries] list error', error);
    return res.status(500).json({ error: 'Server error.' });
  }

  return res.status(200).json({ deliveries: data ?? [] });
}

export default withStaffRoute(handler, 'admin');
