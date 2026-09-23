// pages/api/admin/matches/[matchId]/mvp-public.ts
//
// LE SCRUTIN MVP DU PUBLIC, piloté par le cockpit régie.
//
//   GET                              -> état du scrutin + candidates + décomptes
//   POST { action: 'open' }          -> ouvre (fenêtre courte, défaut 10 min)
//   POST { action: 'vote', votes }   -> encaisse un LOT de voix
//   POST { action: 'close' }         -> dépouille et ferme
//
// POURQUOI UNE ROUTE STAFF ET PAS UNE ROUTE PUBLIQUE. Les votantes sont le
// public, mais ce n'est pas le public qui appelle : c'est le cockpit régie,
// qui lit le chat Twitch et relaie les voix. Exposer une route publique
// reviendrait à publier un formulaire de bourrage d'urne — n'importe qui
// pourrait poster mille `voterKey` inventés. Le cockpit, lui, ne relaie que
// des logins réellement vus dans le chat.
//
// POURQUOI UN LOT ET PAS UNE VOIX. Sur un pic de chat, `!mvp N` arrive par
// dizaines par seconde. Une requête par message mettrait l'API à genoux et
// ferait exploser le quota de fonctions. Le cockpit groupe ce qu'il a vu
// pendant sa fenêtre de publication (~1,5 s) et envoie un seul appel.
//
// LE LOT NE FAIT PAS ÉCHEC EN BLOC. Un `!mvp 47` dans le tas est NORMAL ; il
// est compté comme refusé et les autres passent. La régie reçoit le détail
// des refus, pas un 400 qui perdrait quarante voix valides.

import type { NextApiRequest, NextApiResponse } from 'next';
import { z } from 'zod';

import { withStaffRoute, type AuthenticatedStaffContext } from '@/utils/staff';
import { logStaffAction } from '@/utils/staffLogs';
import { isValidUUID } from '@/utils/apiHelpers';
import { applyRateLimit } from '@/utils/rateLimit';
import { listMvpCandidates } from '@/utils/mvp/service';
import {
  DEFAULT_PUBLIC_WINDOW_MINUTES,
  castPublicVotes,
  openPublicVote,
  readPublicPoll,
  readPublicVotes,
  settlePublicVote,
} from '@/utils/mvp/publicVote';
import { tallySource } from '@/utils/mvp/awards';
import { logger } from '@/utils/logger';
import { emitBotEvent } from '@/utils/botEvents';

/**
 * 200 voix par appel : large pour un pic de chat réel, assez bas pour qu'un
 * cockpit détraqué ne puisse pas pousser un million de lignes d'un coup.
 */
const MAX_VOTES_PER_BATCH = 200;

const voteSchema = z.object({
  voterKey: z.string().trim().min(1).max(64),
  memberId: z.string().uuid(),
});

const bodySchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('open'),
    windowMinutes: z.number().int().min(1).max(360).optional(),
  }),
  z.object({
    action: z.literal('vote'),
    // 'twitch' = viewers du chat, 'discord' = supporters du serveur.
    source: z.enum(['twitch', 'discord']),
    votes: z.array(voteSchema).min(1).max(MAX_VOTES_PER_BATCH),
  }),
  z.object({ action: z.literal('close') }),
]);

export default withStaffRoute(handler, 'caster');

