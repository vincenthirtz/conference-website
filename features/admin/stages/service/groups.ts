// features/admin/stages/service/groups.ts — poules d'une phase `group` /
// `round_robin` : lecture des assignations, sauvegarde, distribution
// automatique (serpentin ou aléatoire) et génération des matchs round-robin
// (utils/groups/roundRobin).
//
// Les assignations vivent dans `settings.group_assignments` ; `group_key` des
// matchs existants est réaligné à chaque écriture.

import type { ServiceContext } from '@/utils/admin/serviceContext';
import type { Json } from '@/types/database.generated';
import { generateRoundRobinPairings } from '@/utils/groups/roundRobin';
import { oneRelation, type Relation } from '@/utils/supabase/relation';
import type { Audited } from '../../_shared/audited';
import * as stages from '../repository/stages';
import * as matches from '../repository/matches';
import { fail, settingsOf, settingsOrNull, stageNotFound } from './common';

type Body = Record<string, unknown>;

type GroupTeamInfo = {
  id: string;
  name: string | null;
  short_name: string | null;
  logo_url: string | null;
};
type TeamInfo = {
  teamId: string;
  name: string;
  shortName: string | null;
  logoUrl: string | null;
  seed: number | null;
};

const GROUP_TYPES = ['group', 'round_robin'];

async function loadGroupStage(ctx: ServiceContext, stageId: string) {
  const { row: stage, error } = await stages.getStageCore(
    ctx.db,
    ctx.tenantId,
    stageId
  );
  if (error || !stage) throw stageNotFound();
  if (!GROUP_TYPES.includes(stage.stage_type || '')) {
    throw fail(400, 'This endpoint is only for group or round_robin stages.');
  }
  return stage;
}

function toTeamInfo(st: {
  team_id: string;
  seed: number | null;
  team: unknown;
}): TeamInfo {
  const team = oneRelation(st.team as Relation<GroupTeamInfo>);
  return {
    teamId: st.team_id,
    name: team?.name || st.team_id.slice(0, 8),
    shortName: team?.short_name || null,
    logoUrl: team?.logo_url || null,
    seed: st.seed,
  };
}

/** Réaligne `group_key` sur les matchs où l'équipe est team1 ou team2. */
async function setTeamGroupKey(
  ctx: ServiceContext,
  stageId: string,
  teamId: string,
  groupKey: string | null
) {
  await matches.setGroupKeyForTeam(
    ctx.db,
    ctx.tenantId,
    stageId,
    'team1_id',
    teamId,
    groupKey
  );
  await matches.setGroupKeyForTeam(
    ctx.db,
    ctx.tenantId,
    stageId,
    'team2_id',
    teamId,
    groupKey
  );
}

/* --------------------------------- GET ---------------------------------- */

export async function getGroups(ctx: ServiceContext, stageId: string) {
  const stage = await loadGroupStage(ctx, stageId);

  const { rows: stageTeams, error: teamsErr } = await stages.stageTeamsWithTeam(
    ctx.db,
    ctx.tenantId,
    stageId
  );
  if (teamsErr) throw fail(500, 'Failed to fetch stage teams');

  const groupAssignments: Record<string, string[]> =
    settingsOrNull(stage.settings)?.group_assignments || {};

  const teamInfoMap = new Map<string, TeamInfo>();
  for (const st of stageTeams || [])
    teamInfoMap.set(st.team_id, toTeamInfo(st));

  const groups: Record<string, TeamInfo[]> = {};
  const assigned = new Set<string>();
  for (const [groupKey, teamIds] of Object.entries(groupAssignments)) {
    groups[groupKey] = [];
    for (const tid of teamIds) {
      const info = teamInfoMap.get(tid);
      if (info) {
        groups[groupKey].push(info);
        assigned.add(tid);
      }
    }
  }

  // Sans assignation réglée : déduction depuis les matchs.
  if (Object.keys(groupAssignments).length === 0) {
    const rows = await matches.groupedStageMatches(
      ctx.db,
      ctx.tenantId,
      stageId
    );
    if (rows && rows.length > 0) {
      for (const m of rows) {
        const gk = m.group_key;
        if (!gk) continue;
        if (!groups[gk]) groups[gk] = [];
        for (const tid of [m.team1_id, m.team2_id]) {
          if (tid && !assigned.has(tid)) {
            const info = teamInfoMap.get(tid);
            if (info) {
              groups[gk].push(info);
              assigned.add(tid);
            }
          }
        }
      }
    }
  }

  const unassigned: TeamInfo[] = [];
  for (const [tid, info] of teamInfoMap) {
    if (!assigned.has(tid)) unassigned.push(info);
  }

  return { stageId, groups, unassigned };
}

