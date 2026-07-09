// pages/api/admin/scrim-plannings/[planningId]/validate.ts
// Admin: validation d'un créneau sur une session de planning → matérialise un
// `scrims` (status 'scheduled') et bascule la planning en 'validated'.
//
// Idempotent sur `scrims.source_planning_id` : un retry (double-click, réseau
// partiel) renvoie le scrim déjà créé sans en dupliquer un — pattern calqué sur
// le bloc « accept → draft scrim » de pages/api/teams/scrim-requests.ts.

import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, AuthenticatedStaffContext } from '@/utils/staff';
import { logStaffAction } from '@/utils/staffLogs';
import { withAdminIdempotency } from '@/utils/adminIdempotency';
import { isValidUUID } from '@/utils/apiHelpers';
import { emitScrimEvent } from '@/utils/scrimEvents';
import { emitScrimPlanningEvent } from '@/utils/scrimPlanningEvents';
import { planningConfigFromRow } from '@/utils/teams/scrimPlanningConfig';
import {
  slotKeysForHorizon,
  buildHeatmap,
  isSlotValidatable,
  type PlanningAvailabilityInput,
} from '@/utils/teams/scrimPlanningOverlap';
import { logger } from '@/utils/logger';

const bodySchema = z.object({
  slot: z.string().trim().min(1, 'slot requis'),
});

export default withStaffRoute(
  withAdminIdempotency(handler, { key: 'admin-scrim-plannings-validate' }),
  'manager'
);

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  if (!supabaseAdmin)
    return res.status(500).json({ error: 'Supabase admin not configured' });

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const rawId = req.query.planningId;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;
  if (!id || !isValidUUID(id)) {
    return res.status(400).json({ error: 'planningId invalide' });
  }

  const parsed = bodySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    return res
      .status(400)
      .json({ error: first?.message || 'Requête invalide.' });
  }

  // 1) Charge la planning (404 si absente / supprimée / mauvais tenant).
  const { data: planning, error: planErr } = await supabaseAdmin
    .from('scrim_plannings')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', ctx.tenantId)
    .is('deleted_at', null)
    .maybeSingle();

  if (planErr) {
    logger.error('[admin/scrim-plannings/validate] load error:', planErr);
    return res.status(500).json({ error: 'Failed to load scrim planning' });
  }
  if (!planning) {
    return res.status(404).json({ error: 'Scrim planning not found' });
  }

  // 2) Idempotence : si un scrim existe déjà pour cette planning, on le renvoie
  //    tel quel (retry) — AVANT le check de statut, pour qu'un second appel sur
  //    une planning déjà 'validated' ne renvoie pas 409.
  const { data: existingScrim } = await supabaseAdmin
    .from('scrims')
    .select('*')
    .eq('tenant_id', ctx.tenantId)
    .eq('source_planning_id', id)
    .maybeSingle();

  if (existingScrim) {
    return res.status(201).json({ scrim: existingScrim, planning });
  }

  // 3) La planning doit être ouverte pour être validée.
  if (planning.status !== 'open') {
    return res.status(409).json({
      error: `Planning non ouverte (statut : ${planning.status}).`,
      code: 'PLANNING_NOT_OPEN',
    });
  }

  // 4) Le créneau doit appartenir à la grille de la session.
  const config = planningConfigFromRow(planning as never);
  const slotDate = new Date(parsed.data.slot);
  if (Number.isNaN(slotDate.getTime())) {
    return res.status(400).json({ error: 'slot invalide' });
  }
  const slotIso = slotDate.toISOString();
  const validKeys = new Set(slotKeysForHorizon(config));
  if (!validKeys.has(slotIso)) {
    return res.status(400).json({
      error: 'Créneau hors grille.',
      code: 'SLOT_OUT_OF_GRID',
    });
  }

  // 5) Overlap : on n'impose PAS que les deux équipes soient dispo (override
  //    admin), mais on prévient si le créneau n'est pas « planifiable ».
  const { data: availabilities } = await supabaseAdmin
    .from('scrim_planning_availabilities')
    .select('*')
    .eq('tenant_id', ctx.tenantId)
    .eq('planning_id', id);

  const heatmapInput: PlanningAvailabilityInput[] = (availabilities ?? []).map(
    (r) => ({
      party: r.party as PlanningAvailabilityInput['party'],
      userId: r.user_id as string,
      displayName: (r.display_name as string | null) ?? null,
      slots: Array.isArray(r.slots) ? (r.slots as string[]) : [],
    })
  );
  const heatmap = buildHeatmap(heatmapInput);
  const warning = isSlotValidatable(heatmap[slotIso])
    ? undefined
    : 'Créneau validé sans overlap complet des deux équipes.';

  // 6) Résout les noms d'équipes pour le nom du scrim.
  const { data: teams } = await supabaseAdmin
    .from('teams')
    .select('id, name')
    .in('id', [planning.team1_id, planning.team2_id]);
  const nameById = new Map<string, string>(
    (teams ?? []).map((t) => [t.id as string, (t.name as string) ?? 'Équipe'])
  );
  const team1Name = nameById.get(planning.team1_id as string) ?? 'Équipe 1';
  const team2Name = nameById.get(planning.team2_id as string) ?? 'Équipe 2';

  // 7) Crée le scrim (status 'scheduled'), tagué source_planning_id.
  const scrimPayload = {
    tenant_id: ctx.tenantId,
    name: `${team1Name} vs ${team2Name}`,
    status: 'scheduled',
    team1_id: planning.team1_id,
    team2_id: planning.team2_id,
    scheduled_date: slotIso,
    timezone: planning.timezone,
    is_public: false,
    source_planning_id: id,
    source_demande_id: planning.source_demande_id ?? null,
  };

  const { data: scrim, error: scrimErr } = await supabaseAdmin
    .from('scrims')
    .insert(scrimPayload)
    .select('*')
    .maybeSingle();

  if (scrimErr || !scrim) {
    logger.error(
      '[admin/scrim-plannings/validate] scrim create error:',
      scrimErr
    );
    return res.status(500).json({ error: 'Failed to create scrim' });
  }

  // 8) Bascule la planning en 'validated'.
  const { data: updatedPlanning, error: updErr } = await supabaseAdmin
    .from('scrim_plannings')
    .update({
      status: 'validated',
      validated_slot: slotIso,
      scrim_id: scrim.id,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('tenant_id', ctx.tenantId)
    .select('*')
    .single();

  if (updErr || !updatedPlanning) {
    logger.error(
      '[admin/scrim-plannings/validate] planning update error:',
      updErr
    );
    return res.status(500).json({ error: 'Failed to validate scrim planning' });
  }

  if (ctx.staff?.id) {
    try {
      await logStaffAction({
        staff_id: ctx.staff.id,
        action: 'other',
        entity_type: 'scrim_planning',
        entity_id: id,
        tournament_id: null,
        tenant_id: ctx.tenantId,
        payload: {
          subject: 'validate_scrim_planning',
          slot: slotIso,
          scrim_id: scrim.id,
        },
      });
    } catch (e) {
      logger.error('[admin/scrim-plannings/validate] log error:', e);
    }
  }

  void emitScrimEvent('scrim.scheduled', scrim, ctx.tenantId, {
    previousStatus: 'draft',
  });
  void emitScrimPlanningEvent(
    'scrim.planning.validated',
    updatedPlanning,
    ctx.tenantId,
    { scrimId: scrim.id }
  );

  return res.status(201).json({ scrim, planning: updatedPlanning, warning });
}
