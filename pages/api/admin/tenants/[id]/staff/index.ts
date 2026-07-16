// pages/api/admin/tenants/[id]/staff/index.ts
//
// S7 :
//  - GET  : liste le staff d'un tenant (avec email + display_name + role).
//          Accessible si manager+ OU staff du tenant.
//  - POST : ajoute (upsert) un staff existant a ce tenant. Manager+ requis.

import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { supabaseAdmin } from '@/utils/supabase';
import {
  withStaffRoute,
  hasAtLeastRole,
  requireOwner,
  STAFF_ROLES,
  type StaffRole,
  type AuthenticatedStaffContext,
} from '@/utils/staff';
import { withAdminIdempotency } from '@/utils/adminIdempotency';
import { applyRateLimit } from '@/utils/rateLimit';
import { isValidUUID } from '@/utils/apiHelpers';
import { canAccessTenant } from '@/utils/adminTenants';
import { logger } from '@/utils/logger';
import { logStaffAction } from '@/utils/staffLogs';

// Nomenclature stricte : le garde « dernier admin » de
// tenants/[id]/staff/[staffId].ts compte les rows `role === 'admin'` — un
// role libre hors nomenclature permettrait de le contourner.
const staffRoleSchema = z.enum(STAFF_ROLES as [StaffRole, ...StaffRole[]]);

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
      'admin-tenants-staff'
    )
  ) {
    return;
  }
  res.setHeader('Cache-Control', 'no-store');

  const { id } = req.query;
  if (!id || typeof id !== 'string' || !isValidUUID(id)) {
    return res.status(400).json({ error: 'Invalid tenant id.' });
  }

  if (req.method === 'GET') {
    if (!hasAtLeastRole(ctx.role, 'admin')) {
      const isPoleAdmin =
        (ctx.staff as { is_pole_admin?: boolean }).is_pole_admin === true;
      const allowed = await canAccessTenant(ctx.staff.id, id, { isPoleAdmin });
      if (!allowed) {
        return res.status(403).json({ error: 'No access to this tenant.' });
      }
    }

    const { data, error } = await supabaseAdmin
      .from('tenant_staff')
      .select('staff_id, role, created_at')
      .eq('tenant_id', id);

    if (error) {
      logger.error('[admin/tenants/[id]/staff] list error', error);
      return res.status(500).json({ error: 'Failed to load staff.' });
    }

    type Row = { staff_id: string; role: string; created_at: string };
    const rows = (data as Row[] | null) ?? [];
    const staffIds = rows.map((r) => r.staff_id);

    let byId = new Map<
      string,
      { id: string; email: string; display_name: string | null }
    >();
    if (staffIds.length > 0) {
      const { data: globals } = await supabaseAdmin
        .from('staff')
        .select('id, email, display_name')
        .in('id', staffIds);
      type GRow = { id: string; email: string; display_name: string | null };
      byId = new Map(((globals as GRow[] | null) ?? []).map((g) => [g.id, g]));
    }

    const staff = rows.map((r) => {
      const s = byId.get(r.staff_id);
      return {
        staff_id: r.staff_id,
        role: r.role,
        created_at: r.created_at,
        email: s?.email ?? null,
        display_name: s?.display_name ?? null,
      };
    });

    return res.status(200).json({ staff });
  }

  if (req.method === 'POST') {
    // Owner-only : assigner un staff a un tenant.
    if (!requireOwner(ctx, res)) return;

    const body = (req.body ?? {}) as Record<string, unknown>;
    const staffId =
      typeof body.staff_id === 'string' ? body.staff_id.trim() : '';
    const roleParsed = staffRoleSchema.safeParse(
      typeof body.role === 'string' && body.role.trim()
        ? body.role.trim()
        : 'admin'
    );
    if (!roleParsed.success) {
      return res.status(400).json({
        error: `Invalid role. Allowed values: ${STAFF_ROLES.join(', ')}.`,
        code: 'INVALID_ROLE',
      });
    }
    const role = roleParsed.data;

    if (!isValidUUID(staffId)) {
      return res
        .status(400)
        .json({ error: 'staff_id must be a UUID.', code: 'INVALID_STAFF_ID' });
    }

    // Verifier que le staff existe globalement.
    const { data: globalStaff, error: gErr } = await supabaseAdmin
      .from('staff')
      .select('id')
      .eq('id', staffId)
      .maybeSingle();
    if (gErr || !globalStaff) {
      return res
        .status(404)
        .json({ error: 'Staff not found.', code: 'STAFF_NOT_FOUND' });
    }

    const { error } = await supabaseAdmin
      .from('tenant_staff')
      .upsert(
        { tenant_id: id, staff_id: staffId, role },
        { onConflict: 'tenant_id,staff_id' }
      );

    if (error) {
      logger.error('[admin/tenants/[id]/staff] upsert error', error);
      return res.status(500).json({ error: 'Failed to add staff.' });
    }

    if (ctx?.staff?.id) {
      try {
        await logStaffAction({
          staff_id: ctx.staff.id,
          action: 'grant_tenant_staff',
          entity_type: 'tenant',
          entity_id: id,
          tenant_id: ctx.tenantId,
          payload: { staffId, role },
        });
      } catch (logErr) {
        logger.error('logStaffAction(grant_tenant_staff) error:', logErr);
      }
    }

    return res.status(200).json({
      staff: { staff_id: staffId, role, tenant_id: id },
    });
  }

  res.setHeader('Allow', 'GET,POST');
  return res.status(405).json({ error: 'Method not allowed' });
}

export default withStaffRoute(
  withAdminIdempotency(handler, { key: 'admin-tenants-staff-add' }),
  'caster'
);
