// pages/api/admin/tenants/accessible.ts
//
// S7 : liste des tenants accessibles au staff courant.
//
// Utilise par le dropdown "switcher tenant" dans la UI admin.
//   - staff "normal" (is_pole_admin=false) : tenants ou il a une row dans
//     `tenant_staff` (role expose = `tenant_staff.role`).
//   - staff `is_pole_admin = true` : tous les tenants actifs (role expose
//     = 'pole_admin', purement informationnel).

import type { NextApiRequest, NextApiResponse } from 'next';
import { withStaffRoute, type AuthenticatedStaffContext } from '@/utils/staff';
import { applyRateLimit } from '@/utils/rateLimit';
import { listAccessibleTenants } from '@/utils/adminTenants';

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
      'admin-tenants-accessible'
    )
  ) {
    return;
  }
  res.setHeader('Cache-Control', 'no-store');

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const isPoleAdmin =
    (ctx.staff as { is_pole_admin?: boolean }).is_pole_admin === true;

  const tenants = await listAccessibleTenants(ctx.staff.id, { isPoleAdmin });

  return res.status(200).json({ tenants });
}

export default withStaffRoute(handler, 'caster');
