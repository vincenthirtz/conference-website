// pages/api/admin/tenant-requests/[id]/expire.ts
//
// POST /api/admin/tenant-requests/[id]/expire
//
// Owner-only manual expiration of a self-service tenant request. Used to
// clean up requests that have been sitting in pending_email_verification
// or pending_bot_invite for too long (no automated job sweeps them yet).
//
// State transition:
//   pending_email_verification | pending_bot_invite  ->  expired
//
// No reason required (the semantics are "this request is stale", not "this
// request is bad"). The slug is freed up by the partial UNIQUE index on
// `lower(requested_slug) WHERE status IN ('pending_*')`, so the user can
// submit again with the same slug if they want.

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, type AuthenticatedStaffContext } from '@/utils/staff';
import { withAdminIdempotency } from '@/utils/adminIdempotency';
import { applyRateLimit } from '@/utils/rateLimit';
import { isValidUUID } from '@/utils/apiHelpers';
import { logStaffAction } from '@/utils/staffLogs';
import { logger } from '@/utils/logger';

const PENDING_STATUSES = [
  'pending_email_verification',
  'pending_bot_invite',
] as const;

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  if (
    applyRateLimit(
      req,
      res,
      { max: 20, windowMs: 60_000 },
      'admin-tenant-requests-expire'
    )
  ) {
    return;
  }
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const { id } = req.query;
  if (!id || typeof id !== 'string' || !isValidUUID(id)) {
    return res
      .status(400)
      .json({ error: 'Invalid request id.', code: 'INVALID_REQUEST_ID' });
  }

  const { data: existing, error: lookupErr } = await supabaseAdmin
    .from('tenant_requests')
    .select('id, status, requested_slug')
    .eq('id', id)
    .maybeSingle();
  if (lookupErr) {
    logger.error('[admin/tenant-requests/expire] lookup error', lookupErr);
    return res.status(500).json({ error: 'Server error.' });
  }
  if (!existing) {
    return res
      .status(404)
      .json({ error: 'Request not found.', code: 'REQUEST_NOT_FOUND' });
  }
  const status = existing.status as string;
  if (!(PENDING_STATUSES as readonly string[]).includes(status)) {
    return res.status(409).json({
      error: 'Cannot expire a non-pending request.',
      code: 'NOT_PENDING',
      currentStatus: status,
    });
  }

  const { data: updated, error: updateErr } = await supabaseAdmin
    .from('tenant_requests')
    .update({
      status: 'expired',
      email_verification_token: null,
    })
    .eq('id', id)
    .in('status', PENDING_STATUSES as unknown as string[])
    .select('id, status')
    .maybeSingle();
  if (updateErr) {
    logger.error('[admin/tenant-requests/expire] update error', updateErr);
    return res.status(500).json({ error: 'Failed to expire the request.' });
  }
  if (!updated) {
    return res.status(409).json({
      error: 'Cannot expire a non-pending request.',
      code: 'NOT_PENDING',
    });
  }

  await logStaffAction({
    staff_id: ctx.staff.id,
    action: 'other',
    entity_type: 'tenant_request',
    entity_id: id,
    payload: {
      action: 'expire_tenant_request',
      requestId: id,
      requestedSlug: existing.requested_slug,
    },
  });

  return res.status(200).json({ id: updated.id, status: updated.status });
}

export default withStaffRoute(
  withAdminIdempotency(handler, { key: 'admin-tenant-requests-expire' }),
  'owner'
);
