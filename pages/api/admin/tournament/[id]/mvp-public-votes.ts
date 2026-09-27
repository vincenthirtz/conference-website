// pages/api/admin/tournament/[id]/mvp-public-votes.ts
// Admin : suivi du vote MVP DU PUBLIC d'un tournoi, match par match — le
// jumeau de `mvp-votes` (vote des équipes), sur les tables du vote public.
// - GET : état du scrutin, décompte Twitch / Discord, qui mène, gagnante figée.
//
// Lecture seule. Le décompte est celui du dépouillement PUBLIC : Twitch et
// Discord s'ADDITIONNENT (utils/mvp/voteBoard en mode `public`, qui s'appuie
// sur `resolvePublicMvp`). Aucun identifiant de votant ne sort de cette route.

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withStaffRoute, type AuthenticatedStaffContext } from '@/utils/staff';
import { isValidUUID } from '@/utils/apiHelpers';
import { readPublicVotesForMatches } from '@/utils/mvp/publicVote';
import {
  buildVoteBoard,
  type VoteBoardMember,
  type VoteBoardPollInput,
} from '@/utils/mvp/voteBoard';
import { oneRelation, type Relation } from '@/utils/supabase/relation';
import { logger } from '@/utils/logger';

/** Recopie du `.select()` des matchs du tournoi. */
type MatchRow = {
  id: string;
  round_name: string | null;
  scheduled_at: string | null;
  status: string;
  team1_id: string | null;
  team2_id: string | null;
};

/** Recopie du `.select()` de `match_public_mvp_polls`. */
type PollRow = {
  match_id: string;
  opened_at: string | null;
  closes_at: string | null;
  closed_at: string | null;
  winner_member_id: string | null;
  winner_votes: number | null;
  total_votes: number | null;
};

/** Recopie du `.select()` des joueuses citées (voix ou gagnante). */
type MemberRow = {
  id: string;
  display_name: string | null;
  battle_tag: string | null;
  team: Relation<{ name: string }>;
};

// Même seuil que la route MVP d'un match : les casters suivent le vote en
// direct depuis la régie.
export default withStaffRoute(handler, 'caster');

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  const { id } = req.query;
  if (!id || Array.isArray(id) || !isValidUUID(id)) {
    return res.status(400).json({ error: 'Invalid tournament id' });
  }
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!supabaseAdmin) {
    return res.status(500).json({ error: 'Service indisponible' });
  }

  try {
    const { data: tournament } = await supabaseAdmin
      .from('tournaments')
      .select('id, name')
      .eq('id', id)
      .eq('tenant_id', ctx.tenantId)
      .maybeSingle();
    if (!tournament) {
      return res.status(404).json({ error: 'Tournament not found' });
    }

    const { data: matchData, error: matchErr } = await supabaseAdmin
      .from('matches')
      .select('id, round_name, scheduled_at, status, team1_id, team2_id')
      .eq('tenant_id', ctx.tenantId)
      .eq('tournament_id', id);
    if (matchErr) throw matchErr;
    const matches = (matchData ?? []) as MatchRow[];
    const matchIds = matches.map((m) => m.id);

    const [pollRes, votes] = await Promise.all([
      matchIds.length
        ? supabaseAdmin
            .from('match_public_mvp_polls')
            .select(
              'match_id, opened_at, closes_at, closed_at, winner_member_id, winner_votes, total_votes'
            )
            .eq('tenant_id', ctx.tenantId)
            .in('match_id', matchIds)
        : Promise.resolve({ data: [] as PollRow[], error: null }),
      readPublicVotesForMatches(ctx.tenantId, matchIds),
    ]);
    if (pollRes.error) throw pollRes.error;

    const polls = new Map<string, VoteBoardPollInput>();
    for (const p of (pollRes.data ?? []) as PollRow[]) {
      polls.set(p.match_id, {
        // Un scrutin public « ouvert » l'est depuis `opened_at`.
        postedAt: p.opened_at,
        closesAt: p.closes_at,
        closedAt: p.closed_at,
        winnerMemberId: p.winner_member_id,
        // Le titre du public additionne les deux plateformes.
        winnerSource: 'combined',
        winnerVotes: p.winner_votes,
        totalVotes: p.total_votes,
      });
    }

    // Noms des équipes et des joueuses citées, en deux lectures.
    const teamIds = [
      ...new Set(
        matches.flatMap((m) => [m.team1_id, m.team2_id]).filter(Boolean)
      ),
    ] as string[];
    const memberIds = new Set<string>();
    for (const list of votes.values()) {
      for (const v of list) memberIds.add(v.memberId);
    }
    for (const p of polls.values()) {
      if (p.winnerMemberId) memberIds.add(p.winnerMemberId);
    }

    const [teamRes, memberRes] = await Promise.all([
      teamIds.length
        ? supabaseAdmin
            .from('teams')
            .select('id, name')
            .eq('tenant_id', ctx.tenantId)
            .in('id', teamIds)
        : Promise.resolve({ data: [] as { id: string; name: string }[] }),
      memberIds.size
        ? supabaseAdmin
            .from('team_members')
            .select('id, display_name, battle_tag, team:teams(name)')
            .eq('tenant_id', ctx.tenantId)
            .in('id', [...memberIds])
        : Promise.resolve({ data: [] as MemberRow[] }),
    ]);

    const teamName = new Map<string, string>();
    for (const t of (teamRes.data ?? []) as { id: string; name: string }[]) {
      teamName.set(t.id, t.name);
    }
    const members = new Map<string, VoteBoardMember>();
    for (const m of (memberRes.data ?? []) as MemberRow[]) {
      members.set(m.id, {
        label: m.display_name || m.battle_tag || 'Joueuse',
        teamName: oneRelation(m.team)?.name ?? null,
      });
    }

    const board = buildVoteBoard({
      matches: matches.map((m) => ({
        id: m.id,
        roundName: m.round_name,
        scheduledAt: m.scheduled_at,
        status: m.status,
        team1Name: m.team1_id ? (teamName.get(m.team1_id) ?? null) : null,
        team2Name: m.team2_id ? (teamName.get(m.team2_id) ?? null) : null,
      })),
      polls,
      votes,
      members,
      now: new Date(),
      mode: 'public',
    });

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({
      tournament: { id: tournament.id, name: tournament.name },
      ...board,
    });
  } catch (err) {
    logger.error('[admin/tournament/mvp-public-votes] error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
