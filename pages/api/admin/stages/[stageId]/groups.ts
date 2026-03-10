// pages/api/admin/stages/[stageId]/groups.ts
// Admin: gestion des groupes/poules d'une phase (group ou round_robin).
// - GET  : retourne les assignations actuelles (groupes + equipes non assignees)
// - PUT  : sauvegarde les assignations en bulk
// - POST : auto-distribution des equipes en N poules

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute } from '@/utils/staff';
import { logStaffAction } from '@/utils/staffLogs';

type TeamInfo = {
  teamId: string;
  name: string;
  shortName: string | null;
  logoUrl: string | null;
  seed: number | null;
};

export default withStaffRoute(handler, 'manager');

async function handler(req: NextApiRequest, res: NextApiResponse, ctx: any) {
  const { stageId } = req.query;

  if (!stageId || Array.isArray(stageId)) {
    return res.status(400).json({ error: 'Invalid stageId' });
  }

  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Database service unavailable (missing service role).' });
  }

  try {
    switch (req.method) {
      case 'GET':
        return await handleGet(String(stageId), res);
      case 'PUT':
        return await handlePut(String(stageId), req, res, ctx);
      case 'POST':
        return await handlePost(String(stageId), req, res, ctx);
      default:
        return res.status(405).json({ error: 'Method not allowed' });
    }
  } catch (err: any) {
    console.error('[/api/admin/stages/[stageId]/groups] error:', err);
    return res.status(500).json({ error: 'Internal server error', detail: err?.message });
  }
}

/* -----------------------------------------------------------
 * GET : retourne les assignations de groupes
 * ---------------------------------------------------------*/

async function handleGet(stageId: string, res: NextApiResponse) {
  // Verify stage exists and is group/round_robin type
  const { data: stage, error: stageErr } = await supabaseAdmin!
    .from('tournament_stages')
    .select('id, tournament_id, stage_type, settings')
    .eq('id', stageId)
    .maybeSingle();

  if (stageErr || !stage) {
    return res.status(404).json({ error: 'Stage not found' });
  }

  if (!['group', 'round_robin'].includes(stage.stage_type || '')) {
    return res.status(400).json({
      error: 'This endpoint is only for group or round_robin stages.',
    });
  }

  // Fetch stage_teams with team info
  const { data: stageTeams, error: teamsErr } = await supabaseAdmin!
    .from('stage_teams')
    .select('team_id, seed, team:team_id(id, name, short_name, logo_url)')
    .eq('stage_id', stageId)
    .order('seed', { ascending: true, nullsFirst: false });

  if (teamsErr) {
    return res.status(500).json({ error: 'Failed to fetch stage teams' });
  }

  // Get group_assignments from settings, or compute from matches
  const groupAssignments: Record<string, string[]> =
    stage.settings?.group_assignments || {};

  // Build team info map
  const teamInfoMap = new Map<string, TeamInfo>();
  for (const st of stageTeams || []) {
    const team = st.team as any;
    teamInfoMap.set(st.team_id, {
      teamId: st.team_id,
      name: team?.name || st.team_id.slice(0, 8),
      shortName: team?.short_name || null,
      logoUrl: team?.logo_url || null,
      seed: st.seed,
    });
  }

  // Build groups from assignments
  const groups: Record<string, TeamInfo[]> = {};
  const assignedTeamIds = new Set<string>();

  for (const [groupKey, teamIds] of Object.entries(groupAssignments)) {
    groups[groupKey] = [];
    for (const tid of teamIds) {
      const info = teamInfoMap.get(tid);
      if (info) {
        groups[groupKey].push(info);
        assignedTeamIds.add(tid);
      }
    }
  }

  // If no assignments in settings, try to infer from matches
  if (Object.keys(groupAssignments).length === 0) {
    const { data: matches } = await supabaseAdmin!
      .from('matches')
      .select('team1_id, team2_id, group_key')
      .eq('stage_id', stageId)
      .neq('status', 'cancelled')
      .not('group_key', 'is', null);

    if (matches && matches.length > 0) {
      for (const m of matches) {
        const gk = m.group_key;
        if (!gk) continue;
        if (!groups[gk]) groups[gk] = [];

        for (const tid of [m.team1_id, m.team2_id]) {
          if (tid && !assignedTeamIds.has(tid)) {
            const info = teamInfoMap.get(tid);
            if (info) {
              groups[gk].push(info);
              assignedTeamIds.add(tid);
            }
          }
        }
      }
    }
  }

  // Unassigned teams
  const unassigned: TeamInfo[] = [];
  for (const [tid, info] of teamInfoMap) {
    if (!assignedTeamIds.has(tid)) {
      unassigned.push(info);
    }
  }

  return res.status(200).json({
    stageId,
    groups,
    unassigned,
  });
}