async function handler(
  req: NextApiRequest,
  res: NextApiResponse,
  ctx: AuthenticatedStaffContext
) {
  const { matchId } = req.query;
  if (!matchId || Array.isArray(matchId) || !isValidUUID(matchId)) {
    return res.status(400).json({ error: 'matchId invalide' });
  }
  const id = String(matchId);
  const tenantId = ctx.tenantId;

  // Garde exprimée en POSITIF, et pas par `!== 'POST'` : le détecteur de
  // dérive OpenAPI (`openapiContractDrift.test.ts`) lit les méthodes dans le
  // source, et un `===` plus haut dans le fichier neutralise sa lecture des
  // formes négatives. La forme positive dit la même chose et reste visible.
  const method =
    req.method === 'GET' || req.method === 'POST' ? req.method : null;
  if (!method) {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Méthode non autorisée' });
  }

  if (method === 'GET') return handleGet(res, tenantId, id);

  // Le cockpit publie environ toutes les 1,5 s pendant un scrutin : 120/min
  // laisse de la marge à deux onglets ouverts sans ouvrir la porte à un
  // martèlement.
  //
  // ⚠️ `applyRateLimit` rend `true` quand elle a BLOQUÉ — elle a alors déjà
  // écrit le 429. La condition se lit donc « si ça a bloqué, on sort », et
  // l'inverser fait sortir le chemin NORMAL sans rien répondre : la requête
  // part en 200 avec un corps vide, ce qui ne ressemble à aucune panne connue.
  if (applyRateLimit(req, res, { max: 120, windowMs: 60_000 }, 'mvp-public')) {
    return;
  }

  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Corps invalide' });
  }
  const body = parsed.data;

  if (body.action === 'open') {
    const { match } = await listMvpCandidates(tenantId, id);
    if (!match) return res.status(404).json({ error: 'Match introuvable' });

    // Mêmes deux refus que le vote des équipes, et pour les mêmes raisons :
    // on ne vote pas sur une partie en cours, ni sur une partie non jouée.
    if (match.status !== 'finished') {
      return res
        .status(409)
        .json({ error: "Le match n'est pas terminé", status: match.status });
    }
    if (match.isWalkover) {
      return res.status(409).json({
        error: "Ce match n'a pas été joué (forfait ou bye) : pas de MVP",
      });
    }

    const opened = await openPublicVote(tenantId, id, {
      windowMinutes: body.windowMinutes ?? DEFAULT_PUBLIC_WINDOW_MINUTES,
    });
    if (!opened) {
      return res.status(500).json({ error: "Échec de l'ouverture du scrutin" });
    }

    if (ctx?.staff?.id && !opened.alreadyOpen) {
      await logStaffAction({
        staff_id: ctx.staff.id,
        action: 'open_public_mvp',
        entity_type: 'match',
        entity_id: id,
        tournament_id: match.tournamentId,
        payload: { closesAt: opened.poll.closes_at },
      });
    }

    // Le bot ouvre son propre bureau de vote sur Discord. POUSSÉ, et pas
    // laissé à son poller : celui-ci tourne toutes les dix minutes, soit la
    // durée entière du scrutin — il le raterait.
    //
    // Rejouer un `open` sur un scrutin déjà ouvert n'émet RIEN : sans ça, un
    // double-clic en régie posterait deux messages de vote.
    if (!opened.alreadyOpen) {
      await emitBotEvent(
        'mvp.public.opened',
        {
          matchId: id,
          roundName: match.roundName,
          team1Name: match.team1Name,
          team2Name: match.team2Name,
          closesAt: opened.poll.closes_at,
          // Ordonnées : le bot compose son sélecteur sans second appel.
          candidates: opened.candidates.map((c) => ({
            memberId: c.memberId,
            label: c.label,
            teamName: c.teamName,
          })),
        },
        tenantId
      );
    }

    return res.status(200).json({
      poll: opened.poll,
      candidates: opened.candidates,
      alreadyOpen: opened.alreadyOpen,
      votable: opened.candidates.length >= 2,
    });
  }

  if (body.action === 'vote') {
    const result = await castPublicVotes(tenantId, id, body.source, body.votes);
    // Pas de journal staff ici : une ligne par lot noierait le journal, et ce
    // n'est pas un geste de staff — c'est le public qui vote.
    return res.status(200).json(result);
  }

  // action === 'close'
  const settled = await settlePublicVote(tenantId, id, { close: true });
  if (!settled) return res.status(404).json({ error: 'Match introuvable' });

  // Le nom de l'élue, pour que l'appelant l'affiche sans second aller-retour.
  let winnerLabel: string | null = null;
  if (settled.award) {
    const { candidates } = await listMvpCandidates(tenantId, id);
    winnerLabel =
      candidates.find((c) => c.memberId === settled.award!.memberId)?.label ??
      null;
  }

  if (ctx?.staff?.id) {
    await logStaffAction({
      staff_id: ctx.staff.id,
      action: 'close_public_mvp',
      entity_type: 'match',
      entity_id: id,
      tournament_id: null,
      payload: { winnerMemberId: settled.award?.memberId ?? null },
    });
  }

  logger.info(
    `[admin/mvp-public] close match=${id} winner=${settled.award?.memberId ?? 'none'} reason=${settled.reason ?? '-'}`
  );

  // Le bot ferme son sélecteur et affiche le résultat. Même urgence qu'à
  // l'ouverture : laisser un bouton cliquable sur un scrutin clos est
  // exactement le décrochage que ce système existe pour empêcher.
  await emitBotEvent(
    'mvp.public.closed',
    {
      matchId: id,
      winnerLabel,
      winnerMemberId: settled.award?.memberId ?? null,
      reason: settled.reason,
      team1Name: settled.team1Name,
      team2Name: settled.team2Name,
      bySource: settled.award?.bySource ?? null,
    },
    tenantId
  );

  return res.status(200).json({
    success: true,
    award: settled.award,
    winnerLabel,
    reason: settled.reason,
    tallies: settled.tallies,
    team1Name: settled.team1Name,
    team2Name: settled.team2Name,
  });
}

/** L'état complet du scrutin, pour que le cockpit se remonte après un refresh. */
async function handleGet(
  res: NextApiResponse,
  tenantId: string,
  matchId: string
) {
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
  });
}
