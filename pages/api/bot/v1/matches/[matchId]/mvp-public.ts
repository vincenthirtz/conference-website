// pages/api/bot/v1/matches/[matchId]/mvp-public.ts
//
// LE SECOND BUREAU DE VOTE DU SCRUTIN PUBLIC : celui des supporters Discord.
//
//   GET                              -> état + candidates, pour poster le message
//   POST { action: 'vote' }          -> une voix de supportrice
//   POST { action: 'anchor' }        -> où le bot a posté, pour éditer ensuite
//   POST { action: 'open' }          -> un admin lance le vote (/mvp-public)
//   POST { action: 'close' }         -> un admin le clôt (/mvp-public)
//
// OUVRIR / CLORE DEPUIS DISCORD — décision de l'orga du 2026-09-27. Le vote du
// public ne s'ouvrait que depuis le cockpit régie, parce que c'est elle qui
// l'annonce à l'antenne. Mais un match sans diffusion n'avait alors aucun vote
// du public. Un admin peut donc le lancer depuis Discord (`/mvp-public`, gate
// admin côté bot) ou depuis l'onglet « MVP du public » du site.
//   La régie reste l'autorité quand elle diffuse. Depuis le 2026-09-30, un vote
// ouvert HORS cockpit reçoit AUSSI les `!mvp` du chat Twitch : le serveur lit
// le chat pendant le vote (utils/twitch/chatVoteSubscription.ts,
// pages/api/webhooks/twitch/chat-mvp.ts), si la chaîne a accordé les scopes
// du chat.
//   Pas d'événement renvoyé au bot pour ces deux gestes : c'est lui qui a
// appelé, il poste / édite lui-même dans la foulée (cf. publicVoteActions).
//
// UNE VOIX ICI VAUT UNE VOIX DU CHAT. Elles atterrissent dans la même table,
// sous deux `source` différentes, et le dépouillement les ADDITIONNE : viewers
// et supporters sont un seul public, réparti sur deux plateformes.
//
// CE QUI FILTRE LES VOTANTES N'EST PAS ICI. L'appartenance au rôle Supporter
// est vérifiée par le BOT, qui seul connaît les rôles Discord. Cette route
// fait confiance à son appelant — comme toutes les routes `/bot/v1/*`, dont
// la clé d'API est le seul sésame.

import type { NextApiResponse } from 'next';

import { withBotRoute, type BotTenantRequest } from '@/utils/botAuth';
import { listMvpCandidates } from '@/utils/mvp/service';
import {
  castPublicVotes,
  readPublicPoll,
  readPublicVotes,
} from '@/utils/mvp/publicVote';
import { tallySource } from '@/utils/mvp/awards';
import {
  closePublicVoteForMatch,
  openPublicVoteForMatch,
} from '@/utils/mvp/publicVoteActions';
import { supabaseAdmin } from '@/utils/supabase';
import { logger } from '@/utils/logger';
import type { z } from 'zod';
import { mvpPublicBodySchema } from '@/lib/apiContracts/bot/matches/[matchId]/mvp-public';
import { mvpPublicQuerySchema } from '@/lib/apiContracts/bot/matches/[matchId]/mvp-public.query';

