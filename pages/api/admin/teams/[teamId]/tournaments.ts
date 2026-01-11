import type { NextApiRequest, NextApiResponse } from 'next';
import { withStaffRoute } from '@/utils/staff';
import { supabaseAdmin } from '@/utils/supabase';
import { logStaffAction } from '@/utils/staff';

/**
 * GET /api/admin/teams/[teamId]/tournaments
 * Retrieve tournaments a team is registered for and available tournaments
 *
 * POST /api/admin/teams/[teamId]/tournaments
 * Register a team to a tournament (creates entry in tournament_stage_teams for all stages or first stage)
 * Body: { tournamentId: string, stageId?: string }
 *
 * DELETE /api/admin/teams/[teamId]/tournaments
 * Unregister a team from a tournament (removes from all stages)
 * Body: { tournamentId: string }
 */

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const { teamId } = req.query;

  if (!teamId || typeof teamId !== 'string') {
    return res.status(400).json({ error: 'teamId requis' });
  }

  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Configuration Supabase manquante' });
  }

  // Verify team exists
  const { data: team, error: teamError } = await supabaseAdmin
    .from('teams')
    .select('id, name')
    .eq('id', teamId)
    .single();

  if (teamError || !team) {
    return res.status(404).json({ error: 'Équipe non trouvée' });
  }

  if (req.method === 'GET') {
    return handleGet(req, res, teamId);
  } else if (req.method === 'POST') {
    return handlePost(req, res, teamId, team.name);
  } else if (req.method === 'DELETE') {
    return handleDelete(req, res, teamId, team.name);
  } else {
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }
}

async function handleGet(req: NextApiRequest, res: NextApiResponse, teamId: string) {
  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Configuration Supabase manquante' });
  }

  try {
    // Get all published tournaments
    const { data: allTournaments, error: tournamentsError } = await supabaseAdmin
      .from('tournaments')
      .select('id, name, slug, game, status, start_date, end_date, max_teams')
      .eq('status', 'published')
      .order('start_date', { ascending: false });

    if (tournamentsError) {
      throw tournamentsError;
    }

    // Get tournaments the team is registered for (via tournament_stage_teams)
    const { data: registrations, error: registrationsError } = await supabaseAdmin
      .from('tournament_stage_teams')
      .select(`
        stage_id,
        team_id,
        tournament_stages!inner(
          id,
          tournament_id,
          name,
          stage_type,
          tournaments!inner(
            id,
            name,
            slug,
            game,
            status,
            start_date,
            end_date
          )
        )
      `)
      .eq('team_id', teamId);

    if (registrationsError) {
      throw registrationsError;
    }

    // Group registrations by tournament
    const registeredTournamentIds = new Set<string>();
    const tournamentRegistrations: Record<string, any[]> = {};

    registrations?.forEach((reg: any) => {
      const tournament = reg.tournament_stages?.tournaments;
      if (tournament) {
        registeredTournamentIds.add(tournament.id);
        if (!tournamentRegistrations[tournament.id]) {
          tournamentRegistrations[tournament.id] = [];
        }
        tournamentRegistrations[tournament.id].push({
          stageId: reg.stage_id,
          stageName: reg.tournament_stages?.name,
          stageType: reg.tournament_stages?.stage_type,
        });
      }
    });

    // Separate registered and available tournaments
    const registered = (allTournaments || [])
      .filter(t => registeredTournamentIds.has(t.id))
      .map(t => ({
        ...t,
        stages: tournamentRegistrations[t.id] || [],
      }));

    const available = (allTournaments || [])
      .filter(t => !registeredTournamentIds.has(t.id));

    return res.status(200).json({
      teamId,
      registered,
      available,
    });
  } catch (err: any) {
    console.error('GET /api/admin/teams/[teamId]/tournaments error:', err);
    return res.status(500).json({ error: err.message || 'Erreur serveur' });
  }
}

