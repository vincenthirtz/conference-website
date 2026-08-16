// pages/api/admin/active-tenant.ts
//
// S7 : tenant switcher pour la UI admin.
//
// - GET  : retourne le tenant actif courant (resolu via cookie + fallback).
// - POST : switch le tenant actif (set cookie `staff_active_tenant_id`),
//          en verifiant que le staff a une row dans `tenant_staff` pour
//          ce tenant. Sinon 403 `NO_ACCESS_TO_TENANT`.

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, type AuthenticatedStaffContext } from '@/utils/staff';
import { applyRateLimit } from '@/utils/rateLimit';
import {
  buildActiveTenantSetCookie,
  canAccessTenant,
  isValidTenantUuid,
} from '@/utils/adminTenants';
import { logger } from '@/utils/logger';

async function fetchTenant(tenantId: string) {
  const { data, error } = await supabaseAdmin
    .from('tenants')
    .select('id, slug, name, is_active, default_locale')
    .eq('id', tenantId)
    .maybeSingle();
  if (error) {
    logger.error('[admin/active-tenant] fetch error', error);
    return null;
  }
  return data;
}

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
      'admin-active-tenant'
    )
  ) {
    return;
  }
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'GET') {
    const tenant = await fetchTenant(ctx.tenantId);
    if (!tenant) {
      return res.status(404).json({ error: 'Active tenant not found.' });
    }
    return res.status(200).json({ tenant, source: ctx.currentTenantSource });
  }

  if (req.method === 'POST') {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const target =
      typeof body.tenant_id === 'string' ? body.tenant_id.trim() : '';

    if (!isValidTenantUuid(target)) {
      return res.status(400).json({
        error: 'tenant_id must be a valid UUID.',
        code: 'INVALID_TENANT_ID',
      });
    }

    const allowed = await canAccessTenant(ctx.staff.id, target);
    if (!allowed) {
      return res.status(403).json({
        error: 'No access to this tenant.',
        code: 'NO_ACCESS_TO_TENANT',
      });
    }

    const tenant = await fetchTenant(target);
    if (!tenant) {
      return res
        .status(404)
        .json({ error: 'Tenant not found.', code: 'TENANT_NOT_FOUND' });
    }

    res.setHeader('Set-Cookie', buildActiveTenantSetCookie(target));
    return res.status(200).json({ tenant });
  }

  res.setHeader('Allow', 'GET,POST');
  return res.status(405).json({ error: 'Method not allowed' });
}

// `caster` est le role minimum autorise : tout staff doit pouvoir
// connaitre / switcher son tenant actif (les checks de permission par
// tenant sont faits dans les routes dediees).
export default withStaffRoute(handler, 'caster');