/* -----------------------------------------------------------
 * PUT : sauvegarde les assignations en bulk
 * Body : { assignments: Array<{ teamId: string, groupKey: string | null }> }
 * ---------------------------------------------------------*/

async function handlePut(
  stageId: string,
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: any
) {
  const { assignments } = req.body || {};

  if (!Array.isArray(assignments)) {
    return res.status(400).json({ error: 'assignments must be an array' });
  }

  // Verify stage
  const { data: stage, error: stageErr } = await supabaseAdmin!
    .from('tournament_stages')
    .select('id, tournament_id, stage_type, settings')
    .eq('id', stageId)
    .maybeSingle();

  if (stageErr || !stage) {
    return res.status(404).json({ error: 'Stage not found' });
  }

  if (!['group', 'round_robin'].includes(stage.stage_type || '')) {
    return res.status(400).json({
      error: 'This endpoint is only for group or round_robin stages.',
    });
  }

  // Build group_assignments map from the input
  const groupAssignments: Record<string, string[]> = {};
  for (const entry of assignments) {
    if (!entry.teamId || typeof entry.teamId !== 'string') continue;
    if (entry.groupKey && typeof entry.groupKey === 'string') {
      if (!groupAssignments[entry.groupKey]) {
        groupAssignments[entry.groupKey] = [];
      }
      groupAssignments[entry.groupKey].push(entry.teamId);
    }
  }

  // Update matches group_key where applicable
  for (const entry of assignments) {
    if (!entry.teamId) continue;
    const gk = entry.groupKey || null;

    // Update matches where this team is team1 or team2
    await supabaseAdmin!
      .from('matches')
      .update({ group_key: gk })
      .eq('stage_id', stageId)
      .eq('team1_id', entry.teamId);

    await supabaseAdmin!
      .from('matches')
      .update({ group_key: gk })
      .eq('stage_id', stageId)
      .eq('team2_id', entry.teamId);
  }

  // Save group_assignments in stage settings
  const updatedSettings = {
    ...(stage.settings || {}),
    group_assignments: groupAssignments,
  };

  await supabaseAdmin!
    .from('tournament_stages')
    .update({
      settings: updatedSettings,
      updated_at: new Date().toISOString(),
    })
    .eq('id', stageId);

  // Log
  if (ctx?.staff?.id) {
    try {
      await logStaffAction({
        staff_id: ctx.staff.id,
        action: 'update_group_assignments',
        entity_type: 'stage',
        entity_id: stageId,
        tournament_id: stage.tournament_id,
        payload: { group_assignments: groupAssignments },
      });
    } catch (e) {
      console.error('groups PUT logStaffAction error:', e);
    }
  }

  return res.status(200).json({
    stageId,
    groupAssignments,
    success: true,
  });
}

/* -----------------------------------------------------------
 * POST : auto-distribution des equipes en N poules
 * Body : { numGroups: number, method: 'snake' | 'random' }
 * ---------------------------------------------------------*/

