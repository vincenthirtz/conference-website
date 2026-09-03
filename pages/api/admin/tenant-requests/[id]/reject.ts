// pages/api/admin/tenant-requests/[id]/reject.ts
//
// POST /api/admin/tenant-requests/[id]/reject
//
// Owner-only manual rejection of a self-service tenant request. Used when a
// pending request looks suspicious (spam, blocklisted slug, fraudulent email)
// or when the staff wants to actively decline before the email-verify token
// gets clicked.
//
// State transition:
//   pending_email_verification | pending_bot_invite  ->  rejected
//
// Side-effects:
//   - rejection_reason is persisted (1-500 chars).
//   - email_verification_token is wiped so a late click cannot revive the
//     request (defense in depth — the WHERE clause in /api/onboard/verify-email
//     already requires status='pending_email_verification', but we leave a
//     consistent state).
//   - staff_logs row : action='other' + payload { action: 'reject_tenant_request',
//     requestId, reason, requestedSlug }.
//
// We intentionally do NOT send a Brevo "your request was rejected" email in
// V1: the auto-approved flow doesn't promise anything to the user up to the
// point of completion, and notifying every rejection would help spammers
// confirm their guesses. Owner can DM if needed.

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, type AuthenticatedStaffContext } from '@/utils/staff';
import { withAdminIdempotency } from '@/utils/adminIdempotency';
import { applyRateLimit } from '@/utils/rateLimit';
import { isValidUUID } from '@/utils/apiHelpers';
import { logStaffAction } from '@/utils/staffLogs';
import { logger } from '@/utils/logger';

const REASON_MIN = 1;
const REASON_MAX = 500;

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
      'admin-tenant-requests-reject'
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

  const body = (req.body ?? {}) as Record<string, unknown>;
  const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
  if (reason.length < REASON_MIN || reason.length > REASON_MAX) {
    return res.status(400).json({
      error: `reason must be ${REASON_MIN}-${REASON_MAX} chars.`,
      code: 'INVALID_REASON',
    });
  }

  // Lookup first to distinguish 404 (unknown) vs 409 (wrong state).
  const { data: existing, error: lookupErr } = await supabaseAdmin
    .from('tenant_requests')
    .select('id, status, requested_slug')
    .eq('id', id)
    .maybeSingle();
  if (lookupErr) {
    logger.error('[admin/tenant-requests/reject] lookup error', lookupErr);
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
      error: 'Cannot reject a non-pending request.',
      code: 'NOT_PENDING',
      currentStatus: status,
    });
  }

  // Atomic transition. Guard `status IN pending_*` to prevent racing with
  // another reject/expire/verify-email.
  const { data: updated, error: updateErr } = await supabaseAdmin
    .from('tenant_requests')
    .update({
      status: 'rejected',
      rejection_reason: reason,
      email_verification_token: null,
    })
    .eq('id', id)
    .in('status', PENDING_STATUSES as unknown as string[])
    .select('id, status')
    .maybeSingle();
  if (updateErr) {
    logger.error('[admin/tenant-requests/reject] update error', updateErr);
    return res.status(500).json({ error: 'Failed to reject the request.' });
  }
  if (!updated) {
    // Race lost — someone else moved the request out of pending_*.
    return res.status(409).json({
      error: 'Cannot reject a non-pending request.',
      code: 'NOT_PENDING',
    });
  }

  await logStaffAction({
    staff_id: ctx.staff.id,
    action: 'other',
    entity_type: 'tenant_request',
    entity_id: id,
    payload: {
      action: 'reject_tenant_request',
      requestId: id,
      requestedSlug: existing.requested_slug,
      reason,
    },
  });

  return res.status(200).json({ id: updated.id, status: updated.status });
}

export default withStaffRoute(
  withAdminIdempotency(handler, { key: 'admin-tenant-requests-reject' }),
  {
  // Portée PLATEFORME : depuis que `tenant_staff.role` élève le rôle effectif,
  // le propriétaire d'un espace porte `manage_tenant` chez lui. Sans cette
  // portée, il lirait la file d'onboarding de TOUS les espaces.
    permission: 'manage_tenant',
    scope: 'platform',
  }
);
