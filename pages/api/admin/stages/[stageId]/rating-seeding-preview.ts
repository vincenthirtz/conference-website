// pages/api/admin/stages/[stageId]/rating-seeding-preview.ts
// GET ?method=rating|rating_sos&pattern=standard|sequential&sosWeight=<number>
//
// Read-only counterpart of /rating-seed. Computes the proposed bracket seeding
// from team RATINGS (Glicko-derived) + optional cross-event Strength-of-Schedule
// (SoS), for the "initial bracket without a qualifier stage" case. Reuses the
// pure engines :
//   - utils/seeding/strengthOfSchedule.ts::computeStrengthOfSchedule
//   - utils/seeding/ratingSeeding.ts::computeRatingSeeding
//   - utils/stages/autoSeed.ts::computeProposedSeeding
//
// Does NOT block on lock — returns lock info so the UI can grey out the apply
// button (mirrors seeding-preview).

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, AuthenticatedStaffContext } from '@/utils/staff';
import { isValidUUID } from '@/utils/apiHelpers';
import {
  computeProposedSeeding,
  type ProposedSlot,
  type SeedingPattern,
} from '@/utils/stages/autoSeed';
import {
  computeRatingSeeding,
  type SeedingMethod,
  type SeedingTeamInput,
} from '@/utils/seeding/ratingSeeding';
import {
  computeStrengthOfSchedule,
  type SoSMatch,
} from '@/utils/seeding/strengthOfSchedule';
import { logger } from '../../../../../utils/logger';

type BreakdownRow = {
  teamId: string;
  teamName: string | null;
  shortName: string | null;
  logoUrl: string | null;
  rating: number;
  rd: number | null;
  sos: number;
  score: number;
  rank: number;
  provisional: boolean;
};

type ApiResponse =
  | {
      proposed: ProposedSlot[];
      breakdown: BreakdownRow[];
      bracketMatchCount: number;
      lock: { locked: boolean; reasons: string[] };
      method: SeedingMethod;
      pattern: SeedingPattern;
    }
  | { error: string };

export default withStaffRoute(handler, 'admin');

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
  const method: SeedingMethod =
    req.query.method === 'rating' ? 'rating' : 'rating_sos';
  const pattern: SeedingPattern =
    req.query.pattern === 'sequential' ? 'sequential' : 'standard';
  const sosWeightRaw =
    typeof req.query.sosWeight === 'string' ? Number(req.query.sosWeight) : NaN;
  const sosWeight = Number.isFinite(sosWeightRaw) ? sosWeightRaw : undefined;

  try {
    const result = await computeRatingSeedingForStage({
      client: supabaseAdmin,
      tenantId: ctx.tenantId,
      stageId: targetStageId,
      method,
      pattern,
      sosWeight,
    });

    if ('error' in result) {
      return res.status(result.status).json({ error: result.error });
    }

    return res.status(200).json({
      proposed: result.proposed,
      breakdown: result.breakdown,
      bracketMatchCount: result.bracketMatchCount,
      lock: result.lock,
      method,
      pattern,
    });
  } catch (err) {
    logger.error(
      '[/api/admin/stages/[stageId]/rating-seeding-preview] error',
      err
    );
    return res.status(500).json({ error: 'Internal server error' });
  }
}

// ---------------------------------------------------------------------------
// Shared compute — used by both preview (read-only) and rating-seed (apply).
// ---------------------------------------------------------------------------

type SupabaseClient = NonNullable<typeof supabaseAdmin>;

export type RatingSeedingComputeError = { error: string; status: number };

export type RatingSeedingComputeOk = {
  proposed: ProposedSlot[];
  breakdown: BreakdownRow[];
  bracketMatchCount: number;
  lock: { locked: boolean; reasons: string[] };
  /** Round-1 bracket matches, stable order — needed by the apply path. */
  bracketMatches: { id: string }[];
};

/**
 * Fetch stage teams + ratings + cross-event SoS, run the pure engines, and
 * produce the proposed bracket slots + a UI breakdown. No mutation. Shared so
 * preview and apply compute IDENTICAL results from the same inputs.
 */
