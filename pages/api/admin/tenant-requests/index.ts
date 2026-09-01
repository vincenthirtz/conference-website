// pages/api/admin/tenant-requests/index.ts
//
// GET /api/admin/tenant-requests
//
// Owner-only listing of self-service tenant requests. The self-service flow
// (cf. `tenant_requests` state machine + /api/onboard/*) is auto-approved by
// design (Turnstile + rate-limit + email-verify gate). The staff still need a
// queue view to:
//   - monitor activity (pending_*),
//   - audit completed requests (link to the created tenant),
//   - manually intervene (reject / expire) when a request looks suspicious
//     or has been sitting too long.
//
// Query params:
//   - status: pending_email_verification | pending_bot_invite | completed
//             | rejected | expired | all  (default: all)
//   - limit:  1..100 (default 20)
//   - offset: >= 0 (default 0)
//
// Response shape : see `TenantRequestRow` type below. `total` reflects the
// full match count for the current `status` filter (used for pagination UI).
//
// Auth: owner-only via withStaffRoute. The full visibility on every tenant
// request is a high-trust operation — only the owner is allowed.

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, type AuthenticatedStaffContext } from '@/utils/staff';
import { applyRateLimit } from '@/utils/rateLimit';
import { logger } from '@/utils/logger';

const ALLOWED_STATUSES = [
  'pending_email_verification',
  'pending_bot_invite',
  'completed',
  'rejected',
  'expired',
] as const;

type TenantRequestStatus = (typeof ALLOWED_STATUSES)[number];

export type TenantRequestRow = {
  id: string;
  status: TenantRequestStatus;
  requestedSlug: string;
  requestedName: string;
  requesterEmail: string;
  requesterDiscordUserId: string;
  requesterDiscordDisplayName: string | null;
  createdAt: string;
  createdTenantId: string | null;
  createdGuildId: string | null;
  rejectionReason: string | null;
};

type DbRow = {
  id: string;
  status: TenantRequestStatus;
  requested_slug: string;
  requested_name: string;
  requester_email: string;
  requester_discord_user_id: string;
  requester_discord_display_name: string | null;
  created_at: string;
  created_tenant_id: string | null;
  created_guild_id: string | null;
  rejection_reason: string | null;
};

const SELECT_COLS =
  'id, status, requested_slug, requested_name, requester_email, requester_discord_user_id, requester_discord_display_name, created_at, created_tenant_id, created_guild_id, rejection_reason';

function parseStatus(raw: unknown): TenantRequestStatus | 'all' {
  if (typeof raw !== 'string' || raw === '' || raw === 'all') return 'all';
  return (ALLOWED_STATUSES as readonly string[]).includes(raw)
    ? (raw as TenantRequestStatus)
    : 'all';
}

function parseInt0(raw: unknown, fallback: number): number {
  if (typeof raw !== 'string') return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  _ctx: AuthenticatedStaffContext
) {
  if (
    applyRateLimit(
      req,
      res,
      { max: 60, windowMs: 60_000 },
      'admin-tenant-requests-list'
    )
  ) {
    return;
  }
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const status = parseStatus(req.query.status);
  const limitRaw = parseInt0(req.query.limit, 20);
  const limit = Math.min(Math.max(limitRaw, 1), 100);
  const offset = parseInt0(req.query.offset, 0);

  // 1) Total count (filtered by status) — separate cheap COUNT(*) so the
  //    pagination UI knows the size of the haystack without fetching all rows.
  let countQuery = supabaseAdmin
    .from('tenant_requests')
    .select('id', { count: 'exact' });
  if (status !== 'all') {
    countQuery = countQuery.eq('status', status);
  }
  const { count: totalCount, error: countErr } = await countQuery;
  if (countErr) {
    logger.error('[admin/tenant-requests] count error', countErr);
    return res.status(500).json({ error: 'Failed to load requests.' });
  }

  // 2) Page of rows.
  let listQuery = supabaseAdmin
    .from('tenant_requests')
    .select(SELECT_COLS)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);
  if (status !== 'all') {
    listQuery = listQuery.eq('status', status);
  }
  const { data: rows, error: listErr } = await listQuery;
  if (listErr) {
    logger.error('[admin/tenant-requests] list error', listErr);
    return res.status(500).json({ error: 'Failed to load requests.' });
  }

  const requests: TenantRequestRow[] = ((rows ?? []) as unknown as DbRow[]).map(
    (r) => ({
      id: r.id,
      status: r.status,
      requestedSlug: r.requested_slug,
      requestedName: r.requested_name,
      requesterEmail: r.requester_email,
      requesterDiscordUserId: r.requester_discord_user_id,
      requesterDiscordDisplayName: r.requester_discord_display_name,
      createdAt: r.created_at,
      createdTenantId: r.created_tenant_id,
      createdGuildId: r.created_guild_id,
      rejectionReason: r.rejection_reason,
    })
  );

  return res.status(200).json({
    requests,
    total: totalCount ?? requests.length,
    limit,
    offset,
  });
}

export default withStaffRoute(handler, { permission: 'manage_tenant' });