/* --------------------------------- PUT ---------------------------------- */

export async function saveGroups(
  ctx: ServiceContext,
  stageId: string,
  body: Body
): Promise<Audited<Record<string, unknown>>> {
  const assignments = body.assignments;
  if (!Array.isArray(assignments)) {
    throw fail(400, 'assignments must be an array');
  }

  const stage = await loadGroupStage(ctx, stageId);

  const groupAssignments: Record<string, string[]> = {};
  for (const entry of assignments) {
    if (!entry.teamId || typeof entry.teamId !== 'string') continue;
    if (entry.groupKey && typeof entry.groupKey === 'string') {
      if (!groupAssignments[entry.groupKey])
        groupAssignments[entry.groupKey] = [];
      groupAssignments[entry.groupKey].push(entry.teamId);
    }
  }

  for (const entry of assignments) {
    if (!entry.teamId) continue;
    await setTeamGroupKey(ctx, stageId, entry.teamId, entry.groupKey || null);
  }

  await stages.patchStage(ctx.db, ctx.tenantId, stageId, {
    settings: {
      ...settingsOf(stage.settings),
      group_assignments: groupAssignments,
    } as Json,
    updated_at: new Date().toISOString(),
  });

  return {
    result: { stageId, groupAssignments, success: true },
    audit: {
      entity_type: 'stage',
      entity_id: stageId,
      tournament_id: stage.tournament_id,
      payload: { group_assignments: groupAssignments },
    },
  };
}

/* -------------------------- POST : distribution ------------------------- */

export async function distributeGroups(
  ctx: ServiceContext,
  stageId: string,
  body: Body
): Promise<Audited<Record<string, unknown>>> {
  const numGroups = body.numGroups;
  const method = body.method ?? 'snake';

  if (
    !numGroups ||
    typeof numGroups !== 'number' ||
    numGroups < 1 ||
    numGroups > 32
  ) {
    throw fail(400, 'numGroups must be between 1 and 32');
  }
  if (!['snake', 'random'].includes(method as string)) {
    throw fail(400, "method must be 'snake' or 'random'");
  }

  const stage = await loadGroupStage(ctx, stageId);

  const { rows: stageTeams, error: teamsErr } = await stages.stageTeamsWithTeam(
    ctx.db,
    ctx.tenantId,
    stageId
  );
  if (teamsErr) throw fail(500, 'Failed to fetch stage teams');
  if (!stageTeams || stageTeams.length === 0) {
    throw fail(400, 'No teams in this stage');
  }

  const teams = stageTeams.map(toTeamInfo);
  if (method === 'random') {
    // Fisher-Yates.
    for (let i = teams.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [teams[i], teams[j]] = [teams[j], teams[i]];
    }
  }

  const groupKeys: string[] = [];
  for (let i = 0; i < numGroups; i++)
    groupKeys.push(String.fromCharCode(65 + i));

  const groups: Record<string, TeamInfo[]> = {};
  const groupAssignments: Record<string, string[]> = {};
  for (const gk of groupKeys) {
    groups[gk] = [];
    groupAssignments[gk] = [];
  }

  // Serpentin : 0,1,…,N-1,N-1,…,1,0,0,1,…
  for (let i = 0; i < teams.length; i++) {
    const cycle = Math.floor(i / numGroups);
    const pos = i % numGroups;
    const gk = groupKeys[cycle % 2 === 0 ? pos : numGroups - 1 - pos];
    groups[gk].push(teams[i]);
    groupAssignments[gk].push(teams[i].teamId);
  }

  await stages.patchStage(ctx.db, ctx.tenantId, stageId, {
    settings: {
      ...settingsOf(stage.settings),
      group_assignments: groupAssignments,
      num_groups: numGroups,
    } as Json,
    updated_at: new Date().toISOString(),
  });

  for (const [gk, teamIds] of Object.entries(groupAssignments)) {
    for (const tid of teamIds) await setTeamGroupKey(ctx, stageId, tid, gk);
  }

  return {
    result: { stageId, groups, unassigned: [], groupAssignments },
    audit: {
      entity_type: 'stage',
      entity_id: stageId,
      tournament_id: stage.tournament_id,
      payload: {
        num_groups: numGroups,
        method,
        group_assignments: groupAssignments,
      },
    },
  };
}

/* ---------------------- génération des matchs de poule ------------------ */