async function handler(req: BotTenantRequest, res: NextApiResponse) {
  const { matchId } = req.botQuery as z.infer<typeof mvpPublicQuerySchema>;
  const tenantId = req.botContext.tenantId;

  if (req.method === 'GET') {
    const { match, candidates } = await listMvpCandidates(tenantId, matchId);
    if (!match) return res.status(404).json({ error: 'Match introuvable' });

    const poll = await readPublicPoll(tenantId, matchId);
    const votes = poll ? await readPublicVotes(tenantId, matchId) : [];
    const isOpen =
      !!poll &&
      !poll.closed_at &&
      !!poll.closes_at &&
      new Date(poll.closes_at).getTime() > Date.now();

    return res.status(200).json({
      matchId,
      roundName: match.roundName,
      team1Name: match.team1Name,
      team2Name: match.team2Name,
      candidates,
      isOpen,
      closesAt: poll?.closes_at ?? null,
      channelId: poll?.discord_channel_id ?? null,
      messageId: poll?.discord_message_id ?? null,
      // Décomptes agrégés seulement. Les `voter_key` ne sortent d'aucune API,
      // pas même vers le bot : savoir pour qui quelqu'un a voté n'est
      // l'affaire de personne.
      tallies: {
        twitch: tallySource(votes, 'twitch'),
        discord: tallySource(votes, 'discord'),
      },
    });
  }

  const body = req.botInput as z.infer<typeof mvpPublicBodySchema>;

  if (body.action === 'open') {
    const opened = await openPublicVoteForMatch(tenantId, matchId, {
      windowMinutes: body.windowMinutes ?? undefined,
      notifyBot: false,
    });
    if (!opened.ok) {
      return res
        .status(opened.status)
        .json({ error: opened.error, code: opened.code });
    }
    logger.info(
      `[bot/mvp-public] open match=${matchId} by discord=${body.discordUserId ?? '?'} alreadyOpen=${opened.alreadyOpen}`
    );
    // Tout ce qu'il faut au bot pour poster son sélecteur sans second appel —
    // et l'ancrage éventuel, pour qu'il ne reposte pas un vote déjà affiché.
    return res.status(200).json({
      matchId,
      roundName: opened.match.roundName,
      team1Name: opened.match.team1Name,
      team2Name: opened.match.team2Name,
      closesAt: opened.poll.closes_at,
      candidates: opened.candidates,
      alreadyOpen: opened.alreadyOpen,
      votable: opened.votable,
      channelId: opened.poll.discord_channel_id ?? null,
      messageId: opened.poll.discord_message_id ?? null,
    });
  }

  if (body.action === 'close') {
    const closed = await closePublicVoteForMatch(tenantId, matchId, {
      notifyBot: false,
      origin: `bot/mvp-public discord=${body.discordUserId ?? '?'}`,
    });
    if (!closed.ok) {
      return res
        .status(closed.status)
        .json({ error: closed.error, code: closed.code });
    }
    return res.status(200).json({
      matchId,
      winnerLabel: closed.winnerLabel,
      winnerMemberId: closed.award?.memberId ?? null,
      reason: closed.reason,
      team1Name: closed.team1Name,
      team2Name: closed.team2Name,
      bySource: closed.award?.bySource ?? null,
      totalVotes: closed.award?.totalVotes ?? null,
    });
  }

  if (body.action === 'anchor') {
    if (!body.channelId || !body.messageId) {
      return res
        .status(400)
        .json({ error: 'channelId et messageId sont requis' });
    }
    const poll = await readPublicPoll(tenantId, matchId);
    if (!poll) return res.status(404).json({ error: 'Scrutin non ouvert' });

    const { error } = await supabaseAdmin
      .from('match_public_mvp_polls')
      .update({
        discord_channel_id: body.channelId,
        discord_message_id: body.messageId,
        updated_at: new Date().toISOString(),
      })
      .eq('tenant_id', tenantId)
      .eq('id', poll.id);

    if (error) {
      logger.error('[bot/mvp-public] anchor error:', error);
      return res.status(500).json({ error: 'Échec de l’ancrage' });
    }
    return res.status(200).json({ success: true });
  }

  // action === 'vote'
  if (!body.discordUserId || !body.memberId) {
    return res
      .status(400)
      .json({ error: 'discordUserId et memberId sont requis' });
  }

  // `castPublicVotes` prend un lot ; ici il n'y en a qu'une. On réutilise le
  // même chemin plutôt que d'en écrire un second : une seule implémentation
  // des refus (scrutin clos, joueuse hors liste) vaut mieux que deux qui
  // divergeront.
  const result = await castPublicVotes(tenantId, matchId, 'discord', [
    { voterKey: body.discordUserId, memberId: body.memberId },
  ]);

  if (result.accepted === 0) {
    if (result.rejected.closed > 0) {
      return res.status(409).json({ error: 'Le vote du public est clos' });
    }
    if (result.rejected.notCandidate > 0) {
      return res
        .status(400)
        .json({ error: "Cette joueuse n'est pas candidate sur ce match" });
    }
    return res.status(500).json({ error: 'Échec de l’enregistrement' });
  }

  return res.status(200).json({ success: true, memberId: body.memberId });
}

export default withBotRoute(handler, {
  methods: ['GET', 'POST'],
  rateLimit: {
    // Un vote de masse est le comportement NORMAL : la borne globale est
    // large, c'est la borne par personne qui empêche le matraquage. Plus
    // serrée qu'à côté (20/min) : un scrutin public dure dix minutes, une
    // supportrice n'a aucune raison de voter dix fois.
    max: 900,
    key: 'bot-match-mvp-public',
    perActor: { max: 10, windowMs: 60_000, actorField: 'discordUserId' },
  },
  bodySchema: mvpPublicBodySchema,
  querySchema: mvpPublicQuerySchema,
});
