// utils/bracket/disputeImpact.ts
//
// Helpers to detect when an open (or about-to-open) dispute would corrupt
// downstream bracket matches.
//
// Why it matters :
//   When match M finishes, its winner is propagated into M_next via
//   propagate.ts. If a dispute is opened on M *after* M_next has already
//   started (or finished), reversing the dispute would force us to retroact-
//   ively change a contested team in an active downstream match. That's the
//   class of bug Lot 3 hunts.
//
// Strategy :
//   - `findDownstreamImpact(tenantId, matchId)` looks at the row's
//     `next_match_win_id` / `next_match_lose_id` columns. If those downstream
//     matches are in `ongoing` / `finished` / `walkover` AND still carry one
//     of the source match's teams in the propagated slot, they are flagged.
//   - `findDisputesBlockingDownstream(tenantId, tournamentId)` iterates over
//     every `disputed` match in the tournament and aggregates the impacts.

import { supabaseAdmin } from '../supabase';
import { logger } from '../logger';

type DownstreamImpactedMatch = {
  matchId: string;
  status: string;
  side: 'win' | 'lose';
  slot: 1 | 2;
};

export type SourceMatchImpact = {
  sourceMatchId: string;
  impacted: DownstreamImpactedMatch[];
};

const LIVE_STATUSES = new Set<string>(['ongoing', 'finished', 'walkover']);

/**
 * For the given source match, check which downstream matches (win-side and
 * lose-side) are already in a non-resettable state AND still carry one of
 * the source match's teams.
 *
 * Returns `{ impacted: [] }` when downstream is empty or untouched.
 */
export async function findDownstreamImpact(
  tenantId: string,
  matchId: string
): Promise<SourceMatchImpact> {
  if (!supabaseAdmin) {
    return { sourceMatchId: matchId, impacted: [] };
  }

  const { data: source } = await supabaseAdmin
    .from('matches')
    .select(
      'id, team1_id, team2_id, next_match_win_id, next_match_win_slot, next_match_lose_id, next_match_lose_slot'
    )
    .eq('tenant_id', tenantId)
    .eq('id', matchId)
    .maybeSingle();

  if (!source) return { sourceMatchId: matchId, impacted: [] };

  const sourceTeams = new Set<string>();
  if (source.team1_id) sourceTeams.add(source.team1_id);
  if (source.team2_id) sourceTeams.add(source.team2_id);

  const downstreamIds: string[] = [];
  if (source.next_match_win_id) downstreamIds.push(source.next_match_win_id);
  if (source.next_match_lose_id) downstreamIds.push(source.next_match_lose_id);
  if (downstreamIds.length === 0) {
    return { sourceMatchId: matchId, impacted: [] };
  }

  const { data: downstreams, error } = await supabaseAdmin
    .from('matches')
    .select('id, status, team1_id, team2_id')
    .eq('tenant_id', tenantId)
    .in('id', downstreamIds);

  if (error || !downstreams) {
    if (error) logger.error('[disputeImpact] downstream fetch error', error);
    return { sourceMatchId: matchId, impacted: [] };
  }

  const impacted: DownstreamImpactedMatch[] = [];

  for (const d of downstreams) {
    if (!LIVE_STATUSES.has(d.status)) continue;
    const isWin = d.id === source.next_match_win_id;
    const isLose = d.id === source.next_match_lose_id;
    const slot = isWin
      ? source.next_match_win_slot
      : source.next_match_lose_slot;
    if (!slot) continue;
    const slotTeam = slot === 1 ? d.team1_id : d.team2_id;
    if (!slotTeam || !sourceTeams.has(slotTeam)) continue;
    impacted.push({
      matchId: d.id,
      status: d.status,
      side: isWin ? 'win' : isLose ? 'lose' : 'win',
      slot: slot as 1 | 2,
    });
  }

  return { sourceMatchId: matchId, impacted };
}

/**
 * Aggregate over every `disputed` match in the given tournament. Returns
 * only matches whose dispute is actually blocking downstream — disputes
 * with no impact are dropped from the result.
 */
export async function findDisputesBlockingDownstream(
  tenantId: string,
  tournamentId: string
): Promise<SourceMatchImpact[]> {
  if (!supabaseAdmin) return [];

  const { data: disputed, error } = await supabaseAdmin
    .from('matches')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('tournament_id', tournamentId)
    .eq('status', 'disputed');

  if (error) {
    logger.error(
      '[disputeImpact] findDisputesBlockingDownstream error',
      error
    );
    return [];
  }

  const out: SourceMatchImpact[] = [];
  for (const d of disputed ?? []) {
    const impact = await findDownstreamImpact(tenantId, d.id);
    if (impact.impacted.length > 0) out.push(impact);
  }
  return out;
}