export async function computeRatingSeedingForStage(params: {
  client: SupabaseClient;
  tenantId: string;
  stageId: string;
  method: SeedingMethod;
  pattern: SeedingPattern;
  sosWeight?: number;
}): Promise<RatingSeedingComputeOk | RatingSeedingComputeError> {
  const { client, tenantId, stageId, method, pattern, sosWeight } = params;

  // 1. Target stage must be a bracket.
  const { data: stage } = await client
    .from('tournament_stages')
    .select('id, name, tournament_id, stage_type')
    .eq('id', stageId)
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (!stage) return { error: 'Stage not found', status: 404 };
  if (stage.stage_type !== 'bracket') {
    return { error: 'Stage must be a bracket to compute seeding', status: 400 };
  }

  // 2. Teams registered in the stage.
  const { data: stageTeamsRaw } = await client
    .from('stage_teams')
    .select('team_id')
    .eq('tenant_id', tenantId)
    .eq('stage_id', stageId);

  const stageTeamIds = ((stageTeamsRaw ?? []) as { team_id: string }[]).map(
    (r) => r.team_id
  );
  if (stageTeamIds.length === 0) {
    return {
      error:
        'Aucune équipe inscrite dans ce stage. Inscrivez des équipes avant de seeder.',
      status: 400,
    };
  }

  // 3. Round-1 bracket matches (stable order via created_at) + lock state.
  const { data: bracketMatchesRaw } = await client
    .from('matches')
    .select('id, round_number, status, created_at')
    .eq('tenant_id', tenantId)
    .eq('stage_id', stageId)
    .eq('round_number', 1)
    .order('created_at', { ascending: true });

  const bracketMatches = ((bracketMatchesRaw ?? []) as {
    id: string;
    status: string;
  }[]).map((m) => ({ id: m.id, status: m.status }));

  const lockedCount = bracketMatches.filter(
    (m) =>
      m.status === 'ongoing' ||
      m.status === 'finished' ||
      m.status === 'walkover'
  ).length;
  const lock = {
    locked: lockedCount > 0,
    reasons:
      lockedCount > 0
        ? [`${lockedCount} match(es) du round 1 déjà joué(s) ou en cours.`]
        : [],
  };

  // 4. Team ratings for the stage teams.
  const { data: stageRatingsRaw } = await client
    .from('team_ratings')
    .select('team_id, rating, rd, games_played')
    .eq('tenant_id', tenantId)
    .in('team_id', stageTeamIds);

  type RatingRow = {
    team_id: string;
    rating: number | null;
    rd: number | null;
    games_played: number | null;
  };
  const ratingByStageTeam = new Map<string, RatingRow>();
  for (const r of (stageRatingsRaw ?? []) as RatingRow[]) {
    ratingByStageTeam.set(r.team_id, r);
  }

  // 5. Cross-event SoS : finished/walkover, non-bye matches of the tenant where
  //    either side is one of our stage teams.
  const stageTeamSet = new Set(stageTeamIds);
  const { data: sosMatchesRaw } = await client
    .from('matches')
    .select('team1_id, team2_id, status, is_bye')
    .eq('tenant_id', tenantId)
    .in('status', ['finished', 'walkover']);

  type SoSMatchRow = {
    team1_id: string | null;
    team2_id: string | null;
    status: string;
    is_bye: boolean | null;
  };
  const allSosMatches = (sosMatchesRaw ?? []) as SoSMatchRow[];
  // Keep only matches that touch a stage team (defensive: the .in() above
  // already narrows status; here we narrow to our teams).
  const relevantSosMatches = allSosMatches.filter(
    (m) =>
      (m.team1_id && stageTeamSet.has(m.team1_id)) ||
      (m.team2_id && stageTeamSet.has(m.team2_id))
  );

  const sosMatches: SoSMatch[] = relevantSosMatches.map((m) => ({
    teamAId: m.team1_id,
    teamBId: m.team2_id,
    status: m.status,
    isBye: m.is_bye,
  }));

  // Gather every team id appearing (incl. opponents outside the stage) to build
  // ratingByTeam for the SoS engine.
  const sosTeamIds = new Set<string>();
  for (const m of relevantSosMatches) {
    if (m.team1_id) sosTeamIds.add(m.team1_id);
    if (m.team2_id) sosTeamIds.add(m.team2_id);
  }
  const ratingByTeam = new Map<string, number>();
  // Seed with the stage ratings we already have.
  for (const [teamId, row] of ratingByStageTeam) {
    if (row.rating != null) ratingByTeam.set(teamId, row.rating);
  }
  const missingRatingIds = [...sosTeamIds].filter((id) => !ratingByTeam.has(id));
  if (missingRatingIds.length > 0) {
    const { data: oppRatingsRaw } = await client
      .from('team_ratings')
      .select('team_id, rating')
      .eq('tenant_id', tenantId)
      .in('team_id', missingRatingIds);
    for (const r of (oppRatingsRaw ?? []) as {
      team_id: string;
      rating: number | null;
    }[]) {
      if (r.rating != null) ratingByTeam.set(r.team_id, r.rating);
    }
  }

  const sosRes = computeStrengthOfSchedule({
    matches: sosMatches,
    ratingByTeam,
  });

  // 6. Build SeedingTeamInput[] and run the rating seeding engine.
  const seedingInputs: SeedingTeamInput[] = stageTeamIds.map((teamId) => {
    const row = ratingByStageTeam.get(teamId);
    return {
      teamId,
      rating: row?.rating ?? null,
      rd: row?.rd ?? null,
      gamesPlayed: row?.games_played ?? 0,
      sos: sosRes.get(teamId)?.sos ?? null,
    };
  });

  const seeded = computeRatingSeeding({
    teams: seedingInputs,
    method,
    sosWeight,
  });

  // 7. Proposed bracket slots via the shared positional engine.
  const proposed = computeProposedSeeding({
    standings: seeded.map((s) => ({ teamId: s.teamId, rank: s.rank })),
    bracketMatches: bracketMatches.map((m) => ({ matchId: m.id })),
    pattern,
  });

  // 8. Team names for the breakdown.
  const teamsById = new Map<
    string,
    { name: string | null; short_name: string | null; logo_url: string | null }
  >();
  {
    const { data: teams } = await client
      .from('teams')
      .select('id, name, short_name, logo_url')
      .in('id', stageTeamIds)
      .eq('tenant_id', tenantId);
    for (const t of (teams ?? []) as {
      id: string;
      name: string | null;
      short_name: string | null;
      logo_url: string | null;
    }[]) {
      teamsById.set(t.id, {
        name: t.name ?? null,
        short_name: t.short_name ?? null,
        logo_url: t.logo_url ?? null,
      });
    }
  }

  const breakdown: BreakdownRow[] = seeded.map((s) => {
    const t = teamsById.get(s.teamId);
    return {
      teamId: s.teamId,
      teamName: t?.name ?? null,
      shortName: t?.short_name ?? null,
      logoUrl: t?.logo_url ?? null,
      rating: s.rating,
      rd: s.rd,
      sos: s.sos,
      score: s.score,
      rank: s.rank,
      provisional: s.provisional,
    };
  });

  return {
    proposed,
    breakdown,
    bracketMatchCount: bracketMatches.length,
    lock,
    bracketMatches: bracketMatches.map((m) => ({ id: m.id })),
  };
}
