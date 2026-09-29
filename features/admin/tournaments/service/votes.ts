// features/admin/tournaments/service/votes.ts — suivi des votes MVP d'un
// tournoi, match par match : vote des équipes et vote DU PUBLIC.
//
// Lecture seule. Le décompte est celui du dépouillement (utils/mvp/voteBoard) :
// ce que le staff voit ici est ce que la clôture décidera. Aucun identifiant
// de votant ne sort de ce service.

import type { ServiceContext } from '@/utils/admin/serviceContext';
import { readMatchVotes } from '@/utils/mvp/service';
import { readPublicVotesForMatches } from '@/utils/mvp/publicVote';
import {
  buildVoteBoard,
  type VoteBoardMember,
  type VoteBoardPollInput,
} from '@/utils/mvp/voteBoard';
import { oneRelation, type Relation } from '@/utils/supabase/relation';
import * as tRepo from '../repository/tournaments';
import * as repo from '../repository/insights';
import { fail } from './common';

type Mode = 'team' | 'public';

async function loadBoard(
  ctx: ServiceContext,
  tournamentId: string,
  mode: Mode
) {
  const { data: tournament } = await tRepo.findTournament(
    ctx.db,
    ctx.tenantId,
    tournamentId
  );
  if (!tournament) fail(404, 'Tournament not found');

  const { data: matchData, error: matchErr } = await repo.matchesForVotes(
    ctx.db,
    ctx.tenantId,
    tournamentId
  );
  if (matchErr) throw matchErr;
  const matches = matchData ?? [];
  const matchIds = matches.map((m) => m.id);

  const polls = new Map<string, VoteBoardPollInput>();
  let votes: Awaited<ReturnType<typeof readMatchVotes>>;
  if (mode === 'team') {
    const [pollRes, v] = await Promise.all([
      matchIds.length
        ? repo.teamPolls(ctx.db, ctx.tenantId, matchIds)
        : Promise.resolve({ data: [], error: null }),
      readMatchVotes(ctx.tenantId, matchIds),
    ]);
    if (pollRes.error) throw pollRes.error;
    votes = v;
    for (const p of pollRes.data ?? []) {
      polls.set(p.match_id, {
        postedAt: p.posted_at,
        closesAt: p.closes_at,
        closedAt: p.closed_at,
        winnerMemberId: p.winner_member_id,
        winnerSource: p.winner_source,
        winnerVotes: p.winner_votes,
        totalVotes: p.total_votes,
      });
    }
  } else {
    const [pollRes, v] = await Promise.all([
      matchIds.length
        ? repo.publicPolls(ctx.db, ctx.tenantId, matchIds)
        : Promise.resolve({ data: [], error: null }),
      readPublicVotesForMatches(ctx.tenantId, matchIds),
    ]);
    if (pollRes.error) throw pollRes.error;
    votes = v as typeof votes;
    for (const p of pollRes.data ?? []) {
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
  }

  // Noms des équipes et des joueuses citées, en deux lectures.
  const teamIds = [
    ...new Set(
      matches
        .flatMap((m) => [m.team1_id, m.team2_id])
        .filter((v): v is string => Boolean(v))
    ),
  ];
  const memberIds = new Set<string>();
  for (const list of votes.values()) {
    for (const v of list) memberIds.add(v.memberId);
  }
  for (const p of polls.values()) {
    if (p.winnerMemberId) memberIds.add(p.winnerMemberId);
  }
  const [teamRes, memberRes] = await Promise.all([
    teamIds.length
      ? repo.teamNames(ctx.db, ctx.tenantId, teamIds)
      : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    memberIds.size
      ? repo.membersWithTeam(ctx.db, ctx.tenantId, [...memberIds])
      : Promise.resolve({
          data: [] as {
            id: string;
            display_name: string | null;
            battle_tag: string | null;
            team: unknown;
          }[],
        }),
  ]);
  const teamName = new Map<string, string>();
  for (const t of teamRes.data ?? []) teamName.set(t.id, t.name);
  const members = new Map<string, VoteBoardMember>();
  for (const m of memberRes.data ?? []) {
    members.set(m.id, {
      label: m.display_name || m.battle_tag || 'Joueuse',
      teamName: oneRelation(m.team as Relation<{ name: string }>)?.name ?? null,
    });
  }
  const nameOf = (id: string | null) =>
    id ? (teamName.get(id) ?? null) : null;

  const board = buildVoteBoard({
    matches: matches.map((m) => ({
      id: m.id,
      roundName: m.round_name,
      scheduledAt: m.scheduled_at,
      status: m.status,
      team1Name: nameOf(m.team1_id),
      team2Name: nameOf(m.team2_id),
    })),
    polls,
    votes,
    members,
    now: new Date(),
    ...(mode === 'public' ? { mode: 'public' as const } : {}),
  });

  return { tournament, matches, polls, board, nameOf };
}

export async function teamVotes(ctx: ServiceContext, tournamentId: string) {
  const { tournament, board } = await loadBoard(ctx, tournamentId, 'team');
  return { tournament: { id: tournament.id, name: tournament.name }, ...board };
}

export async function publicVotes(ctx: ServiceContext, tournamentId: string) {
  const { tournament, matches, polls, board, nameOf } = await loadBoard(
    ctx,
    tournamentId,
    'public'
  );
  // Matchs où un vote du public peut être LANCÉ À LA MAIN : terminés, jamais
  // ouverts. Les refus fins (forfait, bye) restent au serveur à l'ouverture.
  const openable = matches
    .filter((m) => m.status === 'finished' && !polls.has(m.id))
    .sort((a, b) => (b.scheduled_at ?? '').localeCompare(a.scheduled_at ?? ''))
    .map((m) => ({
      id: m.id,
      roundName: m.round_name,
      scheduledAt: m.scheduled_at,
      team1Name: nameOf(m.team1_id),
      team2Name: nameOf(m.team2_id),
    }));
  return {
    tournament: { id: tournament.id, name: tournament.name },
    ...board,
    openable,
  };
}
