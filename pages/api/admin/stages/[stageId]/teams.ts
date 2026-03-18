// pages/api/admin/stages/[stageId]/teams.ts
// Admin: gestion des équipes d'une phase (stage)
// - GET    : liste des équipes de la phase
// - POST   : ajouter une équipe à la phase
// - PATCH  : mise à jour seed (unitaire ou bulk)
// - DELETE : retirer une ou plusieurs équipes de la phase

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute } from '@/utils/staff';
import { logStaffAction } from '@/utils/staffLogs';

export default withStaffRoute(handler, 'manager');

async function handler(req: NextApiRequest, res: NextApiResponse, ctx: any) {
  const { stageId } = req.query;

  if (!stageId || Array.isArray(stageId)) {
    return res.status(400).json({ error: 'Invalid stageId' });
  }

  try {
    switch (req.method) {
      case 'GET':
        return await handleGet(stageId, req, res);
      case 'POST':
        return await handlePost(stageId, req, res, ctx);
      case 'PATCH':
        return await handlePatch(stageId, req, res, ctx);
      case 'DELETE':
        return await handleDelete(stageId, req, res, ctx);
      default:
        return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (err: unknown) {
    console.error('[/api/admin/stages/[stageId]/teams] error:', err);
    return res.status(500).json({
      error: 'Internal server error',
    });
  }
}

/* -----------------------------------------------------------
 * GET : liste des équipes rattachées à la phase
 * ---------------------------------------------------------*/

async function handleGet(
  stageId: string,
  _req: NextApiRequest,
  res: NextApiResponse
) {
  // Récupérer la phase + tournoi
  const { data: stage, error: stageErr } = await supabaseAdmin
    .from('tournament_stages')
    .select('id, tournament_id, name, stage_type')
    .eq('id', stageId)
    .maybeSingle();

  if (stageErr || !stage) {
    return res.status(404).json({ error: 'Stage not found' });
  }

  // Récupérer le tournoi
  const { data: tournament } = await supabaseAdmin
    .from('tournaments')
    .select('id, name, slug')
    .eq('id', stage.tournament_id)
    .maybeSingle();

  // Récupérer les stage_teams avec infos équipe
  const { data: teams, error: teamsErr } = await supabaseAdmin
    .from('stage_teams')
    .select('stage_id, team_id, seed, is_substitute, notes, team:team_id(id, name, short_name, logo_url)')
    .eq('stage_id', stageId)
    .order('seed', { ascending: true, nullsFirst: false });

  if (teamsErr) {
    console.error('GET stage teams error:', teamsErr);
    return res.status(500).json({ error: 'Failed to fetch stage teams' });
  }

  return res.status(200).json({
    stageId,
    stage,
    tournament: tournament ?? null,
    teams: teams || [],
  });
}

/* -----------------------------------------------------------
 * POST : ajouter une équipe à la phase
 * Body : { teamId: string, seed?: number | null }
 * ---------------------------------------------------------*/

async function handlePost(
  stageId: string,
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: any
) {
  const { teamId, seed } = req.body;

  if (!teamId || typeof teamId !== 'string') {
    return res.status(400).json({ error: 'Missing teamId' });
  }

  // Vérifier que la phase existe et récupérer le tournoi
  const { data: stage, error: stageErr } = await supabaseAdmin
    .from('tournament_stages')
    .select('id, tournament_id')
    .eq('id', stageId)
    .maybeSingle();

  if (stageErr || !stage) {
    return res.status(404).json({ error: 'Stage not found' });
  }

  // --- Roster validation ---
  const warnings: string[] = [];

  // Fetch tournament min_players and team members in parallel
  const [tournamentRes, membersRes] = await Promise.all([
    supabaseAdmin
      .from('tournaments')
      .select('id, min_players')
      .eq('id', stage.tournament_id)
      .maybeSingle(),
    supabaseAdmin
      .from('team_members')
      .select('user_id')
      .eq('team_id', teamId),
  ]);

  const tournament = tournamentRes.data;
  const members = membersRes.data || [];
  const memberCount = members.length;

  // 1. Check min_players requirement
  if (tournament?.min_players && memberCount < tournament.min_players) {
    warnings.push(
      `Roster incomplet : ${memberCount} joueur(s) sur ${tournament.min_players} minimum requis`
    );
  }

  // 2. Check player uniqueness across all teams already registered in the tournament
  if (members.length > 0) {
    const memberUserIds = members
      .map((m: { user_id: string | null }) => m.user_id)
      .filter(Boolean) as string[];

    if (memberUserIds.length > 0) {
      // Get all stages for this tournament
      const { data: tournamentStages } = await supabaseAdmin
        .from('tournament_stages')
        .select('id')
        .eq('tournament_id', stage.tournament_id);

      const stageIds = (tournamentStages || []).map((s: { id: string }) => s.id);

      if (stageIds.length > 0) {
        // Get all teams already registered in any stage of this tournament
        const { data: registeredStageTeams } = await supabaseAdmin
          .from('stage_teams')
          .select('team_id')
          .in('stage_id', stageIds)
          .neq('team_id', teamId);

        const otherTeamIds = [
          ...new Set((registeredStageTeams || []).map((st: { team_id: string }) => st.team_id)),
        ];

        if (otherTeamIds.length > 0) {
          // Find members of other registered teams that overlap with this team's members
          const { data: duplicateMembers } = await supabaseAdmin
            .from('team_members')
            .select('user_id, team_id, teams!inner(name)')
            .in('team_id', otherTeamIds)
            .in('user_id', memberUserIds);

          if (duplicateMembers && duplicateMembers.length > 0) {
            const duplicates = duplicateMembers.map((d: any) => {
              const teamName = Array.isArray(d.teams) ? d.teams[0]?.name : d.teams?.name;
              return `user_id=${d.user_id} (équipe: ${teamName || d.team_id})`;
            });
            warnings.push(
              `Joueur(s) déjà inscrit(s) dans une autre équipe du tournoi : ${duplicates.join(', ')}`
            );
          }
        }
      }
    }
  }

  // --- Insert stage_team ---
  const { data, error } = await supabaseAdmin
    .from('stage_teams')
    .insert({
      stage_id: stageId,
      team_id: teamId,
      seed: typeof seed === 'number' ? seed : null,
      is_substitute: false,
      notes: null,
    })
    .select('*')
    .maybeSingle();

  if (error) {
    console.error('POST stage team error:', error);
    return res.status(500).json({ error: 'Failed to add team to stage' });
  }

  if (ctx?.staff?.id) {
    await logStaffAction({
      staff_id: ctx.staff.id,
      action: 'manage_team',
      entity_type: 'stage_teams',
      entity_id: stageId,
      tournament_id: stage.tournament_id,
      payload: { action: 'add', teamId, seed, warnings },
    });
  }

  return res.status(201).json({
    stageTeam: data,
    ...(warnings.length > 0 ? { warnings } : {}),
  });
}

/* -----------------------------------------------------------
 * PATCH : mise à jour seed (unitaire ou bulk)
 *
 * Unitaire : { teamId: string, seed: number | null }
 * Bulk     : { seeds: Array<{ teamId: string, seed: number | null }> }
 * ---------------------------------------------------------*/

async function handlePatch(
  stageId: string,
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: any
) {
  const { teamId, seed, seeds } = req.body;

  // Vérifier que la phase existe
  const { data: stage, error: stageErr } = await supabaseAdmin
    .from('tournament_stages')
    .select('id, tournament_id')
    .eq('id', stageId)
    .maybeSingle();

  if (stageErr || !stage) {
    return res.status(404).json({ error: 'Stage not found' });
  }

  // Mode bulk
  if (Array.isArray(seeds)) {
    const results: Array<{ teamId: string; success: boolean; error?: string }> = [];

    for (const entry of seeds) {
      if (!entry.teamId || typeof entry.teamId !== 'string') {
        results.push({ teamId: entry.teamId, success: false, error: 'Invalid teamId' });
        continue;
      }

      const seedVal = entry.seed === null || entry.seed === undefined ? null : Number(entry.seed);

      const { error: updErr } = await supabaseAdmin
        .from('stage_teams')
        .update({ seed: seedVal })
        .eq('stage_id', stageId)
        .eq('team_id', entry.teamId);

      if (updErr) {
        results.push({ teamId: entry.teamId, success: false, error: updErr.message });
      } else {
        results.push({ teamId: entry.teamId, success: true });
      }
    }

    if (ctx?.staff?.id) {
      await logStaffAction({
        staff_id: ctx.staff.id,
        action: 'manage_team',
        entity_type: 'stage_teams',
        entity_id: stageId,
        tournament_id: stage.tournament_id,
        payload: { action: 'bulk_seed', count: seeds.length, seeds },
      });
    }

    return res.status(200).json({ bulk: true, results });
  }

  // Mode unitaire
  if (!teamId || typeof teamId !== 'string') {
    return res.status(400).json({ error: 'Missing teamId' });
  }

  const seedVal = seed === null || seed === undefined ? null : Number(seed);

  const { data, error } = await supabaseAdmin
    .from('stage_teams')
    .update({ seed: seedVal })
    .eq('stage_id', stageId)
    .eq('team_id', teamId)
    .select('*')
    .maybeSingle();

  if (error) {
    console.error('PATCH stage team error:', error);
    return res.status(500).json({ error: 'Failed to update seed' });
  }

  if (ctx?.staff?.id) {
    await logStaffAction({
      staff_id: ctx.staff.id,
      action: 'manage_team',
      entity_type: 'stage_teams',
      entity_id: stageId,
      tournament_id: stage.tournament_id,
      payload: { action: 'update_seed', teamId, seed: seedVal },
    });
  }

  return res.status(200).json({ stageTeam: data });
}

/* -----------------------------------------------------------
 * DELETE : retirer une ou plusieurs équipes
 *
 * Unitaire : { teamId: string }
 * Bulk     : { teamIds: string[] }
 * ---------------------------------------------------------*/

async function handleDelete(
  stageId: string,
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: any
) {
  const { teamId, teamIds } = req.body;

  // Vérifier que la phase existe
  const { data: stage, error: stageErr } = await supabaseAdmin
    .from('tournament_stages')
    .select('id, tournament_id')
    .eq('id', stageId)
    .maybeSingle();

  if (stageErr || !stage) {
    return res.status(404).json({ error: 'Stage not found' });
  }

  // Resolve list of team IDs to remove
  const idsToRemove: string[] = Array.isArray(teamIds) && teamIds.length > 0
    ? teamIds
    : teamId && typeof teamId === 'string'
      ? [teamId]
      : [];

  if (idsToRemove.length === 0) {
    return res.status(400).json({ error: 'Missing teamId or teamIds' });
  }

  // Clean up matches referencing these teams in the same stage
  // Nullify team slots rather than deleting matches (preserves bracket structure)
  const [cleanT1, cleanT2] = await Promise.all([
    supabaseAdmin
      .from('matches')
      .update({ team1_id: null, team1_score: null, winner_team_id: null })
      .eq('stage_id', stageId)
      .in('team1_id', idsToRemove),
    supabaseAdmin
      .from('matches')
      .update({ team2_id: null, team2_score: null, winner_team_id: null })
      .eq('stage_id', stageId)
      .in('team2_id', idsToRemove),
  ]);

  if (cleanT1.error) {
    console.error('cleanup matches team1 error:', cleanT1.error);
  }
  if (cleanT2.error) {
    console.error('cleanup matches team2 error:', cleanT2.error);
  }

  // Delete the stage_teams entries
  const { error } = await supabaseAdmin
    .from('stage_teams')
    .delete()
    .eq('stage_id', stageId)
    .in('team_id', idsToRemove);

  if (error) {
    console.error('DELETE stage teams error:', error);
    return res.status(500).json({ error: 'Failed to remove teams' });
  }

  const isBulk = Array.isArray(teamIds) && teamIds.length > 0;

  if (ctx?.staff?.id) {
    await logStaffAction({
      staff_id: ctx.staff.id,
      action: 'manage_team',
      entity_type: 'stage_teams',
      entity_id: stageId,
      tournament_id: stage.tournament_id,
      payload: isBulk
        ? { action: 'bulk_remove', teamIds: idsToRemove }
        : { action: 'remove', teamId: idsToRemove[0] },
    });
  }

  return res.status(200).json({
    success: true,
    ...(isBulk ? { removed: idsToRemove.length } : {}),
  });
}
