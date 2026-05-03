// pages/api/admin/tournament/[id]/stages.ts
// Admin: gestion des phases (stages) d'un tournoi
// - GET   : liste des phases du tournoi
// - POST  : créer une nouvelle phase
// - PATCH : réordonner les phases (order_index)

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, AuthenticatedStaffContext } from '@/utils/staff';
import { logStaffAction } from '@/utils/staffLogs';
import { isValidUUID } from '@/utils/apiHelpers';
import { validateStageSettings } from '@/utils/stageSettings';
import type { StageSettings } from '@/types/stages';

import { logger } from '../../../../../utils/logger';
type StageType =
  | 'group'
  | 'bracket'
  | 'swiss'
  | 'round_robin'
  | 'showmatch'
  | 'other';

type Stage = {
  id: string;
  tournament_id: string;
  name: string;
  slug: string | null;
  stage_type: StageType | null;
  order_index: number | null;
  is_public: boolean;
  start_date: string | null;
  settings: StageSettings | null;
  created_at: string;
  updated_at: string | null;
};

type ApiResponse = { stages: Stage[] } | { stage: Stage } | { error: string };

export default withStaffRoute(handler, 'manager');

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse>,
  ctx: AuthenticatedStaffContext
) {
  const { id } = req.query;

  if (!id || Array.isArray(id) || !isValidUUID(id)) {
    return res.status(400).json({ error: 'Invalid tournament ID' });
  }

  const tournamentId = String(id);

  try {
    switch (req.method) {
      case 'GET':
        return await handleGet(tournamentId, res);
      case 'POST':
        return await handlePost(tournamentId, req, res, ctx);
      case 'PATCH':
        return await handlePatch(tournamentId, req, res, ctx);
      default:
        return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (err: unknown) {
    logger.error('[/api/admin/tournament/[id]/stages] internal error:', err);
    return res.status(500).json({
      error: 'Internal server error',
    });
  }
}

async function handleGet(
  tournamentId: string,
  res: NextApiResponse<ApiResponse>
) {
  if (!supabaseAdmin) {
    return res
      .status(500)
      .json({ error: 'Database service unavailable (missing service role).' });
  }

  const { data, error } = await supabaseAdmin
    .from('tournament_stages')
    .select('*')
    .eq('tournament_id', tournamentId)
    .order('order_index', { ascending: true, nullsFirst: false });

  if (error) {
    logger.error('admin GET tournament stages error:', error);
    return res.status(500).json({ error: 'Failed to fetch tournament stages' });
  }

  return res.status(200).json({
    stages: (data || []) as Stage[],
  });
}

async function handlePost(
  tournamentId: string,
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse>,
  ctx: AuthenticatedStaffContext
) {
  if (!supabaseAdmin) {
    return res
      .status(500)
      .json({ error: 'Database service unavailable (missing service role).' });
  }

  const {
    name,
    slug,
    stage_type,
    order_index,
    is_active,
    is_public,
    start_date,
    end_date,
    settings,
  } = req.body || {};

  if (!name || typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ error: 'name is required' });
  }

  // Validation du stage_type
  const VALID_STAGE_TYPES: StageType[] = [
    'group',
    'bracket',
    'swiss',
    'round_robin',
    'showmatch',
    'other',
  ];
  if (stage_type && !VALID_STAGE_TYPES.includes(stage_type)) {
    return res.status(400).json({
      error: `Invalid stage_type. Allowed values: ${VALID_STAGE_TYPES.join(', ')}`,
    });
  }

  // Validation des dates ISO
  if (start_date && isNaN(Date.parse(start_date))) {
    return res.status(400).json({ error: 'start_date is not a valid date' });
  }
  if (end_date && isNaN(Date.parse(end_date))) {
    return res.status(400).json({ error: 'end_date is not a valid date' });
  }

  // Cohérence des dates : start_date < end_date
  if (start_date && end_date && new Date(start_date) >= new Date(end_date)) {
    return res
      .status(400)
      .json({ error: 'start_date must be before end_date' });
  }

  // Validation de order_index
  if (order_index !== undefined && order_index !== null) {
    if (
      typeof order_index !== 'number' ||
      !Number.isInteger(order_index) ||
      order_index < 0
    ) {
      return res
        .status(400)
        .json({ error: 'order_index must be an integer >= 0' });
    }
  }

  // Vérifier que le tournoi existe
  const { data: tournament, error: tournamentError } = await supabaseAdmin
    .from('tournaments')
    .select('id, name')
    .eq('id', tournamentId)
    .maybeSingle();

  if (tournamentError || !tournament) {
    return res.status(404).json({ error: 'Tournament not found' });
  }

  // Calculer order_index si non fourni
  let finalOrderIndex = order_index;
  if (finalOrderIndex === undefined || finalOrderIndex === null) {
    const { data: existingStages } = await supabaseAdmin
      .from('tournament_stages')
      .select('order_index')
      .eq('tournament_id', tournamentId)
      .order('order_index', { ascending: false })
      .limit(1);

    const maxOrder = existingStages?.[0]?.order_index ?? -1;
    finalOrderIndex = (typeof maxOrder === 'number' ? maxOrder : -1) + 1;
  }

  // Validation des settings JSON par rapport au type de stage
  const effectiveType = stage_type || 'other';
  const settingsValidation = validateStageSettings(effectiveType, settings);
  if (!settingsValidation.valid) {
    return res.status(400).json({ error: settingsValidation.error });
  }

  // Générer un slug si non fourni
  const finalSlug =
    slug ||
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

  // Créer la phase
  const { data, error } = await supabaseAdmin
    .from('tournament_stages')
    .insert({
      tournament_id: tournamentId,
      name: name.trim(),
      slug: finalSlug,
      stage_type: stage_type || 'other',
      order_index: finalOrderIndex,
      is_active: is_active ?? false,
      is_public: is_public ?? false,
      start_date: start_date || null,
      end_date: end_date || null,
      settings: settings || null,
    })
    .select('*')
    .single();

  if (error || !data) {
    logger.error('admin POST tournament stage error:', error);
    return res.status(500).json({ error: 'Failed to create stage' });
  }

  // Log staff action
  if (ctx?.staff?.id) {
    try {
      await logStaffAction({
        staff_id: ctx.staff.id,
        action: 'create_stage',
        entity_type: 'stage',
        entity_id: data.id,
        tournament_id: tournamentId,
        payload: {
          name: data.name,
          stage_type: data.stage_type,
          order_index: data.order_index,
        },
      });
    } catch (e) {
      logger.error('logStaffAction error:', e);
    }
  }

  return res.status(201).json({
    stage: data as Stage,
  });
}

