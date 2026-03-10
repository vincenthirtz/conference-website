// pages/api/admin/stages/[stageId].ts
// Admin: gestion d'une phase (stage) de tournoi.
// - GET        : récupérer une phase
// - PUT/PATCH  : mettre à jour une phase (meta / config)
// - DELETE     : désactiver (soft) ou supprimer (hard) une phase

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute } from '@/utils/staff';
import { logStaffAction } from '@/utils/staffLogs';

export type StageType =
  | 'group'
  | 'bracket'
  | 'swiss'
  | 'round_robin'
  | 'showmatch'
  | 'other';

export type StageRow = {
  id: string;
  tournament_id: string;
  name: string;
  slug: string | null;
  stage_type: StageType | null; // ex: "group", "bracket", "swiss"...
  order_index: number | null;
  is_active: boolean;
  is_public: boolean;
  start_date: string | null;
  end_date: string | null;
  settings: any | null; // JSONB (config spécifique)
  created_at: string;
  updated_at: string | null;
};

// rôle minimum : manager (gestion de la structure du tournoi)
export default withStaffRoute(handler, 'manager');

async function handler(req: NextApiRequest, res: NextApiResponse, ctx: any) {
  const { stageId } = req.query;

  if (!stageId || Array.isArray(stageId)) {
    return res.status(400).json({ error: 'Invalid stageId' });
  }

  const id = String(stageId);

  try {
    switch (req.method) {
      case 'GET':
        return await handleGet(id, res);
      case 'PUT':
      case 'PATCH':
        return await handlePut(id, req, res, ctx);
      case 'DELETE':
        return await handleDelete(id, req, res, ctx);
      default:
        return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (err: any) {
    console.error('[/api/admin/stages/[stageId]] internal error:', err);
    return res.status(500).json({
      error: 'Internal server error',
      detail: err?.message,
    });
  }
}

/* -----------------------------------------------------------
 * GET : récupérer une phase
 * ---------------------------------------------------------*/

async function handleGet(id: string, res: NextApiResponse) {
  const { data, error } = await supabaseAdmin
    .from('tournament_stages')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error || !data) {
    console.error('admin GET stage error:', error);
    return res.status(404).json({ error: 'Stage not found' });
  }

  return res.status(200).json({
    stage: data as StageRow,
  });
}

/* -----------------------------------------------------------
 * PUT / PATCH : mise à jour d'une phase (meta / settings)
 * Body : partial<StageRow> (sans id/tournament_id/created_at)
 * ---------------------------------------------------------*/

async function handlePut(
  id: string,
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: any
) {
  const body = req.body || {};

  // champs modifiables
  const allowedFields: (keyof StageRow)[] = [
    'tournament_id',
    'name',
    'slug',
    'stage_type',
    'order_index',
    'is_active',
    'is_public',
    'start_date',
    'end_date',
    'settings',
  ];

  const updatePayload: Partial<StageRow> = {};

  for (const key of allowedFields) {
    if (key in body) {
      updatePayload[key as keyof StageRow] = body[key];
    }
  }

  if (Object.keys(updatePayload).length === 0) {
    return res.status(400).json({
      error: 'No valid fields to update. Allowed: ' + allowedFields.join(', '),
    });
  }

  // --- Validation des champs ---

  // Nom non vide
  if ('name' in body && (typeof body.name !== 'string' || body.name.trim().length === 0)) {
    return res.status(400).json({ error: 'Stage name cannot be empty' });
  }

  // order_index >= 0
  if ('order_index' in body && body.order_index !== null) {
    if (typeof body.order_index !== 'number' || !Number.isInteger(body.order_index) || body.order_index < 0) {
      return res.status(400).json({ error: 'order_index must be an integer >= 0' });
    }
  }

  // stage_type valide
  const VALID_STAGE_TYPES: StageType[] = ['group', 'bracket', 'swiss', 'round_robin', 'showmatch', 'other'];
  if ('stage_type' in body && body.stage_type !== null) {
    if (!VALID_STAGE_TYPES.includes(body.stage_type)) {
      return res.status(400).json({
        error: `Invalid stage_type. Allowed values: ${VALID_STAGE_TYPES.join(', ')}`,
      });
    }
  }

  // Cohérence des dates : start_date < end_date
  if ('start_date' in body && 'end_date' in body) {
    if (body.start_date && body.end_date && new Date(body.start_date) >= new Date(body.end_date)) {
      return res.status(400).json({ error: 'start_date must be before end_date' });
    }
  }

  updatePayload.updated_at = new Date().toISOString();

  // récupérer l'état avant update pour log
  const { data: before, error: fetchErr } = await supabaseAdmin
    .from('tournament_stages')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (fetchErr || !before) {
    return res.status(404).json({ error: 'Stage not found' });
  }

  // Vérifier la cohérence des dates avec les valeurs existantes
  const effectiveStart = 'start_date' in body ? body.start_date : before.start_date;
  const effectiveEnd = 'end_date' in body ? body.end_date : before.end_date;
  if (effectiveStart && effectiveEnd && new Date(effectiveStart) >= new Date(effectiveEnd)) {
    return res.status(400).json({ error: 'start_date must be before end_date' });
  }

  const { data, error } = await supabaseAdmin
    .from('tournament_stages')
    .update(updatePayload)
    .eq('id', id)
    .select('*')
    .maybeSingle();

  if (error || !data) {
    console.error('admin PUT stage error:', error);
    return res.status(500).json({
      error: 'Failed to update stage',
    });
  }

  // log staff
  if (ctx?.staff?.id) {
    try {
      await logStaffAction({
        staff_id: ctx.staff.id,
        action: 'update_stage',
        entity_type: 'stage',
        entity_id: id,
        tournament_id: (data as any).tournament_id,
        payload: {
          before,
          after: data,
        },
      });
    } catch (e) {
      console.error('admin PUT stage logStaffAction error:', e);
    }
  }

  return res.status(200).json({
    stage: data as StageRow,
  });
}

/* -----------------------------------------------------------
 * DELETE :
 *  - soft (par défaut) : is_active=false, is_public=false
 *  - hard (?hard=1) : suppression DB
 * ---------------------------------------------------------*/

async function handleDelete(
  id: string,
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: any
) {
  const hard = req.query.hard === '1' || req.query.hard === 'true';

  const { data: before, error: fetchErr } = await supabaseAdmin
    .from('tournament_stages')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (fetchErr || !before) {
    return res.status(404).json({ error: 'Stage not found' });
  }

  const tournamentId = (before as any).tournament_id ?? null;

  if (hard) {
    const { error } = await supabaseAdmin
      .from('tournament_stages')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('admin hard delete stage error:', error);
      return res.status(500).json({
        error: 'Failed to hard-delete stage',
      });
    }

    if (ctx?.staff?.id) {
      try {
        await logStaffAction({
          staff_id: ctx.staff.id,
          action: 'delete_stage',
          entity_type: 'stage',
          entity_id: id,
          tournament_id: tournamentId,
          payload: {
            hard_delete: true,
          },
        });
      } catch (e) {
        console.error('admin hard delete stage logStaffAction error:', e);
      }
    }

    return res.status(200).json({
      success: true,
      hardDeleted: true,
    });
  }

  // soft delete : désactiver la phase
  const { data, error } = await supabaseAdmin
    .from('tournament_stages')
    .update({
      is_active: false,
      is_public: false,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
    .select('*')
    .maybeSingle();

  if (error || !data) {
    console.error('admin soft delete stage error:', error);
    return res.status(500).json({
      error: 'Failed to deactivate stage',
    });
  }

  if (ctx?.staff?.id) {
    try {
      await logStaffAction({
        staff_id: ctx.staff.id,
        action: 'update_stage',
        entity_type: 'stage',
        entity_id: id,
        tournament_id: tournamentId,
        payload: {
          soft_delete: true,
          new_is_active: false,
          new_is_public: false,
        },
      });
    } catch (e) {
      console.error('admin soft delete stage logStaffAction error:', e);
    }
  }

  return res.status(200).json({
    success: true,
    hardDeleted: false,
    stage: data as StageRow,
  });
}
