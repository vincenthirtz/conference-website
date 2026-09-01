// pages/api/admin/stages/[stageId]/seeding-preview.ts
// GET ?sourceStageId=<uuid>&pattern=standard|sequential
//
// Read-only counterpart of /auto-seed and /manual-seed. Returns :
//   - `proposed`      : the auto-seed plan that /auto-seed would write
//   - `current`       : the current round-1 slot state (manual draft baseline)
//   - `lock`          : reasons that block any new seeding (ongoing/finished)
//   - `availableTeams`: teams registered in the stage that are NOT yet placed
//
// Used by /admin/stages/[stageId]/seeding to show auto vs manual side-by-side
// before committing.

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, AuthenticatedStaffContext } from '@/utils/staff';
import { isValidUUID } from '@/utils/apiHelpers';
import { computeStageStandings } from '@/utils/stages/standings';
import {
  computeProposedSeeding,
  type ProposedSlot,
  type SeedingPattern,
} from '@/utils/stages/autoSeed';
import { logger } from '../../../../../utils/logger';

type TeamLite = {
  id: string;
  name: string;
  short_name: string | null;
  logo_url: string | null;
};

type CurrentSlot = {
  matchId: string;
  slot: 1 | 2;
  teamId: string | null;
  status: string;
};

type SourceStage = {
  id: string;
  name: string;
  stage_type: string | null;
};

type ApiResponse =
  | {
      stage: { id: string; name: string; tournament_id: string };
      bracketSize: number;
      sources: SourceStage[];
      proposed: (ProposedSlot & { team: TeamLite | null })[];
      current: (CurrentSlot & { team: TeamLite | null })[];
      lock: {
        locked: boolean;
        lockedMatchCount: number;
        reason: string | null;
      };
      availableTeams: TeamLite[];
    }
  | { error: string };

export default withStaffRoute(handler, { permission: 'manage_tournaments' });