async function handlePatch(
  tournamentId: string,
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse>,
  ctx: AuthenticatedStaffContext
) {
  if (!supabaseAdmin) {
    return res
      .status(500)
      .json({ error: 'Database service unavailable (missing service role).' });
  }

  const { stages } = req.body || {};

  if (!Array.isArray(stages) || stages.length === 0) {
    return res.status(400).json({
      error: 'stages must be a non-empty array of { id, order_index }',
    });
  }

  // Validate each entry
  for (const entry of stages) {
    if (!entry.id || typeof entry.id !== 'string') {
      return res
        .status(400)
        .json({ error: 'Each stage entry must have a valid id' });
    }
    if (
      typeof entry.order_index !== 'number' ||
      !Number.isInteger(entry.order_index) ||
      entry.order_index < 0
    ) {
      return res.status(400).json({
        error: 'Each stage entry must have an integer order_index >= 0',
      });
    }
  }

  // Verify the tournament exists
  const { data: tournament, error: tournamentError } = await supabaseAdmin
    .from('tournaments')
    .select('id, name')
    .eq('id', tournamentId)
    .maybeSingle();

  if (tournamentError || !tournament) {
    return res.status(404).json({ error: 'Tournament not found' });
  }

  // Update each stage's order_index
  const errors: string[] = [];
  for (const entry of stages) {
    const { error } = await supabaseAdmin
      .from('tournament_stages')
      .update({ order_index: entry.order_index })
      .eq('id', entry.id)
      .eq('tournament_id', tournamentId);

    if (error) {
      errors.push(`Failed to update stage ${entry.id}: ${error.message}`);
    }
  }

  if (errors.length > 0) {
    logger.error('admin PATCH tournament stages errors:', errors);
    return res.status(500).json({ error: 'Some stages failed to update' });
  }

  // Log staff action
  if (ctx?.staff?.id) {
    try {
      await logStaffAction({
        staff_id: ctx.staff.id,
        action: 'update_stage',
        entity_type: 'tournament',
        entity_id: tournamentId,
        tournament_id: tournamentId,
        payload: {
          stages: stages.map((s: { id: string; order_index: number }) => ({
            id: s.id,
            order_index: s.order_index,
          })),
        },
      });
    } catch (e) {
      logger.error('logStaffAction error:', e);
    }
  }

  // Return updated list
  return await handleGet(tournamentId, res);
}