async function handlePost(
  stageId: string,
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: any
) {
  const { numGroups, method = 'snake' } = req.body || {};

  if (!numGroups || typeof numGroups !== 'number' || numGroups < 1 || numGroups > 32) {
    return res.status(400).json({ error: 'numGroups must be between 1 and 32' });
  }

  if (!['snake', 'random'].includes(method)) {
    return res.status(400).json({ error: "method must be 'snake' or 'random'" });
  }

  // Verify stage
  const { data: stage, error: stageErr } = await supabaseAdmin!
    .from('tournament_stages')
    .select('id, tournament_id, stage_type, settings')
    .eq('id', stageId)
    .maybeSingle();

  if (stageErr || !stage) {
    return res.status(404).json({ error: 'Stage not found' });
  }

  if (!['group', 'round_robin'].includes(stage.stage_type || '')) {
    return res.status(400).json({
      error: 'This endpoint is only for group or round_robin stages.',
    });
  }

  // Fetch stage teams sorted by seed
  const { data: stageTeams, error: teamsErr } = await supabaseAdmin!
    .from('stage_teams')
    .select('team_id, seed, team:team_id(id, name, short_name, logo_url)')
    .eq('stage_id', stageId)
    .order('seed', { ascending: true, nullsFirst: false });

  if (teamsErr) {
    return res.status(500).json({ error: 'Failed to fetch stage teams' });
  }

  if (!stageTeams || stageTeams.length === 0) {
    return res.status(400).json({ error: 'No teams in this stage' });
  }

  // Build ordered list
  let teams = stageTeams.map((st) => {
    const team = st.team as any;
    return {
      teamId: st.team_id,
      name: team?.name || st.team_id.slice(0, 8),
      shortName: team?.short_name || null,
      logoUrl: team?.logo_url || null,
      seed: st.seed,
    } as TeamInfo;
  });

  if (method === 'random') {
    // Fisher-Yates shuffle
    for (let i = teams.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [teams[i], teams[j]] = [teams[j], teams[i]];
    }
  }

  // Generate group keys: A, B, C, ...
  const groupKeys: string[] = [];
  for (let i = 0; i < numGroups; i++) {
    groupKeys.push(String.fromCharCode(65 + i));
  }

  // Distribute teams using snake seeding
  const groups: Record<string, TeamInfo[]> = {};
  const groupAssignments: Record<string, string[]> = {};
  for (const gk of groupKeys) {
    groups[gk] = [];
    groupAssignments[gk] = [];
  }

  for (let i = 0; i < teams.length; i++) {
    // Snake: 0,1,2,...,N-1,N-1,...,2,1,0,0,1,...
    const cycle = Math.floor(i / numGroups);
    const pos = i % numGroups;
    const groupIdx = cycle % 2 === 0 ? pos : numGroups - 1 - pos;
    const gk = groupKeys[groupIdx];

    groups[gk].push(teams[i]);
    groupAssignments[gk].push(teams[i].teamId);
  }

  // Save to settings
  const updatedSettings = {
    ...(stage.settings || {}),
    group_assignments: groupAssignments,
    num_groups: numGroups,
  };

  await supabaseAdmin!
    .from('tournament_stages')
    .update({
      settings: updatedSettings,
      updated_at: new Date().toISOString(),
    })
    .eq('id', stageId);

  // Also update group_key on existing matches
  for (const [gk, teamIds] of Object.entries(groupAssignments)) {
    for (const tid of teamIds) {
      await supabaseAdmin!
        .from('matches')
        .update({ group_key: gk })
        .eq('stage_id', stageId)
        .eq('team1_id', tid);

      await supabaseAdmin!
        .from('matches')
        .update({ group_key: gk })
        .eq('stage_id', stageId)
        .eq('team2_id', tid);
    }
  }

  // Log
  if (ctx?.staff?.id) {
    try {
      await logStaffAction({
        staff_id: ctx.staff.id,
        action: 'auto_distribute_groups',
        entity_type: 'stage',
        entity_id: stageId,
        tournament_id: stage.tournament_id,
        payload: {
          num_groups: numGroups,
          method,
          group_assignments: groupAssignments,
        },
      });
    } catch (e) {
      console.error('groups POST logStaffAction error:', e);
    }
  }

  return res.status(200).json({
    stageId,
    groups,
    unassigned: [],
    groupAssignments,
  });
}