type Pairing = {
  group_key: string;
  round_number: number;
  team1_id: string | null;
  team2_id: string | null;
  is_bye: boolean;
};

export async function generateGroupMatches(
  ctx: ServiceContext,
  id: string,
  rawBody: Body
): Promise<Audited<Record<string, unknown>>> {
  const body = rawBody as {
    dryRun?: boolean;
    rounds?: number;
    matchFormat?: string;
  };

  const { row: stage, error: stageErr } = await stages.getStageCore(
    ctx.db,
    ctx.tenantId,
    id
  );
  if (stageErr || !stage) throw stageNotFound();
  if (stage.stage_type !== 'group' && stage.stage_type !== 'round_robin') {
    throw fail(
      400,
      "Cet endpoint ne supporte que les stages 'group' ou 'round_robin'."
    );
  }

  const settings = settingsOrNull(stage.settings);
  const groupAssignments: Record<string, string[]> =
    settings?.group_assignments || {};
  const groupKeys = Object.keys(groupAssignments).filter(
    (k) => Array.isArray(groupAssignments[k]) && groupAssignments[k].length >= 2
  );
  if (groupKeys.length === 0) {
    throw fail(
      400,
      "Aucune assignation de groupe trouvee. Distribuez d'abord les equipes via POST /api/admin/stages/{stageId}/groups."
    );
  }

  if (!body.dryRun) {
    const { rows: existing, error: existErr } =
      await matches.activeStageMatches(ctx.db, ctx.tenantId, id);
    if (existErr) throw fail(500, 'Failed to check existing matches');
    if (existing && existing.length > 0) {
      throw fail(
        409,
        `Des matchs existent deja pour ce stage (${existing.length}). Annulez-les avant de regenerer.`
      );
    }
  }

  const settingsRounds =
    typeof settings?.rounds === 'number'
      ? settings.rounds
      : settings?.home_away
        ? 2
        : 1;
  const rounds = Math.max(1, Math.min(10, body.rounds ?? settingsRounds ?? 1));

  const matchFormat: string =
    body.matchFormat || settings?.match_format || 'bo3';
  const allPairings: Pairing[] = [];
  for (const gk of groupKeys) {
    for (const p of generateRoundRobinPairings(groupAssignments[gk], rounds)) {
      allPairings.push({
        group_key: gk,
        round_number: p.round,
        team1_id: p.team1Id,
        team2_id: p.team2Id,
        is_bye: p.team2Id === null,
      });
    }
  }

  if (body.dryRun) {
    return {
      result: {
        stageId: id,
        dryRun: true,
        preview: allPairings,
        groupCount: groupKeys.length,
        perGroupRounds: rounds,
      },
      audit: { skip: true },
    };
  }

  const nowIso = new Date().toISOString();
  const { rows: inserted, error: insertErr } =
    await matches.insertMatchesReturningIds(
      ctx.db,
      allPairings.map((p) => ({
        tenant_id: ctx.tenantId,
        tournament_id: stage.tournament_id,
        stage_id: id,
        status: p.is_bye ? 'finished' : 'pending',
        is_bye: p.is_bye,
        match_format: matchFormat,
        round_name: `Poule ${p.group_key} · Round ${p.round_number}`,
        round_number: p.round_number,
        bracket_side: 'none',
        group_key: p.group_key,
        team1_id: p.team1_id,
        team2_id: p.team2_id,
        team1_score: p.is_bye ? 1 : null,
        team2_score: p.is_bye ? 0 : null,
        winner_team_id: p.is_bye ? p.team1_id : null,
        scheduled_at: null,
        completed_at: p.is_bye ? nowIso : null,
        stream_url: null,
        lobby_code: null,
        notes: null,
        next_match_win_id: null,
        next_match_win_slot: null,
        next_match_lose_id: null,
        next_match_lose_slot: null,
        created_at: nowIso,
        updated_at: null,
      }))
    );
  if (insertErr || !inserted) {
    ctx.logger.error('generate-group-matches insert error:', insertErr);
    throw fail(500, 'Failed to insert group matches');
  }

  const createdMatchIds = inserted.map((m) => m.id);

  return {
    result: {
      stageId: id,
      createdMatchIds,
      groupCount: groupKeys.length,
      perGroupRounds: rounds,
    },
    audit: {
      entity_type: 'stage',
      entity_id: id,
      tournament_id: stage.tournament_id,
      payload: {
        stage_id: id,
        group_count: groupKeys.length,
        rounds,
        match_count: createdMatchIds.length,
      },
    },
  };
}
