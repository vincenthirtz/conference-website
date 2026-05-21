// pages/api/admin/tenants/accessible.ts
//
// S7 : liste des tenants accessibles au staff courant.
//
// Utilise par le dropdown "switcher tenant" dans la UI admin. Retourne
// uniquement les tenants ou le staff a une row dans `tenant_staff`.
// Le role exposse est celui stocke dans `tenant_staff.role` (text libre,
// purement informationnel en V1).

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, type AuthenticatedStaffContext } from '@/utils/staff';
import { applyRateLimit } from '@/utils/rateLimit';
import { logger } from '@/utils/logger';

type AccessibleTenant = {
  id: string;
  slug: string;
  name: string;
  is_active: boolean;
  role: string;
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

  // 2 requetes (mock-friendly, pas d'embed) : (a) lister tenant_id+role,
  // (b) lire les tenants pour le slug/name/is_active.
  const { data: rows, error } = await supabaseAdmin
    .from('tenant_staff')
    .select('tenant_id, role')
    .eq('staff_id', ctx.staff.id);

  if (error) {
    logger.error('[admin/tenants/accessible] error', error);
    return res
      .status(500)
      .json({ error: 'Failed to load accessible tenants.' });
  }

  type StaffRow = { tenant_id: string; role: string };
  const staffRows = (rows as StaffRow[] | null) ?? [];
  const ids = staffRows.map((r) => r.tenant_id).filter(Boolean);

  let tenantsById = new Map<
    string,
    { id: string; slug: string; name: string; is_active: boolean }
  >();
  if (ids.length > 0) {
    const { data: t, error: tErr } = await supabaseAdmin
      .from('tenants')
      .select('id, slug, name, is_active')
      .in('id', ids);
    if (tErr) {
      logger.error('[admin/tenants/accessible] tenants lookup error', tErr);
      return res.status(500).json({ error: 'Failed to load tenants.' });
    }
    type TRow = { id: string; slug: string; name: string; is_active: boolean };
    tenantsById = new Map(
      ((t as TRow[] | null) ?? []).map((row) => [row.id, row])
    );
  }

  const tenants: AccessibleTenant[] = staffRows
    .map((r) => {
      const t = tenantsById.get(r.tenant_id);
      if (!t) return null;
      return {
        id: t.id,
        slug: t.slug,
        name: t.name,
        is_active: t.is_active,
        role: r.role,
      } satisfies AccessibleTenant;
    })
    .filter((t): t is AccessibleTenant => t !== null)
    .sort((a, b) => a.slug.localeCompare(b.slug));

  return res.status(200).json({ tenants });
}

export default withStaffRoute(handler, 'caster');
