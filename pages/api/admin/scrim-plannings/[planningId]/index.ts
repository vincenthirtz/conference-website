// pages/api/admin/scrim-plannings/[planningId]/index.ts
// Admin: détail / mise à jour / suppression d'une session de planning de scrim.
// - GET    : planning + dispos + heatmap (attribution COMPLÈTE côté admin)
// - PATCH  : mise à jour des champs autorisés
// - DELETE : soft-delete (set deleted_at)

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, AuthenticatedStaffContext } from '@/utils/staff';
import { logStaffAction } from '@/utils/staffLogs';
import { isValidUUID } from '@/utils/apiHelpers';
import {
  buildHeatmap,
  type PlanningAvailabilityInput,
} from '@/utils/teams/scrimPlanningOverlap';
import { logger } from '@/utils/logger';

// PATCH n'autorise que 'cancelled' | 'closed' comme transition de statut : la
// (re)passage à 'open' ou 'validated' n'est pas un simple champ (validated
// passe par la route /validate qui matérialise un scrim).
const PATCHABLE_STATUSES = ['cancelled', 'closed'] as const;

const PATCHABLE_FIELDS = [
  'title',
  'game',
  'status',
  'horizon_start',
  'horizon_days',
  'slot_minutes',
  'day_start_min',
  'day_end_min',
  'timezone',
  'is_public',
  'staff_required',
  // Permet de ré-armer la relance en prolongeant l'horizon (PATCH le remet à null).
  'reminder_pinged_at',
] as const;

export default withStaffRoute(handler, 'manager');

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  if (!supabaseAdmin)
    return res.status(500).json({ error: 'Supabase admin not configured' });

  const rawId = req.query.planningId;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;
  if (!id || !isValidUUID(id)) {
    return res.status(400).json({ error: 'planningId invalide' });
  }

  switch (req.method) {
    case 'GET':
      return handleGet(res, id, ctx);
    case 'PATCH':
    case 'PUT':
      return handlePatch(req, res, id, ctx);
    case 'DELETE':
      return handleDelete(res, id, ctx);
    default:
      res.setHeader('Allow', 'GET,PATCH,PUT,DELETE');
      return res.status(405).json({ error: 'Method not allowed' });
  }
}

async function handleGet(
  res: NextApiResponse,
  id: string,
  ctx: AuthenticatedStaffContext
) {
  const { data: planning, error } = await supabaseAdmin!
    .from('scrim_plannings')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', ctx.tenantId)
    .is('deleted_at', null)
    .maybeSingle();

  if (error) {
    logger.error('[admin/scrim-plannings/:id] GET error:', error);
    return res.status(500).json({ error: 'Failed to fetch scrim planning' });
  }
  if (!planning) {
    return res.status(404).json({ error: 'Scrim planning not found' });
  }

  const { data: availabilities, error: availErr } = await supabaseAdmin!
    .from('scrim_planning_availabilities')
    .select('*')
    .eq('tenant_id', ctx.tenantId)
    .eq('planning_id', id);

  if (availErr) {
    logger.error('[admin/scrim-plannings/:id] avail error:', availErr);
    return res.status(500).json({ error: 'Failed to fetch availabilities' });
  }

  const rows = availabilities ?? [];
  const heatmapInput: PlanningAvailabilityInput[] = rows.map((r) => ({
    party: r.party as PlanningAvailabilityInput['party'],
    userId: r.user_id as string,
    displayName: (r.display_name as string | null) ?? null,
    slots: Array.isArray(r.slots) ? (r.slots as string[]) : [],
  }));

  // Admin : heatmap avec attribution COMPLÈTE (display_name inclus).
  const heatmap = buildHeatmap(heatmapInput);

  return res.status(200).json({
    planning,
    availabilities: rows,
    heatmap,
  });
}

async function handlePatch(
  req: NextApiRequest,
  res: NextApiResponse,
  id: string,
  ctx: AuthenticatedStaffContext
) {
  const body = (req.body ?? {}) as Record<string, unknown>;

  const updatePayload: Record<string, unknown> = {};
  for (const field of PATCHABLE_FIELDS) {
    if (body[field] !== undefined) {
      updatePayload[field] = body[field];
    }
  }

  if (Object.keys(updatePayload).length === 0) {
    return res.status(400).json({ error: 'No fields to update' });
  }

  if (
    updatePayload.status !== undefined &&
    !(PATCHABLE_STATUSES as readonly string[]).includes(
      updatePayload.status as string
    )
  ) {
    return res.status(400).json({
      error: `Statut invalide. Valeurs : ${PATCHABLE_STATUSES.join(', ')}.`,
    });
  }

  const { data: before } = await supabaseAdmin!
    .from('scrim_plannings')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', ctx.tenantId)
    .is('deleted_at', null)
    .maybeSingle();
  if (!before) {
    return res.status(404).json({ error: 'Scrim planning not found' });
  }

  updatePayload.updated_at = new Date().toISOString();

  const { data: after, error: updErr } = await supabaseAdmin!
    .from('scrim_plannings')
    .update(updatePayload)
    .eq('id', id)
    .eq('tenant_id', ctx.tenantId)
    .select('*')
    .single();

  if (updErr || !after) {
    logger.error('[admin/scrim-plannings/:id] PATCH error:', updErr);
    return res.status(500).json({ error: 'Failed to update scrim planning' });
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
        payload: { subject: 'update_scrim_planning', changes: updatePayload },
      });
    } catch (e) {
      logger.error('[admin/scrim-plannings/:id] log error:', e);
    }
  }

  return res.status(200).json({ success: true, planning: after });
}

async function handleDelete(
  res: NextApiResponse,
  id: string,
  ctx: AuthenticatedStaffContext
) {
  const { data: before } = await supabaseAdmin!
    .from('scrim_plannings')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', ctx.tenantId)
    .is('deleted_at', null)
    .maybeSingle();
  if (!before) {
    return res.status(404).json({ error: 'Scrim planning not found' });
  }

  const { error } = await supabaseAdmin!
    .from('scrim_plannings')
    .update({
      deleted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .eq('tenant_id', ctx.tenantId);
  if (error) {
    logger.error('[admin/scrim-plannings/:id] DELETE error:', error);
    return res.status(500).json({ error: 'Failed to delete scrim planning' });
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
        payload: { subject: 'delete_scrim_planning', title: before.title },
      });
    } catch (e) {
      logger.error('[admin/scrim-plannings/:id] log error:', e);
    }
  }

  return res.status(200).json({ success: true });
}
