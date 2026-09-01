// pages/api/admin/staff/[staffId]/pole-admin.ts
//
// Owner-only endpoint to toggle the `staff.is_pole_admin` flag.
//
// Methods :
//   - POST   → set is_pole_admin = true on the target staff.
//   - DELETE → set is_pole_admin = false on the target staff.
//
// Garde-fou : interdit de retirer le flag pole_admin du dernier owner ayant
// `is_pole_admin = true` afin d'eviter un lockout cross-tenant accidentel.
// Concretement, on bloque le DELETE si la cible est un staff `role = 'owner'`
// avec `is_pole_admin = true` et qu'il est le seul (active) owner pole admin
// restant.
//
// Audit : entry staff_logs avec action='other' + payload
//   { action: 'toggle_pole_admin', value: true|false, targetStaffId }.

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import {
  withStaffRoute,
  invalidateStaffCache,
  type AuthenticatedStaffContext,
} from '@/utils/staff';
import { applyRateLimit } from '@/utils/rateLimit';
import { isValidUUID } from '@/utils/apiHelpers';
import { logStaffAction } from '@/utils/staffLogs';
import { logger } from '@/utils/logger';

type StaffRow = {
  id: string;
  auth_user_id: string;
  role: string;
  is_pole_admin: boolean | null;
  is_active?: boolean | null;
  deleted_at?: string | null;
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  if (
    applyRateLimit(
      req,
      res,
      { max: 30, windowMs: 60_000 },
      'admin-staff-pole-admin'
    )
  ) {
    return;
  }
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'POST' && req.method !== 'DELETE') {
    res.setHeader('Allow', 'POST,DELETE');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  const { staffId } = req.query;
  if (!staffId || typeof staffId !== 'string' || !isValidUUID(staffId)) {
    return res
      .status(400)
      .json({ error: 'Invalid staff id.', code: 'INVALID_STAFF_ID' });
  }

  // Charge la cible.
  const { data: target, error: targetErr } = await supabaseAdmin
    .from('staff')
    .select('id, auth_user_id, role, is_pole_admin, is_active, deleted_at')
    .eq('id', staffId)
    .maybeSingle();
  if (targetErr) {
    logger.error('[admin/staff/pole-admin] target lookup error', targetErr);
    return res.status(500).json({ error: 'Server error.' });
  }
  if (!target) {
    return res
      .status(404)
      .json({ error: 'Staff not found.', code: 'STAFF_NOT_FOUND' });
  }
  const targetRow = target as StaffRow;

  const desired = req.method === 'POST';

  // No-op si deja dans l'etat demande — on repond 200 sans rejouer le log.
  if (Boolean(targetRow.is_pole_admin) === desired) {
    return res.status(200).json({
      staff_id: targetRow.id,
      is_pole_admin: desired,
      changed: false,
    });
  }

  // Garde-fou last-owner : si on DELETE et que la cible est un owner actif
  // pole_admin, on verifie qu'il reste au moins un autre owner actif avec
  // is_pole_admin = true.
  if (!desired && targetRow.role === 'owner' && targetRow.is_pole_admin) {
    const { data: otherOwners, error: ownersErr } = await supabaseAdmin
      .from('staff')
      .select('id, role, is_pole_admin, is_active, deleted_at')
      .eq('role', 'owner')
      .eq('is_pole_admin', true);
    if (ownersErr) {
      logger.error('[admin/staff/pole-admin] owners lookup error', ownersErr);
      return res.status(500).json({ error: 'Server error.' });
    }
    const activeOtherPoleOwners = (
      (otherOwners as StaffRow[] | null) ?? []
    ).filter(
      (s) =>
        s.id !== targetRow.id &&
        s.is_active !== false &&
        !s.deleted_at &&
        s.is_pole_admin === true &&
        s.role === 'owner'
    );
    if (activeOtherPoleOwners.length === 0) {
      return res.status(409).json({
        error:
          'Cannot remove pole_admin from the last active owner — at least one active owner must remain pole_admin to avoid a cross-tenant lockout.',
        code: 'LAST_POLE_OWNER',
      });
    }
  }

  // Update.
  const { error: updateErr } = await supabaseAdmin
    .from('staff')
    .update({ is_pole_admin: desired })
    .eq('id', targetRow.id);
  if (updateErr) {
    logger.error('[admin/staff/pole-admin] update error', updateErr, {
      staffId: targetRow.id,
    });
    return res.status(500).json({ error: 'Failed to update pole_admin flag.' });
  }

  // Invalide le cache staff de la cible (le flag est lu via
  // getStaffByUserId au prochain hit).
  invalidateStaffCache(targetRow.auth_user_id);

  // Audit.
  await logStaffAction({
    staff_id: ctx.staff.id,
    action: 'other',
    entity_type: 'staff',
    entity_id: targetRow.id,
    tenant_id: ctx.tenantId,
    payload: {
      action: 'toggle_pole_admin',
      value: desired,
      targetStaffId: targetRow.id,
    },
  });

  return res.status(200).json({
    staff_id: targetRow.id,
    is_pole_admin: desired,
    changed: true,
  });
}

export default withStaffRoute(handler, { permission: 'manage_tenant' });
