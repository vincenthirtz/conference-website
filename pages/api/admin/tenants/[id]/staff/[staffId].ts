// pages/api/admin/tenants/[id]/staff/[staffId].ts
//
// S7 : DELETE retire un staff d'un tenant.
//
// Protection : interdit de retirer le dernier "admin" du tenant (count
// global, V1 ne distingue pas les sous-roles). En pratique : un tenant
// sans staff ne peut plus etre administre — on bloque ce cas.

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import {
  withStaffRoute,
  hasAtLeastRole,
  type AuthenticatedStaffContext,
} from '@/utils/staff';
import { withAdminIdempotency } from '@/utils/adminIdempotency';
import { applyRateLimit } from '@/utils/rateLimit';
import { isValidUUID } from '@/utils/apiHelpers';
import { logger } from '@/utils/logger';
import { logStaffAction } from '@/utils/staffLogs';

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  if (
    applyRateLimit(
      req,
      res,
      { max: 60, windowMs: 60_000 },
      'admin-tenants-staff-id'
    )
  ) {
    return;
  }
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'DELETE') {
    res.setHeader('Allow', 'DELETE');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Owner-only : retirer un staff d'un tenant.
  if (!hasAtLeastRole(ctx.role, 'owner')) {
    return res.status(403).json({ error: 'Forbidden.' });
  }

  const { id, staffId } = req.query;
  if (!id || typeof id !== 'string' || !isValidUUID(id)) {
    return res.status(400).json({ error: 'Invalid tenant id.' });
  }
  if (!staffId || typeof staffId !== 'string' || !isValidUUID(staffId)) {
    return res.status(400).json({ error: 'Invalid staff id.' });
  }

  // Verifier la cible et compter les admins restants.
  const { data: rows, error: listErr } = await supabaseAdmin
    .from('tenant_staff')
    .select('staff_id, role')
    .eq('tenant_id', id);

  if (listErr) {
    logger.error('[admin/tenants/[id]/staff/[staffId]] list error', listErr);
    return res.status(500).json({ error: 'Failed to load staff.' });
  }

  const all = (rows ?? []) as Array<{ staff_id: string; role: string }>;
  const target = all.find((r) => r.staff_id === staffId);
  if (!target) {
    return res.status(404).json({ error: 'Staff not in tenant.' });
  }

  // Protection : si on retire le dernier admin → bloque. V1 simplifie :
  // "admin" couvre tout role >= admin selon nos conventions internes.
  const adminCount = all.filter((r) => r.role === 'admin').length;
  if (target.role === 'admin' && adminCount <= 1) {
    return res.status(409).json({
      error: 'Cannot remove the last admin of this tenant.',
      code: 'LAST_ADMIN',
    });
  }

  const { error } = await supabaseAdmin
    .from('tenant_staff')
    .delete()
    .eq('tenant_id', id)
    .eq('staff_id', staffId);

  if (error) {
    logger.error('[admin/tenants/[id]/staff/[staffId]] delete error', error);
    return res.status(500).json({ error: 'Failed to remove staff.' });
  }

  if (ctx?.staff?.id) {
    try {
      await logStaffAction({
        staff_id: ctx.staff.id,
        action: 'revoke_tenant_staff',
        entity_type: 'tenant',
        entity_id: id,
        tenant_id: ctx.tenantId,
        payload: { staffId, role: target.role },
      });
    } catch (logErr) {
      logger.error('logStaffAction(revoke_tenant_staff) error:', logErr);
    }
  }

  return res
    .status(200)
    .json({ deleted: true, staff_id: staffId, tenant_id: id });
}

export default withStaffRoute(
  withAdminIdempotency(handler, { key: 'admin-tenants-staff-delete' }),
  { permission: 'manage_tenant' }
);
