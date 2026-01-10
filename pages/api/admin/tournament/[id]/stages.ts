// pages/api/admin/tournament/[id]/stages.ts
// Admin: gestion des phases (stages) d'un tournoi
// - GET  : liste des phases du tournoi
// - POST : créer une nouvelle phase

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute } from '@/utils/staff';
import { logStaffAction } from '@/utils/staffLogs';

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
  settings: any | null;
  created_at: string;
  updated_at: string | null;
};

type ApiResponse =
  | { stages: Stage[] }
  | { stage: Stage }
  | { error: string };

export default withStaffRoute(handler, 'manager');

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse>,
  ctx: any
) {
  const { id } = req.query;

  if (!id || Array.isArray(id)) {
    return res.status(400).json({ error: 'Invalid tournament ID' });
  }

  const tournamentId = String(id);

  try {
    switch (req.method) {
      case 'GET':
        return await handleGet(tournamentId, res);
      case 'POST':
        return await handlePost(tournamentId, req, res, ctx);
      default:
        return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (err: any) {
    console.error('[/api/admin/tournament/[id]/stages] internal error:', err);
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
    return res.status(500).json({ error: 'Service Supabase indisponible (service role manquant).' });
  }

  const { data, error } = await supabaseAdmin
    .from('tournament_stages')
    .select('*')
    .eq('tournament_id', tournamentId)
    .order('order_index', { ascending: true, nullsFirst: false });

  if (error) {
    console.error('admin GET tournament stages error:', error);
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
  ctx: any
) {
  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Service Supabase indisponible (service role manquant).' });
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
    console.error('admin POST tournament stage error:', error);
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
      console.error('logStaffAction error:', e);
    }
  }

  return res.status(201).json({
    stage: data as Stage,
  });
}
