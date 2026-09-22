// utils/mvp/voteBoard.ts
//
// Tableau de suivi des votes MVP d'un tournoi, côté staff : pour chaque match,
// l'état du vote, le décompte par plateforme et qui mène.
//
// PUR : la route `/api/admin/tournament/[id]/mvp-votes` lit la base, ce module
// assemble. Le décompte et la désignation réutilisent `tallySource` et
// `resolveMatchMvp` (utils/mvp/awards.ts) : le staff voit EXACTEMENT ce que le
// dépouillement décidera, y compris « trop peu de voix » ou « égalité ».
//
// Aucun `voter_key` ne sort d'ici : on compte des voix, on n'expose pas de
// votants.

import {
  resolveMatchMvp,
  tallySource,
  type MvpNoAwardReason,
  type MvpVote,
  type MvpVoteSource,
} from './awards';

/** Où en est le vote d'un match. */
export type MvpPollState =
  /** Aucun vote ouvert pour ce match. */
  | 'none'
  /** Ouvert, fenêtre en cours. */
  | 'open'
  /** Fenêtre passée, pas encore dépouillé (le bot le fera à son passage). */
  | 'expired'
  /** Dépouillé : la gagnante (ou l'absence de gagnante) est figée. */
  | 'closed';

export type VoteBoardMatchInput = {
  id: string;
  roundName: string | null;
  scheduledAt: string | null;
  status: string;
  team1Name: string | null;
  team2Name: string | null;
};

export type VoteBoardPollInput = {
  postedAt: string | null;
  closesAt: string | null;
  closedAt: string | null;
  winnerMemberId: string | null;
  winnerSource: string | null;
  winnerVotes: number | null;
  totalVotes: number | null;
};

export type VoteBoardMember = {
  label: string;
  teamName: string | null;
};

export type VoteBoardSource = {
  source: MvpVoteSource;
  total: number;
  rows: Array<{
    memberId: string;
    label: string;
    teamName: string | null;
    votes: number;
    share: number;
  }>;
};

export type VoteBoardMatch = VoteBoardMatchInput & {
  state: MvpPollState;
  closesAt: string | null;
  closedAt: string | null;
  totalVotes: number;
  /** Twitch d'abord, puis Discord — seules les sources qui ont des voix. */
  sources: VoteBoardSource[];
  /** Ce que le dépouillement déciderait MAINTENANT, avec les voix actuelles. */
  leader:
    | {
        memberId: string;
        label: string;
        source: MvpVoteSource;
        votes: number;
        total: number;
      }
    | { memberId: null; reason: MvpNoAwardReason };
  /** Gagnante figée au dépouillement (ou tranchée à la main), si déjà clos. */
  winner: {
    memberId: string;
    label: string;
    source: string | null;
    votes: number | null;
    total: number | null;
  } | null;
};

export type VoteBoard = {
  matches: VoteBoardMatch[];
  totals: { votes: number; openPolls: number; matchesWithVotes: number };
};

const UNKNOWN = 'Joueuse inconnue';

export function pollState(
  poll: VoteBoardPollInput | null,
  now: Date
): MvpPollState {
  if (!poll?.postedAt) return 'none';
  if (poll.closedAt) return 'closed';
  if (poll.closesAt && new Date(poll.closesAt).getTime() <= now.getTime()) {
    return 'expired';
  }
  return 'open';
}

/** Ordre d'affichage : ce qui bouge d'abord, puis le plus récent. */
const STATE_ORDER: Record<MvpPollState, number> = {
  open: 0,
  expired: 1,
  closed: 2,
  none: 3,
};

/**
 * Assemble le tableau. Un match n'y figure que s'il a un vote ouvert (ou
 * passé) OU des voix : les matchs à venir sans rien n'ont pas leur place dans
 * un suivi de votes.
 */
export function buildVoteBoard(input: {
  matches: VoteBoardMatchInput[];
  polls: Map<string, VoteBoardPollInput>;
  votes: Map<string, MvpVote[]>;
  members: Map<string, VoteBoardMember>;
  now: Date;
}): VoteBoard {
  const { polls, votes, members, now } = input;
  const label = (id: string) => members.get(id)?.label ?? UNKNOWN;

  const out: VoteBoardMatch[] = [];
  for (const m of input.matches) {
    const poll = polls.get(m.id) ?? null;
    const matchVotes = votes.get(m.id) ?? [];
    const state = pollState(poll, now);
    if (state === 'none' && matchVotes.length === 0) continue;

    const sources: VoteBoardSource[] = [];
    for (const source of ['twitch', 'discord'] as const) {
      const tally = tallySource(matchVotes, source);
      if (tally.total === 0) continue;
      sources.push({
        source,
        total: tally.total,
        rows: tally.rows.map((r) => ({
          ...r,
          label: label(r.memberId),
          teamName: members.get(r.memberId)?.teamName ?? null,
        })),
      });
    }

    const outcome = resolveMatchMvp({ matchId: m.id }, matchVotes);
    const leader: VoteBoardMatch['leader'] = outcome.award
      ? {
          memberId: outcome.award.memberId,
          label: label(outcome.award.memberId),
          source: outcome.award.source,
          votes: outcome.award.winnerVotes,
          total: outcome.award.totalVotes,
        }
      : { memberId: null, reason: outcome.reason };

    out.push({
      ...m,
      state,
      closesAt: poll?.closesAt ?? null,
      closedAt: poll?.closedAt ?? null,
      totalVotes: sources.reduce((sum, s) => sum + s.total, 0),
      sources,
      leader,
      winner: poll?.winnerMemberId
        ? {
            memberId: poll.winnerMemberId,
            label: label(poll.winnerMemberId),
            source: poll.winnerSource,
            votes: poll.winnerVotes,
            total: poll.totalVotes,
          }
        : null,
    });
  }

  out.sort((a, b) => {
    if (a.state !== b.state) return STATE_ORDER[a.state] - STATE_ORDER[b.state];
    return (b.scheduledAt ?? '').localeCompare(a.scheduledAt ?? '');
  });

  return {
    matches: out,
    totals: {
      votes: out.reduce((sum, m) => sum + m.totalVotes, 0),
      openPolls: out.filter((m) => m.state === 'open').length,
      matchesWithVotes: out.filter((m) => m.totalVotes > 0).length,
    },
  };
}
