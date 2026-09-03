// pages/api/admin/tenants/[id]/domain.ts
//
// GET  : l'état du domaine propre, et les deux enregistrements DNS à créer.
// POST : lance la vérification maintenant.
//
// Le domaine lui-même se pose par `PATCH /api/admin/tenants/[id]` (champ
// `custom_domain`), qui le met en `pending` et génère le jeton. Ici on ne fait
// que constater : interroger le DNS, et écrire le verdict.
//
// La preuve est un TXT — seul le titulaire de la zone peut le poser. Le CNAME
// ne prouve rien (n'importe qui peut pointer un nom vers nous) mais sans lui
// rien n'arrive : il est donc rapporté en avertissement, jamais en refus.
//
// Portée : admin+ globalement, ou staff rattaché à cet espace — comme la fiche.

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import {
  withStaffRoute,
  hasAtLeastRole,
  type AuthenticatedStaffContext,
} from '@/utils/staff';
import { applyRateLimit } from '@/utils/rateLimit';
import { isValidUUID } from '@/utils/apiHelpers';
import { canAccessTenant } from '@/utils/adminTenants';
import { logStaffAction } from '@/utils/staffLogs';
import { logger } from '@/utils/logger';
import { invalidateTenantHostCache } from '@/utils/tenant';
import {
  checkDomain,
  dnsInstructions,
} from '@/utils/tenants/domainVerification';

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  if (
    applyRateLimit(req, res, { max: 20, windowMs: 60_000 }, 'admin-tenant-domain')
  ) {
    return;
  }
  res.setHeader('Cache-Control', 'no-store');

  switch (req.method) {
    case 'GET':
    case 'POST':
      break;
    default:
      res.setHeader('Allow', 'GET, POST');
      return res.status(405).json({ error: 'Method not allowed' });
  }

  const { id } = req.query;
  if (!id || typeof id !== 'string' || !isValidUUID(id)) {
    return res
      .status(400)
      .json({ error: 'Invalid tenant id.', code: 'INVALID_TENANT_ID' });
  }

  if (!hasAtLeastRole(ctx.role, 'admin')) {
    const isPoleAdmin =
      (ctx.staff as { is_pole_admin?: boolean }).is_pole_admin === true;
    if (!(await canAccessTenant(ctx.staff.id, id, { isPoleAdmin }))) {
      return res.status(403).json({ error: 'No access to this tenant.' });
    }
  }

  const { data, error } = await supabaseAdmin
    .from('tenants')
    .select(
      'id, slug, custom_domain, custom_domain_state, custom_domain_token, custom_domain_checked_at, custom_domain_error'
    )
    .eq('id', id)
    .maybeSingle();

  if (error) {
    logger.error('[admin/tenant-domain] load error', error);
    return res.status(500).json({ error: 'Server error.' });
  }
  if (!data) {
    return res
      .status(404)
      .json({ error: 'Tenant not found.', code: 'UNKNOWN_TENANT' });
  }

  const row = data as {
    slug: string;
    custom_domain: string | null;
    custom_domain_state: string | null;
    custom_domain_token: string | null;
    custom_domain_checked_at: string | null;
    custom_domain_error: string | null;
  };

  const summary = () => ({
    domain: row.custom_domain,
    state: row.custom_domain_state,
    checkedAt: row.custom_domain_checked_at,
    error: row.custom_domain_error,
    records:
      row.custom_domain && row.custom_domain_token
        ? dnsInstructions(row.custom_domain, row.custom_domain_token)
        : [],
  });

  if (req.method === 'GET') {
    return res.status(200).json(summary());
  }

  // ---------- POST : vérifier maintenant ----------
  if (!row.custom_domain || !row.custom_domain_token) {
    return res.status(400).json({
      error: 'Aucun domaine à vérifier.',
      code: 'NO_DOMAIN',
    });
  }

  const check = await checkDomain(row.custom_domain, row.custom_domain_token);
  const now = new Date().toISOString();
  const state = check.ok ? 'verified' : 'failed';

  const { error: upErr } = await supabaseAdmin
    .from('tenants')
    .update({
      custom_domain_state: state,
      custom_domain_checked_at: now,
      // Le détail est gardé MÊME en succès quand le routage manque : « vérifié,
      // mais rien ne pointe ici » est l'état le plus déroutant, et le taire
      // reviendrait à annoncer un site qui ne répond pas.
      custom_domain_error: check.ok && check.routingFound ? null : check.detail,
    })
    .eq('id', id);

  if (upErr) {
    logger.error('[admin/tenant-domain] update error', upErr);
    return res.status(500).json({ error: 'Failed to save verification.' });
  }

  // Le résolveur garde une correspondance host → espace en mémoire : sans
  // purge, un domaine fraîchement vérifié resterait ignoré jusqu'à expiration.
  invalidateTenantHostCache();

  try {
    await logStaffAction({
      staff_id: ctx.staff.id,
      action: 'other',
      entity_type: 'tenant',
      entity_id: id,
      tenant_id: id,
      payload: {
        action: 'verify_custom_domain',
        domain: row.custom_domain,
        state,
        routingFound: check.routingFound,
      },
    });
  } catch (logErr) {
    logger.error('logStaffAction(verify_custom_domain) error:', logErr);
  }

  return res.status(200).json({
    ...summary(),
    state,
    checkedAt: now,
    error: check.ok && check.routingFound ? null : check.detail,
    proofFound: check.proofFound,
    routingFound: check.routingFound,
  });
}

export default withStaffRoute(handler, 'caster');
