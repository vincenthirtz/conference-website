// pages/api/admin/scrim-plannings/[planningId]/availability.ts
// Back-office (staff session) : le staff/admin déclare SES propres créneaux de
// disponibilité (party='staff') directement depuis la page de détail de la
// grille — pendant du PUT joueur (Bearer) mais en auth staff (cookie).
//   - GET  : mes créneaux staff actuels sur cette grille → { slots }.
//   - PUT  : remplace mes créneaux (UPSERT sur (planning_id, user_id)).
//
// Gate : withStaffRoute('caster') (tout membre du staff peut se déclarer dispo).
// PUT refusé si la grille n'est pas 'open' (409). Slots validés contre la grille.

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, type AuthenticatedStaffContext } from '@/utils/staff';
import { planningConfigFromRow } from '@/utils/teams/scrimPlanningConfig';
import { normalizePlanningSlots } from '@/utils/teams/scrimPlanningOverlap';
import { isValidUUID } from '@/utils/apiHelpers';
import { logger } from '@/utils/logger';

export default withStaffRoute(handler, 'caster');

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  if (!supabaseAdmin)
    return res.status(500).json({ error: 'Supabase admin not configured' });
  if (req.method !== 'GET' && req.method !== 'PUT') {
    res.setHeader('Allow', 'GET,PUT');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const rawId = req.query.planningId;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;
  if (!id || !isValidUUID(id)) {
    return res.status(400).json({ error: 'planningId invalide' });
  }

  const userId = ctx.staff?.auth_user_id as string | undefined;
  if (!userId) {
    return res.status(403).json({ error: 'Staff non résolu.' });
  }

  const { data: planning, error } = await supabaseAdmin
    .from('scrim_plannings')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', ctx.tenantId)
    .is('deleted_at', null)
    .maybeSingle();
  if (error) {
    logger.error('[admin/scrim-plannings/:id/availability] load error:', error);
    return res.status(500).json({ error: 'Failed to load scrim planning.' });
  }
  if (!planning) {
    return res.status(404).json({ error: 'Scrim planning not found' });
  }

  // GET : mes créneaux staff actuels.
  if (req.method === 'GET') {
    const { data: mine } = await supabaseAdmin
      .from('scrim_planning_availabilities')
      .select('slots')
      .eq('tenant_id', ctx.tenantId)
      .eq('planning_id', id)
      .eq('user_id', userId)
      .maybeSingle();
    const slots = Array.isArray(mine?.slots) ? (mine!.slots as string[]) : [];
    return res.status(200).json({ slots });
  }

  // À partir d'ici : req.method === 'PUT' (upsert de mes créneaux staff).
  if (req.method === 'PUT' && planning.status !== 'open') {
    return res.status(409).json({
      error: `Session fermée (statut : ${planning.status}).`,
      code: 'PLANNING_NOT_OPEN',
    });
  }

  const config = planningConfigFromRow(planning as never);
  const result = normalizePlanningSlots((req.body ?? {}).slots, config);
  if (!result.ok) {
    return res.status(400).json({ error: result.error });
  }

  const { error: upsertErr } = await supabaseAdmin
    .from('scrim_planning_availabilities')
    .upsert(
      {
        tenant_id: ctx.tenantId,
        planning_id: id,
        party: 'staff',
        user_id: userId,
        display_name: ctx.staff?.display_name ?? null,
        slots: result.slots,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'planning_id,user_id' }
    );

  if (upsertErr) {
    logger.error(
      '[admin/scrim-plannings/:id/availability] upsert error:',
      upsertErr
    );
    return res.status(500).json({ error: 'Failed to save availability.' });
  }

  return res.status(200).json({ success: true, slots: result.slots });
}