async function handlePost(
  req: NextApiRequest,
  res: NextApiResponse,
  teamId: string,
  teamName: string
) {
  const { tournamentId, stageId } = req.body;

  if (!tournamentId || typeof tournamentId !== 'string') {
    return res.status(400).json({ error: 'tournamentId requis' });
  }

  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Configuration Supabase manquante' });
  }

  try {
    // Verify tournament exists and is published
    const { data: tournament, error: tournamentError } = await supabaseAdmin
      .from('tournaments')
      .select('id, name, status, max_teams, min_players')
      .eq('id', tournamentId)
      .single();

    if (tournamentError || !tournament) {
      return res.status(404).json({ error: 'Tournoi non trouvé' });
    }

    if (tournament.status !== 'published') {
      return res.status(400).json({ error: 'Le tournoi doit être publié pour y inscrire une équipe' });
    }

    // Check if team has enough players (min_players validation)
    if (tournament.min_players) {
      const { count: playerCount, error: countPlayersError } = await supabaseAdmin
        .from('team_members')
        .select('*', { count: 'exact', head: true })
        .eq('team_id', teamId);

      if (countPlayersError) {
        throw countPlayersError;
      }

      if ((playerCount || 0) < tournament.min_players) {
        return res.status(400).json({
          error: `L'équipe doit avoir au moins ${tournament.min_players} joueuse(s) pour s'inscrire à ce tournoi. Actuellement: ${playerCount || 0} membre(s).`
        });
      }
    }

    // Check if max_teams limit is reached
    if (tournament.max_teams) {
      const { data: existingTeams, error: countError } = await supabaseAdmin
        .from('tournament_stage_teams')
        .select('team_id, tournament_stages!inner(tournament_id)')
        .eq('tournament_stages.tournament_id', tournamentId);

      if (countError) {
        throw countError;
      }

      const uniqueTeams = new Set(existingTeams?.map(t => t.team_id) || []);
      if (uniqueTeams.size >= tournament.max_teams) {
        return res.status(400).json({
          error: `Le tournoi a atteint la limite de ${tournament.max_teams} équipes`
        });
      }
    }

    let targetStageIds: string[] = [];

    if (stageId) {
      // Specific stage provided
      const { data: stage, error: stageError } = await supabaseAdmin
        .from('tournament_stages')
        .select('id, tournament_id')
        .eq('id', stageId)
        .eq('tournament_id', tournamentId)
        .single();

      if (stageError || !stage) {
        return res.status(404).json({ error: 'Stage non trouvé pour ce tournoi' });
      }

      targetStageIds = [stageId];
    } else {
      // Get all stages for the tournament
      const { data: stages, error: stagesError } = await supabaseAdmin
        .from('tournament_stages')
        .select('id')
        .eq('tournament_id', tournamentId);

      if (stagesError) {
        throw stagesError;
      }

      if (!stages || stages.length === 0) {
        return res.status(400).json({
          error: 'Le tournoi n\'a pas de stages. Créez un stage d\'abord.'
        });
      }

      targetStageIds = stages.map(s => s.id);
    }

    // Check if team is already registered to any of these stages
    const { data: existingRegistrations, error: existingError } = await supabaseAdmin
      .from('tournament_stage_teams')
      .select('stage_id')
      .eq('team_id', teamId)
      .in('stage_id', targetStageIds);

    if (existingError) {
      throw existingError;
    }

    if (existingRegistrations && existingRegistrations.length > 0) {
      return res.status(400).json({
        error: 'L\'équipe est déjà inscrite à ce tournoi'
      });
    }

    // Insert into tournament_stage_teams for each stage
    const insertData = targetStageIds.map(stgId => ({
      stage_id: stgId,
      team_id: teamId,
    }));

    const { data: inserted, error: insertError } = await supabaseAdmin
      .from('tournament_stage_teams')
      .insert(insertData)
      .select();

    if (insertError) {
      throw insertError;
    }

    // Log staff action
    const staffContext = (req as any).staffContext;
    if (staffContext?.staff?.id) {
      await logStaffAction({
        staff_id: staffContext.staff.id,
        action: 'update_team',
        entity_type: 'team',
        entity_id: teamId,
        tournament_id: tournamentId,
        payload: {
          action_type: 'tournament_registration',
          team_name: teamName,
          tournament_name: tournament.name,
          stage_ids: targetStageIds,
        },
      });
    }

    return res.status(201).json({
      success: true,
      message: `Équipe inscrite à ${targetStageIds.length} stage(s)`,
      registrations: inserted,
    });
  } catch (err: any) {
    console.error('POST /api/admin/teams/[teamId]/tournaments error:', err);
    return res.status(500).json({ error: err.message || 'Erreur serveur' });
  }
}

async function handleDelete(
  req: NextApiRequest,
  res: NextApiResponse,
  teamId: string,
  teamName: string
) {
  const { tournamentId } = req.body;

  if (!tournamentId || typeof tournamentId !== 'string') {
    return res.status(400).json({ error: 'tournamentId requis' });
  }

  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Configuration Supabase manquante' });
  }

  try {
    // Get tournament name for logging
    const { data: tournament, error: tournamentError } = await supabaseAdmin
      .from('tournaments')
      .select('name')
      .eq('id', tournamentId)
      .single();

    if (tournamentError || !tournament) {
      return res.status(404).json({ error: 'Tournoi non trouvé' });
    }

    // Get all stages for this tournament
    const { data: stages, error: stagesError } = await supabaseAdmin
      .from('tournament_stages')
      .select('id')
      .eq('tournament_id', tournamentId);

    if (stagesError) {
      throw stagesError;
    }

    if (!stages || stages.length === 0) {
      return res.status(200).json({
        success: true,
        message: 'Aucun stage trouvé pour ce tournoi',
      });
    }

    const stageIds = stages.map(s => s.id);

    // Delete from tournament_stage_teams
    const { error: deleteError, count } = await supabaseAdmin
      .from('tournament_stage_teams')
      .delete({ count: 'exact' })
      .eq('team_id', teamId)
      .in('stage_id', stageIds);

    if (deleteError) {
      throw deleteError;
    }

    // Log staff action
    const staffContext = (req as any).staffContext;
    if (staffContext?.staff?.id) {
      await logStaffAction({
        staff_id: staffContext.staff.id,
        action: 'update_team',
        entity_type: 'team',
        entity_id: teamId,
        tournament_id: tournamentId,
        payload: {
          action_type: 'tournament_unregistration',
          team_name: teamName,
          tournament_name: tournament.name,
          stage_ids: stageIds,
          deleted_count: count,
        },
      });
    }

    return res.status(200).json({
      success: true,
      message: `Équipe désinscrite (${count || 0} entrée(s) supprimée(s))`,
    });
  } catch (err: any) {
    console.error('DELETE /api/admin/teams/[teamId]/tournaments error:', err);
    return res.status(500).json({ error: err.message || 'Erreur serveur' });
  }
}

export default withStaffRoute(handler, 'manager');
