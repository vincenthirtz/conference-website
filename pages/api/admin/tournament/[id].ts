// @ts-nocheck
// pages/api/admin/tournament/[id].ts
// Admin: détails d'un tournoi + modification du statut
// - GET  : récupérer les détails
// - PATCH: modifier le statut (et autres champs)

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute } from '@/utils/staff';
import { logStaffAction } from '@/utils/staffLogs';

type TournamentDetail = {
  id: string;
  name: string;
  slug: string | null;
  game: string | null;
  status: string | null;
  start_date: string | null;
  end_date: string | null;
  max_teams: number | null;
  created_at: string;
  updated_at: string | null;
};

type ApiResponse =
  | { tournament: TournamentDetail }
  | { error: string }
  | { success: boolean; tournament: TournamentDetail };

const VALID_STATUSES = ['draft', 'published', 'running', 'completed', 'archived'];

// Rôle minimum : manager
export default withStaffRoute(handler, 'manager');

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse>,
  ctx: any
) {
  const { id } = req.query;

  if (!id || Array.isArray(id)) {
    return res.status(400).json({ error: 'Missing tournament id' });
  }

  switch (req.method) {
    case 'GET':
      return handleGet(req, res, id);
    case 'PATCH':
      return handlePatch(req, res, id, ctx);
    default:
      res.setHeader('Allow', 'GET,PATCH');
      return res.status(405).json({ error: 'Method not allowed' });
  }
}

async function handleGet(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse>,
  id: string
) {
  try {
    const { data, error } = await supabaseAdmin!
      .from('tournaments')
      .select(
        `
        id,
        name,
        slug,
        game,
        status,
        start_date,
        end_date,
        max_teams,
        created_at,
        updated_at
      `
      )
      .eq('id', id)
      .maybeSingle();

    if (error) {
      console.error('admin GET tournament error:', error);
      return res.status(500).json({ error: 'Failed to fetch tournament' });
    }

    if (!data) {
      return res.status(404).json({ error: 'Tournament not found' });
    }

    return res.status(200).json({ tournament: data as TournamentDetail });
  } catch (err: any) {
    console.error('admin GET tournament internal error:', err);
    return res
      .status(500)
      .json({ error: err?.message || 'Internal server error' });
  }
}

async function handlePatch(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse>,
  id: string,
  ctx: any
) {
  try {
    const { status } = req.body;

    // Valider le statut si fourni
    if (status !== undefined) {
      if (!VALID_STATUSES.includes(status)) {
        return res.status(400).json({
          error: `Statut invalide. Valeurs acceptées : ${VALID_STATUSES.join(', ')}`,
        });
      }
    }

    // Récupérer l'état avant modification
    const { data: before, error: fetchErr } = await supabaseAdmin!
      .from('tournaments')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (fetchErr || !before) {
      return res.status(404).json({ error: 'Tournament not found' });
    }

    // Construire l'objet de mise à jour
    const updatePayload: Record<string, any> = {};

    if (status !== undefined) {
      updatePayload.status = status;
    }

    // Si rien à mettre à jour
    if (Object.keys(updatePayload).length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    // Mise à jour
    const { data: after, error: updateErr } = await supabaseAdmin!
      .from('tournaments')
      .update(updatePayload)
      .eq('id', id)
      .select(
        `
        id,
        name,
        slug,
        game,
        status,
        start_date,
        end_date,
        max_teams,
        created_at,
        updated_at
      `
      )
      .single();

    if (updateErr) {
      console.error('admin PATCH tournament error:', updateErr);
      return res.status(500).json({ error: 'Failed to update tournament' });
    }

    // Log de l'action staff
    const staffId = ctx.staff?.id;
    if (staffId) {
      try {
        await logStaffAction({
          staff_id: staffId,
          action: 'tournament_update',
          entity_type: 'tournament',
          entity_id: id,
          tournament_id: id,
          payload: {
            changes: updatePayload,
            before: { status: before.status },
            after: { status: after.status },
          },
        });
      } catch (logErr) {
        console.error('admin PATCH tournament logStaffAction error:', logErr);
      }
    }

    return res.status(200).json({
      success: true,
      tournament: after as TournamentDetail,
    });
  } catch (err: any) {
    console.error('admin PATCH tournament internal error:', err);
    return res
      .status(500)
      .json({ error: err?.message || 'Internal server error' });
  }
}
