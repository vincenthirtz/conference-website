// pages/api/admin/tenants/[id]/lifecycle.ts
//
// POST : changer l'état d'un espace — suspendre, archiver, programmer une
// purge, ou rouvrir.
//
// Avant ce lot, il n'y avait qu'un booléen : « archiver » mettait `is_active`
// à false, sans motif, sans auteur, sans date, et sans définition partagée des
// conséquences. Deux personnes pouvaient lire le même false et en tirer deux
// comportements différents.
//
// Trois règles portées ici :
//
//   1. MOTIF OBLIGATOIRE hors retour à `active`. Un geste qui coupe le service
//      d'un client se motive ; le motif est repris dans le refus que ce client
//      recevra, et dans le journal.
//   2. L'espace protégé (`conference`) ne peut pas sortir de `active` — c'est
//      la plateforme elle-même.
//   3. `purge_scheduled` exige une date : programmer un effacement sans dire
//      quand serait une menace, pas un plan. (L'export préalable arrive avec le
//      lot T5 ; d'ici là, la programmation reste réversible et rien n'efface.)
//
// Portée : owner de la plateforme. Suspendre un espace n'est pas un geste
// d'exploitation courante.

import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { supabaseAdmin } from '@/utils/supabase';
import {
  withStaffRoute,
  requireOwner,
  type AuthenticatedStaffContext,
} from '@/utils/staff';
import { withAdminIdempotency } from '@/utils/adminIdempotency';
import { applyRateLimit } from '@/utils/rateLimit';
import { isValidUUID } from '@/utils/apiHelpers';
import { PROTECTED_TENANT_SLUGS } from '@/utils/adminTenants';
import { logStaffAction } from '@/utils/staffLogs';
import { logger } from '@/utils/logger';
import { invalidateTenantHostCache } from '@/utils/tenant';
import {
  invalidateLifecycleCache,
  LIFECYCLE_STATES,
  type LifecycleState,
} from '@/utils/tenants/lifecycle';

/** Assez long pour dire quelque chose, assez court pour ne pas décourager. */
const REASON_MIN = 10;

const bodySchema = z.object({
  // `purged` ne se demande pas ici : c'est le cron de purge qui le pose, une
  // fois l'effacement réellement fait (T5).
  state: z.enum(
    LIFECYCLE_STATES.filter((s) => s !== 'purged') as unknown as [
      LifecycleState,
      ...LifecycleState[],
    ]
  ),
  reason: z.string().trim().max(500).optional(),
  purgeAfterDays: z.number().int().min(1).max(365).optional(),
});

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  if (
    applyRateLimit(
      req,
      res,
      { max: 10, windowMs: 60_000 },
      'admin-tenant-lifecycle'
    )
  ) {
    return;
  }
  res.setHeader('Cache-Control', 'no-store');

  switch (req.method) {
    case 'POST':
      break;
    default:
      res.setHeader('Allow', 'POST');
      return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!requireOwner(ctx, res)) return;

  const { id } = req.query;
  if (!id || typeof id !== 'string' || !isValidUUID(id)) {
    return res
      .status(400)
      .json({ error: 'Invalid tenant id.', code: 'INVALID_TENANT_ID' });
  }

  const parsed = bodySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({
      error: 'Invalid body',
      code: 'INVALID_BODY',
      details: parsed.error.flatten(),
    });
  }
  const { state, purgeAfterDays } = parsed.data;
  const reason = parsed.data.reason ?? '';

  if (state !== 'active' && reason.length < REASON_MIN) {
    return res.status(400).json({
      error: `Un motif d'au moins ${REASON_MIN} caractères est requis : il sera lu par le client et par le prochain qui ouvrira ce journal.`,
      code: 'REASON_REQUIRED',
    });
  }

  const { data: tenant, error: loadErr } = await supabaseAdmin
    .from('tenants')
    .select('id, slug, name, lifecycle_state')
    .eq('id', id)
    .maybeSingle();

  if (loadErr) {
    logger.error('[admin/tenant-lifecycle] load error', loadErr);
    return res.status(500).json({ error: 'Server error.' });
  }
  if (!tenant) {
    return res
      .status(404)
      .json({ error: 'Tenant not found.', code: 'UNKNOWN_TENANT' });
  }

  const row = tenant as { slug: string; lifecycle_state: string | null };

  if (state !== 'active' && PROTECTED_TENANT_SLUGS.has(row.slug)) {
    return res.status(409).json({
      error: `L'espace « ${row.slug} » ne peut pas être fermé : c'est la plateforme elle-même.`,
      code: 'PROTECTED_TENANT',
    });
  }

  const now = new Date();
  const update: Record<string, unknown> = {
    lifecycle_state: state,
    lifecycle_reason: state === 'active' ? null : reason,
    lifecycle_changed_at: now.toISOString(),
    lifecycle_changed_by: ctx.staff.id,
    // Une purge programmée porte sa date ; tout autre état la retire — laisser
    // une échéance d'effacement derrière soi serait une bombe à retardement.
    purge_after:
      state === 'purge_scheduled'
        ? new Date(
            now.getTime() + (purgeAfterDays ?? 30) * 86_400_000
          ).toISOString()
        : null,
  };

  const { data: updated, error } = await supabaseAdmin
    .from('tenants')
    .update(update)
    .eq('id', id)
    .select('id, slug, lifecycle_state, lifecycle_reason, purge_after, is_active')
    .maybeSingle();

  if (error) {
    logger.error('[admin/tenant-lifecycle] update error', error);
    return res.status(500).json({ error: 'Failed to change state.' });
  }

  // Deux caches à oublier : celui de l'état (60 s) et celui du routage par
  // domaine. Sans ça, un espace suspendu continuerait de servir une minute.
  invalidateLifecycleCache(id);
  invalidateTenantHostCache();

  try {
    await logStaffAction({
      staff_id: ctx.staff.id,
      action: 'tenant_lifecycle',
      entity_type: 'tenant',
      entity_id: id,
      tenant_id: id,
      payload: {
        action: 'tenant_lifecycle',
        from: row.lifecycle_state,
        to: state,
        reason: reason || null,
        purgeAfter: update.purge_after,
      },
    });
  } catch (logErr) {
    logger.error('logStaffAction(tenant_lifecycle) error:', logErr);
  }

  return res.status(200).json({ tenant: updated });
}

export default withStaffRoute(
  withAdminIdempotency(handler, { key: 'admin-tenant-lifecycle' }),
  { permission: 'manage_tenant' }
);
