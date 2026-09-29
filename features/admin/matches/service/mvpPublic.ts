// features/admin/matches/service/mvpPublic.ts — scrutin MVP du PUBLIC,
// piloté par le cockpit régie (qui relaie les voix vues dans le chat).
//
// Pourquoi une route staff : exposer le vote au public reviendrait à publier
// un formulaire de bourrage d'urne. Pourquoi un LOT : sur un pic de chat,
// une requête par message mettrait l'API à genoux. Un lot ne fait pas échec
// en bloc : les voix refusées sont comptées, les autres passent.
//
// Le métier vit dans utils/mvp/* (ouverture, dépouillement, journal staff et
// événement bot compris) : ce service ne fait que l'appeler.

import { LegacyAdminError } from '@/utils/admin/errors';
import type { ServiceContext } from '@/utils/admin/serviceContext';
import { listMvpCandidates } from '@/utils/mvp/service';
import {
  castPublicVotes,
  readPublicPoll,
  readPublicVotes,
} from '@/utils/mvp/publicVote';
import {
  closePublicVoteForMatch,
  openPublicVoteForMatch,
} from '@/utils/mvp/publicVoteActions';
import { tallySource } from '@/utils/mvp/awards';
import { MvpPublicBody } from '../schemas';

/** L'état complet du scrutin, pour que le cockpit se remonte après un refresh. */
export async function getPublicMvp(ctx: ServiceContext, matchId: string) {
  const { match, candidates } = await listMvpCandidates(ctx.tenantId, matchId);
  if (!match) throw new LegacyAdminError(404, 'Match introuvable');

  const poll = await readPublicPoll(ctx.tenantId, matchId);
  const votes = poll ? await readPublicVotes(ctx.tenantId, matchId) : [];

  const isOpen =
    !!poll &&
    !poll.closed_at &&
    !!poll.closes_at &&
    new Date(poll.closes_at).getTime() > Date.now();

  return {
    matchId,
    status: match.status,
    roundName: match.roundName,
    team1Name: match.team1Name,
    team2Name: match.team2Name,
    candidates,
    poll,
    isOpen,
    // Les décomptes, jamais les `voter_key` : savoir pour qui Untel a voté
    // n'est l'affaire de personne, staff compris.
    tallies: {
      twitch: tallySource(votes, 'twitch'),
      discord: tallySource(votes, 'discord'),
    },
  };
}

/**
 * POST — `open` | `vote` | `close`. Corps invalide → 400 « Corps invalide »
 * (message historique, sans détail par champ).
 */
export async function actOnPublicMvp(
  ctx: ServiceContext,
  staffId: string | null,
  matchId: string,
  raw: unknown
) {
  const parsed = MvpPublicBody.safeParse(raw);
  if (!parsed.success) throw new LegacyAdminError(400, 'Corps invalide');
  const body = parsed.data;

  if (body.action === 'open') {
    // Ouvert depuis le site : c'est le site qui prévient le bot.
    const opened = await openPublicVoteForMatch(ctx.tenantId, matchId, {
      windowMinutes: body.windowMinutes,
      staffId,
      notifyBot: true,
    });
    if (!opened.ok) throw new LegacyAdminError(opened.status, opened.error);
    return {
      poll: opened.poll,
      candidates: opened.candidates,
      alreadyOpen: opened.alreadyOpen,
      votable: opened.votable,
    };
  }

  if (body.action === 'vote') {
    // Pas de journal : c'est le public qui vote, pas un geste de staff.
    return castPublicVotes(ctx.tenantId, matchId, body.source, body.votes);
  }

  const closed = await closePublicVoteForMatch(ctx.tenantId, matchId, {
    staffId,
    notifyBot: true,
    origin: 'admin/mvp-public',
  });
  if (!closed.ok) throw new LegacyAdminError(closed.status, closed.error);
  return {
    success: true,
    award: closed.award,
    winnerLabel: closed.winnerLabel,
    reason: closed.reason,
    tallies: closed.tallies,
    team1Name: closed.team1Name,
    team2Name: closed.team2Name,
  };
}
