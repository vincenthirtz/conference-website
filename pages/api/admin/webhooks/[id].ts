// pages/api/admin/webhooks/[id].ts
//
// PATCH  — enable/disable a webhook subscription of the active tenant. Re-enabling
//          resets the consecutive-failure counter (clears an auto-disable).
// DELETE — remove a subscription (CASCADE drops its deliveries).
//
// Auth : admin+ on the active tenant. Always scoped by `tenant_id = ctx.tenantId`
// so an admin can only touch their own tenant's subscriptions.

import { z } from 'zod';
import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, type AuthenticatedStaffContext } from '@/utils/staff';
import { applyRateLimit } from '@/utils/rateLimit';
import { logStaffAction } from '@/utils/staffLogs';
import { logger } from '@/utils/logger';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const patchSchema = z.object({ enabled: z.boolean() });

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  if (
    applyRateLimit(req, res, { max: 20, windowMs: 60_000 }, 'admin-webhooks-id')
  ) {
    return;
  }
  res.setHeader('Cache-Control', 'no-store');

  const rawId = req.query.id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;
  if (!id || !UUID_RE.test(id)) {
    return res.status(400).json({ error: 'Invalid id.', code: 'INVALID_ID' });
  }

  if (req.method === 'PATCH') return handlePatch(req, res, ctx, id);
  if (req.method === 'DELETE') return handleDelete(res, ctx, id);

  res.setHeader('Allow', 'PATCH, DELETE');
  return res.status(405).json({ error: 'Method not allowed.' });
}

async function handlePatch(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext,
  id: string
) {
  const parsed = patchSchema.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: 'Invalid body.', code: 'INVALID_BODY' });
  }
  const nowIso = new Date().toISOString();
  const patch = parsed.data.enabled
    ? {
        enabled: true,
        consecutive_failures: 0,
        disabled_at: null,
        last_error: null,
      }
    : { enabled: false, disabled_at: nowIso };

  const { data, error } = await supabaseAdmin
    .from('webhook_subscriptions')
    .update(patch)
    .eq('id', id)
    .eq('tenant_id', ctx.tenantId)
    .select('id, enabled')
    .maybeSingle();

  if (error) {
    logger.error('[admin/webhooks] patch error', error, {
      tenantId: ctx.tenantId,
    });
    return res.status(500).json({ error: 'Server error.' });
  }
  if (!data) {
    return res.status(404).json({ error: 'Not found.', code: 'NOT_FOUND' });
  }

  await logStaffAction({
    staff_id: ctx.staff.id,
    action: 'other',
    entity_type: 'webhook_subscription',
    entity_id: id,
    tenant_id: ctx.tenantId,
    payload: {
      action: parsed.data.enabled ? 'enable_webhook' : 'disable_webhook',
    },
  });

  return res.status(200).json({ subscription: data });
}

async function handleDelete(
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext,
  id: string
) {
  const { data, error } = await supabaseAdmin
    .from('webhook_subscriptions')
    .delete()
    .eq('id', id)
    .eq('tenant_id', ctx.tenantId)
    .select('id')
    .maybeSingle();

  if (error) {
    logger.error('[admin/webhooks] delete error', error, {
      tenantId: ctx.tenantId,
    });
    return res.status(500).json({ error: 'Server error.' });
  }
  if (!data) {
    return res.status(404).json({ error: 'Not found.', code: 'NOT_FOUND' });
  }

  await logStaffAction({
    staff_id: ctx.staff.id,
    action: 'other',
    entity_type: 'webhook_subscription',
    entity_id: id,
    tenant_id: ctx.tenantId,
    payload: { action: 'delete_webhook' },
  });

  return res.status(200).json({ ok: true });
}

export default withStaffRoute(handler, 'admin');
