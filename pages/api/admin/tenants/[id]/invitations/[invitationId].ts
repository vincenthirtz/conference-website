// pages/api/admin/tenants/[id]/invitations/[invitationId].ts
//
// DELETE : révoque une invitation encore en vol.
//
// Une invitation part par email et vit 14 jours. Sans révocation, une adresse
// tapée de travers — ou une personne qui ne devait finalement pas entrer —
// gardait un lien valide jusqu'au bout, et le seul recours était d'attendre.
//
// La révocation est idempotente : re-révoquer ne change rien et ne se plaint
// pas. On ne supprime pas la ligne, on la date : « qui a invité qui, et qui a
// annulé » est précisément ce qu'un journal doit pouvoir dire.

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
      'admin-tenant-invite-revoke'
    )
  ) {
    return;
  }
  res.setHeader('Cache-Control', 'no-store');

  switch (req.method) {
    case 'DELETE':
      break;
    default:
      res.setHeader('Allow', 'DELETE');
      return res.status(405).json({ error: 'Method not allowed' });
  }

  const { id, invitationId } = req.query;
  if (
    !id ||
    typeof id !== 'string' ||
    !isValidUUID(id) ||
    !invitationId ||
    typeof invitationId !== 'string' ||
    !isValidUUID(invitationId)
  ) {
    return res.status(400).json({ error: 'Invalid ids.', code: 'INVALID_IDS' });
  }

  if (!hasAtLeastRole(ctx.role, 'admin')) {
    const isPoleAdmin =
      (ctx.staff as { is_pole_admin?: boolean }).is_pole_admin === true;
    if (!(await canAccessTenant(ctx.staff.id, id, { isPoleAdmin }))) {
      return res.status(403).json({ error: 'No access to this tenant.' });
    }
  }

  // Le filtre porte AUSSI sur le tenant : sans lui, l'identifiant d'une
  // invitation suffirait à révoquer chez le voisin.
  const { data, error } = await supabaseAdmin
    .from('tenant_invitations')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', invitationId)
    .eq('tenant_id', id)
    .is('accepted_at', null)
    .is('revoked_at', null)
    .select('id, email')
    .maybeSingle();

  if (error) {
    logger.error('[admin/tenant-invitations] revoke error', error);
    return res.status(500).json({ error: 'Failed to revoke invitation.' });
  }

  if (data) {
    try {
      await logStaffAction({
        staff_id: ctx.staff.id,
        action: 'other',
        entity_type: 'tenant',
        entity_id: id,
        tenant_id: id,
        payload: {
          action: 'revoke_tenant_invitation',
          email: (data as { email: string }).email,
        },
      });
    } catch (logErr) {
      logger.error('logStaffAction(revoke_tenant_invitation) error:', logErr);
    }
  }

  // Rien à révoquer (déjà acceptée, déjà révoquée, inconnue) : 200 quand même.
  // L'appelant voulait qu'elle ne soit plus valable ; elle ne l'est plus.
  return res.status(200).json({ revoked: Boolean(data) });
}

export default withStaffRoute(handler, 'caster');
