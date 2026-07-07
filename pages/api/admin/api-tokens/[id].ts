// pages/api/admin/api-tokens/[id].ts
//
// DELETE — revoke a public API token (soft : sets `revoked_at`). A revoked
//          token is rejected 401 by the public write middleware but the row is
//          kept for audit (`last_used_at`, creation metadata).
//
// Auth : admin+ on the active tenant. The token must belong to `ctx.tenantId`
// (an admin cannot revoke another tenant's token). Already-revoked tokens →
// idempotent 200.
//
// Rate-limited at 10/min per IP. Audit : staff_logs action='other'.

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import {
  withStaffRoute,
  type AuthenticatedStaffContext,
} from '@/utils/staff';
import { applyRateLimit } from '@/utils/rateLimit';
import { isValidUUID } from '@/utils/apiHelpers';
import { logStaffAction } from '@/utils/staffLogs';
import { logger } from '@/utils/logger';

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  if (
    applyRateLimit(req, res, { max: 10, windowMs: 60_000 }, 'admin-api-tokens')
  ) {
    return;
  }
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'DELETE') {
    res.setHeader('Allow', 'DELETE');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const { id } = req.query;
  if (!id || typeof id !== 'string' || !isValidUUID(id)) {
    return res
      .status(400)
      .json({ error: 'Invalid token id.', code: 'INVALID_TOKEN_ID' });
  }

  // Scope au tenant courant : on ne peut révoquer que ses propres tokens.
  const { data: row, error: lookupErr } = await supabaseAdmin
    .from('tenant_api_tokens')
    .select('id, name, token_prefix, revoked_at')
    .eq('id', id)
    .eq('tenant_id', ctx.tenantId)
    .maybeSingle();

  if (lookupErr) {
    logger.error('[admin/api-tokens] revoke lookup error', lookupErr, {
      tenantId: ctx.tenantId,
    });
    return res.status(500).json({ error: 'Server error.' });
  }
  if (!row) {
    return res
      .status(404)
      .json({ error: 'Token not found.', code: 'UNKNOWN_TOKEN' });
  }

  // Déjà révoqué → idempotent.
  if (row.revoked_at) {
    return res.status(200).json({ id: row.id, revokedAt: row.revoked_at });
  }

  const revokedAt = new Date().toISOString();
  const { error: updateErr } = await supabaseAdmin
    .from('tenant_api_tokens')
    .update({ revoked_at: revokedAt })
    .eq('id', id)
    .eq('tenant_id', ctx.tenantId);

  if (updateErr) {
    logger.error('[admin/api-tokens] revoke update error', updateErr, {
      tenantId: ctx.tenantId,
    });
    return res.status(500).json({ error: 'Failed to revoke token.' });
  }

  await logStaffAction({
    staff_id: ctx.staff.id,
    action: 'other',
    entity_type: 'api_token',
    entity_id: id,
    tenant_id: ctx.tenantId,
    payload: {
      action: 'revoke_api_token',
      name: row.name,
      prefix: row.token_prefix,
    },
  });

  return res.status(200).json({ id, revokedAt });
}

export default withStaffRoute(handler, 'admin');
