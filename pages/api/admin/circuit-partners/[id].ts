// pages/api/admin/circuit-partners/[id].ts
//
// PATCH : décider d'une candidature à l'offre partenaire des circuits.
//   { action: 'review', notes? }              → en cours d'examen
//   { action: 'reject', notes }               → refusée (motif obligatoire)
//   { action: 'approve', tenantSlug, notes? } → plan offert posé sur l'espace
//
// PORTÉE PLATEFORME, comme la liste. L'accord passe par
// `grantCircuitPartnerOffer` : décision réservée atomiquement, jamais de
// rétrogradation, retour arrière si le plan ne peut pas être posé.
// Chaque décision est journalisée dans `staff_logs`.

import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, type AuthenticatedStaffContext } from '@/utils/staff';
import { isValidUUID } from '@/utils/apiHelpers';
import { logStaffAction } from '@/utils/staffLogs';
import { logger } from '@/utils/logger';
import { grantCircuitPartnerOffer } from '@/utils/billing/circuitPartnerGrant';

const notes = z.string().trim().max(3000);

const bodySchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('review'), notes: notes.optional() }).strict(),
  z.object({ action: z.literal('reject'), notes: notes.min(3) }).strict(),
  z
    .object({
      action: z.literal('approve'),
      tenantSlug: z
        .string()
        .trim()
        .min(2)
        .max(50)
        .regex(/^[a-z0-9-]+$/),
      notes: notes.optional(),
    })
    .strict(),
]);

const GRANT_ERRORS: Record<string, { status: number; error: string }> = {
  not_found: { status: 404, error: 'Candidature introuvable.' },
  tenant_not_found: {
    status: 404,
    error: 'Aucun espace actif ne porte ce slug.',
  },
  already_decided: {
    status: 409,
    error: 'Cette candidature a déjà été tranchée.',
  },
  plan_already_covers: {
    status: 409,
    error:
      'Cet espace a déjà un plan qui couvre l’offre, ou une échéance plus lointaine.',
  },
  failed: { status: 500, error: 'Accord impossible pour le moment.' },
};

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  res.setHeader('Cache-Control', 'no-store');
  if (!supabaseAdmin) {
    return res.status(503).json({ error: 'Service indisponible.' });
  }
  if (req.method !== 'PATCH') {
    res.setHeader('Allow', 'PATCH');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  const id = typeof req.query.id === 'string' ? req.query.id : '';
  if (!isValidUUID(id)) {
    return res.status(400).json({ error: 'Identifiant invalide.' });
  }
  const parsed = bodySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: 'Décision invalide.', code: 'VALIDATION' });
  }
  const body = parsed.data;

  if (body.action === 'approve') {
    const result = await grantCircuitPartnerOffer({
      applicationId: id,
      tenantSlug: body.tenantSlug,
      staffId: ctx.staff.id,
      notes: body.notes ?? null,
    });
    if (!result.ok) {
      const mapped = GRANT_ERRORS[result.reason] ?? GRANT_ERRORS.failed;
      return res
        .status(mapped.status)
        .json({ error: mapped.error, code: result.reason });
    }
    await logStaffAction({
      staff_id: ctx.staff.id,
      action: 'approve_circuit_partner',
      entity_type: 'tenant',
      entity_id: result.tenantId,
      tenant_id: result.tenantId,
      payload: {
        applicationId: id,
        tenantSlug: result.tenantSlug,
        plan: result.plan,
        grantedUntil: result.grantedUntil,
      },
    });
    return res.status(200).json({
      ok: true,
      status: 'approved',
      tenantSlug: result.tenantSlug,
      plan: result.plan,
      grantedUntil: result.grantedUntil,
    });
  }

  const nextStatus = body.action === 'review' ? 'reviewing' : 'rejected';
  const { data, error } = await supabaseAdmin
    .from('circuit_partner_applications')
    .update({
      status: nextStatus,
      updated_at: new Date().toISOString(),
      ...(body.notes ? { admin_notes: body.notes } : {}),
      ...(nextStatus === 'rejected'
        ? { decided_by: ctx.staff.id, decided_at: new Date().toISOString() }
        : {}),
    })
    .eq('id', id)
    // Une candidature accordée ne se rouvre pas ici : le plan est posé.
    .neq('status', 'approved')
    .select('id');
  if (error) {
    logger.error('[admin/circuit-partners] update error: %s', error.message);
    return res.status(500).json({ error: 'Mise à jour impossible.' });
  }
  if (!data || data.length === 0) {
    return res.status(409).json({
      error: 'Candidature introuvable ou déjà accordée.',
      code: 'already_decided',
    });
  }
  if (nextStatus === 'rejected') {
    await logStaffAction({
      staff_id: ctx.staff.id,
      action: 'reject_circuit_partner',
      entity_type: 'circuit_partner_application',
      entity_id: id,
      tenant_id: ctx.tenantId,
      payload: { notes: body.notes },
    });
  }
  return res.status(200).json({ ok: true, status: nextStatus });
}

export default withStaffRoute(handler, {
  permission: 'manage_tenant',
  scope: 'platform',
});