async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse>,
  ctx: AuthenticatedStaffContext
) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { stageId } = req.query;
  if (!stageId || Array.isArray(stageId) || !isValidUUID(stageId)) {
    return res.status(400).json({ error: 'Invalid stageId' });
  }
  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Database service unavailable' });
  }

  const targetStageId = String(stageId);
  const sourceStageId =
    typeof req.query.sourceStageId === 'string'
      ? req.query.sourceStageId
      : null;
  const pattern: SeedingPattern =
    req.query.pattern === 'sequential' ? 'sequential' : 'standard';

  try {
    // 1. Target stage
    const { data: stage } = await supabaseAdmin
      .from('tournament_stages')
      .select('id, name, tournament_id, stage_type')
      .eq('id', targetStageId)
      .eq('tenant_id', ctx.tenantId)
      .maybeSingle();

    if (!stage) {
      return res.status(404).json({ error: 'Stage not found' });
    }
    if (stage.stage_type !== 'bracket') {
      return res
        .status(400)
        .json({ error: 'Stage must be a bracket to compute seeding' });
    }

    // 2. Round-1 matches (stable order via created_at)
    const { data: bracketMatchesRaw } = await supabaseAdmin
      .from('matches')
      .select('id, round_number, team1_id, team2_id, status, created_at')
      .eq('tenant_id', ctx.tenantId)
      .eq('stage_id', targetStageId)
      .eq('round_number', 1)
      .order('created_at', { ascending: true });

    const bracketMatches = bracketMatchesRaw ?? [];

    // 3. Lock state
    const lockedMatches = bracketMatches.filter(
      (m) =>
        m.status === 'ongoing' ||
        m.status === 'finished' ||
        m.status === 'walkover'
    );
    const lock = {
      locked: lockedMatches.length > 0,
      lockedMatchCount: lockedMatches.length,
      reason:
        lockedMatches.length > 0
          ? `${lockedMatches.length} match(es) du round 1 déjà joué(s) ou en cours.`
          : null,
    };

    // 4. Candidate source stages = all stages of this tournament except the
    //    target itself. The UI picks one and we re-fetch to compute proposed.
    const { data: siblingsRaw } = await supabaseAdmin
      .from('tournament_stages')
      .select('id, name, stage_type, order_index')
      .eq('tenant_id', ctx.tenantId)
      .eq('tournament_id', stage.tournament_id)
      .neq('id', targetStageId)
      .order('order_index', { ascending: true });

    const sources: SourceStage[] = (siblingsRaw ?? []).map((s: any) => ({
      id: s.id,
      name: s.name,
      stage_type: s.stage_type,
    }));

    // 5. Compute proposed seeding (only if a source is selected)
    let proposed: ProposedSlot[] = [];
    if (sourceStageId && isValidUUID(sourceStageId)) {
      // Validate the source stage belongs to the same tournament
      const sourceMatch = sources.find((s) => s.id === sourceStageId);
      if (sourceMatch) {
        try {
          const standings = await computeStageStandings(
            ctx.tenantId,
            sourceStageId,
            sourceMatch.stage_type ?? 'other'
          );
          proposed = computeProposedSeeding({
            standings: standings.map((s) => ({
              teamId: s.teamId,
              rank: s.rank,
            })),
            bracketMatches: bracketMatches.map((m) => ({ matchId: m.id })),
            pattern,
          });
        } catch (e) {
          logger.error('[seeding-preview] standings error', e);
        }
      }
    }

    // 6. Collect every team id referenced (current + proposed + stage_teams)
    const allTeamIds = new Set<string>();
    for (const m of bracketMatches) {
      if (m.team1_id) allTeamIds.add(m.team1_id);
      if (m.team2_id) allTeamIds.add(m.team2_id);
    }
    for (const p of proposed) allTeamIds.add(p.teamId);

    const { data: stageTeamsRaw } = await supabaseAdmin
      .from('stage_teams')
      .select('team_id')
      .eq('tenant_id', ctx.tenantId)
      .eq('stage_id', targetStageId);
    const stageTeamIds = ((stageTeamsRaw ?? []) as any[]).map(
      (r) => r.team_id as string
    );
    for (const tid of stageTeamIds) allTeamIds.add(tid);

    const teamsById = new Map<string, TeamLite>();
    if (allTeamIds.size > 0) {
      const { data: teams } = await supabaseAdmin
        .from('teams')
        .select('id, name, short_name, logo_url')
        .in('id', Array.from(allTeamIds))
        .eq('tenant_id', ctx.tenantId);
      for (const t of (teams ?? []) as any[]) {
        teamsById.set(t.id, {
          id: t.id,
          name: t.name,
          short_name: t.short_name ?? null,
          logo_url: t.logo_url ?? null,
        });
      }
    }

    // 7. Shape outputs
    const proposedShaped = proposed.map((p) => ({
      ...p,
      team: teamsById.get(p.teamId) ?? null,
    }));

    const current: (CurrentSlot & { team: TeamLite | null })[] = [];
    for (const m of bracketMatches) {
      current.push({
        matchId: m.id,
        slot: 1,
        teamId: m.team1_id ?? null,
        status: m.status,
        team: m.team1_id ? (teamsById.get(m.team1_id) ?? null) : null,
      });
      current.push({
        matchId: m.id,
        slot: 2,
        teamId: m.team2_id ?? null,
        status: m.status,
        team: m.team2_id ? (teamsById.get(m.team2_id) ?? null) : null,
      });
    }

    const placedIds = new Set<string>();
    for (const m of bracketMatches) {
      if (m.team1_id) placedIds.add(m.team1_id);
      if (m.team2_id) placedIds.add(m.team2_id);
    }
    const availableTeams: TeamLite[] = stageTeamIds
      .filter((tid) => !placedIds.has(tid))
      .map((tid) => teamsById.get(tid))
      .filter((t): t is TeamLite => Boolean(t));

    return res.status(200).json({
      stage: {
        id: stage.id,
        name: stage.name,
        tournament_id: stage.tournament_id,
      },
      bracketSize: bracketMatches.length * 2,
      sources,
      proposed: proposedShaped,
      current,
      lock,
      availableTeams,
    });
  } catch (err) {
    logger.error('[/api/admin/stages/[stageId]/seeding-preview] error', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
