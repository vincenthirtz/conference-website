// pages/api/admin/tournament/[id]/teams.ts
// Admin: gestion des équipes inscrites à un tournoi
// - GET  : liste des équipes du tournoi
// - POST : ajouter une équipe au tournoi

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute } from '@/utils/staff';
import { logStaffAction } from '@/utils/staffLogs';

type TournamentTeam = {
  id: string;
  tournament_id: string;
  team_id: string;
  seed: number | null;
  status: string | null;
  created_at: string;
  team: {
    id: string;
    name: string;
    logo_url: string | null;
  };
};

type ApiResponse =
  | { teams: TournamentTeam[] }
  | { team: TournamentTeam }
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
    console.error('[/api/admin/tournament/[id]/teams] internal error:', err);
    return res.status(500).json({
      error: 'Internal server error',
    });
  }
}

async function handleGet(
  tournamentId: string,
  res: NextApiResponse<ApiResponse>
) {
  const { data, error } = await supabaseAdmin
    .from('tournament_teams')
    .select(
      `
      id,
      tournament_id,
      team_id,
      seed,
      status,
      created_at,
      team:teams (
        id,
        name,
        logo_url
      )
    `
    )
    .eq('tournament_id', tournamentId)
    .order('seed', { ascending: true, nullsFirst: false });

  if (error) {
    console.error('admin GET tournament teams error:', error);
    return res.status(500).json({ error: 'Failed to fetch tournament teams' });
  }

  return res.status(200).json({
    teams: (data || []) as unknown as TournamentTeam[],
  });
}

async function handlePost(
  tournamentId: string,
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse>,
  ctx: any
) {
  const { team_id, seed, status } = req.body || {};

  if (!team_id) {
    return res.status(400).json({ error: 'team_id is required' });
  }

  // Vérifier que le tournoi existe
  const { data: tournament, error: tournamentError } = await supabaseAdmin
    .from('tournaments')
    .select('id, name, max_teams')
    .eq('id', tournamentId)
    .maybeSingle();

  if (tournamentError || !tournament) {
    return res.status(404).json({ error: 'Tournament not found' });
  }

  // Vérifier que l'équipe existe
  const { data: team, error: teamError } = await supabaseAdmin
    .from('teams')
    .select('id, name')
    .eq('id', team_id)
    .maybeSingle();

  if (teamError || !team) {
    return res.status(404).json({ error: 'Team not found' });
  }

  // Vérifier que l'équipe n'est pas déjà inscrite
  const { data: existing } = await supabaseAdmin
    .from('tournament_teams')
    .select('id')
    .eq('tournament_id', tournamentId)
    .eq('team_id', team_id)
    .maybeSingle();

  if (existing) {
    return res.status(400).json({ error: 'Team already registered in this tournament' });
  }

  // Vérifier le nombre max d'équipes si défini
  if (tournament.max_teams) {
    const { count } = await supabaseAdmin
      .from('tournament_teams')
      .select('id', { count: 'exact', head: true })
      .eq('tournament_id', tournamentId);

    if (count && count >= tournament.max_teams) {
      return res.status(400).json({ error: 'Tournament has reached maximum team capacity' });
    }
  }

  // Ajouter l'équipe au tournoi
  const { data, error } = await supabaseAdmin
    .from('tournament_teams')
    .insert({
      tournament_id: tournamentId,
      team_id,
      seed: seed ?? null,
      status: status ?? 'registered',
    })
    .select(
      `
      id,
      tournament_id,
      team_id,
      seed,
      status,
      created_at,
      team:teams (
        id,
        name,
        logo_url,
        is_active
      )
    `
    )
    .single();

  if (error || !data) {
    console.error('admin POST tournament team error:', error);
    return res.status(500).json({ error: 'Failed to add team to tournament' });
  }

  // Log staff action
  if (ctx?.staff?.id) {
    try {
      await logStaffAction({
        staff_id: ctx.staff.id,
        action: 'add_team_to_tournament',
        entity_type: 'tournament_team',
        entity_id: data.id,
        tournament_id: tournamentId,
        payload: {
          team_id,
          team_name: team.name,
          seed,
        },
      });
    } catch (e) {
      console.error('logStaffAction error:', e);
    }
  }

  return res.status(201).json({
    team: data as unknown as TournamentTeam,
  });
}
