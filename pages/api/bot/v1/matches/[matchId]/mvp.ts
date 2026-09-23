// GET/POST /api/bot/v1/matches/[matchId]/mvp
//
// Le vote MVP d'un match, vu du bot Discord. Remplace l'ancien sondage natif
// posté par WEBHOOK, qui n'était pas relisible : la gagnante devait être
// ressaisie à la main par le staff, match par match — jamais fait en deux
// éditions, d'où une table de MVP vide alors que l'onglet MVP était public.
//
// Un vote posté PAR LE BOT est, lui, relisible : chaque clic revient ici, la
// voix est stockée, et la gagnante se dépouille toute seule à la fermeture.
//
//   GET                      → candidates + état du vote (pour (re)poster le message)
//   POST { action: 'open' }  → ouvre le vote, fige les candidates, ancre le message
//   POST { action: 'vote' }  → une voix (une par personne, la dernière compte)
//   POST { action: 'close' } → ferme et dépouille, rend la gagnante
//
// Auth : x-api-key (BOT_API_KEY) + x-tenant-id. Pas d'acteur staff : voter est
// ouvert à tout le serveur, c'est le principe d'un vote du public.

import { z } from 'zod';
import type { NextApiResponse } from 'next';
import { withBotRoute, type BotTenantRequest } from '@/utils/botAuth';
import {
  castMvpVote,
  listMvpCandidates,
  openMvpVote,
  readMvpPoll,
  settleMatchMvp,
} from '@/utils/mvp/service';
import { logger } from '@/utils/logger';
import { mvpBodySchema } from '@/lib/apiContracts/bot/matches/[matchId]/mvp';
import { mvpQuerySchema } from '@/lib/apiContracts/bot/matches/[matchId]/mvp.query';

/** Erreurs de `castMvpVote` → statut + message montrable dans Discord. */
const VOTE_ERRORS: Record<string, { status: number; message: string }> = {
  no_poll: { status: 409, message: "Aucun vote MVP n'est ouvert sur ce match" },
  closed: { status: 409, message: 'Le vote MVP est clos' },
  not_a_candidate: {
    status: 400,
    message: "Cette joueuse n'est pas candidate sur ce match",
  },
  write_failed: { status: 500, message: 'Échec de l’enregistrement du vote' },
};

async function handler(req: BotTenantRequest, res: NextApiResponse) {
  const { matchId } = req.botQuery as z.infer<typeof mvpQuerySchema>;
  const tenantId = req.botContext.tenantId;

  if (req.method === 'GET') {
    const { match, candidates } = await listMvpCandidates(tenantId, matchId);
    if (!match) return res.status(404).json({ error: 'Match introuvable' });
    const poll = await readMvpPoll(tenantId, matchId);
    return res.status(200).json({
      matchId,
      status: match.status,
      roundName: match.roundName,
      candidates,
      poll,
    });
  }

  const body = req.botInput as z.infer<typeof mvpBodySchema>;

  if (body.action === 'open') {
    // Un vote ne s'ouvre que sur un match RÉELLEMENT terminé. Sans ce garde-fou,
    // un `match.finished` rejoué sur un match rouvert pour litige relancerait
    // un vote sur une partie dont le score est contesté.
    const { match } = await listMvpCandidates(tenantId, matchId);
    if (!match) return res.status(404).json({ error: 'Match introuvable' });
    if (match.status !== 'finished') {
      return res
        .status(409)
        .json({ error: "Le match n'est pas terminé", status: match.status });
    }

    // Forfait ou bye : il n'y a pas eu de partie, donc personne à élire. Règle
    // héritée de l'auto-post par webhook, qui la portait explicitement — la
    // perdre en changeant de canal aurait fait voter sur des matchs non joués,
    // `match.finished` étant émis pour les walkovers aussi (isForfeit: true).
    if (match.isWalkover) {
      return res.status(409).json({
        error: "Ce match n'a pas été joué (forfait ou bye) : pas de MVP",
      });
    }

    const opened = await openMvpVote(tenantId, matchId, {
      channelId: body.channelId ?? null,
      messageId: body.messageId ?? null,
      durationHours: body.durationHours ?? undefined,
    });
    if (!opened) {
      return res.status(500).json({ error: "Échec de l'ouverture du vote" });
    }

    // Moins de deux candidates : il n'y a rien à voter. On le dit au bot plutôt
    // que de le laisser poster un message à un seul bouton.
    return res.status(200).json({
      poll: opened.poll,
      candidates: opened.candidates,
      votable: opened.candidates.length >= 2,
      // Noms des équipes : le bot compose son message sans eux quand
      // l'ouverture vient d'une commande staff et non de l'événement du match.
      match: opened.match,
    });
  }

  if (body.action === 'vote') {
    if (!body.discordUserId || !body.memberId) {
      return res
        .status(400)
        .json({ error: 'discordUserId et memberId sont requis' });
    }

    const result = await castMvpVote({
      tenantId,
      matchId,
      memberId: body.memberId,
      source: 'discord',
      voterKey: body.discordUserId,
    });

    if (!result.ok) {
      const mapped = VOTE_ERRORS[result.error] ?? {
        status: 500,
        message: 'Erreur',
      };
      return res.status(mapped.status).json({ error: mapped.message });
    }

    return res.status(200).json({
      success: true,
      memberId: result.memberId,
      changed: result.changed,
    });
  }

  // action === 'close'
  const settled = await settleMatchMvp(tenantId, matchId, { close: true });
  if (!settled) return res.status(404).json({ error: 'Match introuvable' });

  // Le bot annonce la gagnante en éditant son message : il lui faut un NOM,
  // pas un identifiant. On le rend ici plutôt que de lui faire un second
  // aller-retour — et parce que c'est le site, pas le bot, qui sait comment
  // une joueuse veut être nommée (display_name avant BattleTag).
  let winnerLabel: string | null = null;
  if (settled.award) {
    const { candidates } = await listMvpCandidates(tenantId, matchId);
    winnerLabel =
      candidates.find((c) => c.memberId === settled.award!.memberId)?.label ??
      null;
  }

  // L'ancrage du message accompagne le résultat. Sans lui, une clôture demandée
  // AVANT l'échéance (`/mvp clore`) dépouillerait en base sans toucher au
  // message Discord : le sélecteur continuerait d'inviter à voter sur un vote
  // clos — exactement le décrochage que ce système existe pour empêcher. La
  // liste des votes échus, elle, porte déjà l'ancrage ; une clôture à la
  // demande n'y figure pas, par définition.
  const poll = await readMvpPoll(tenantId, matchId);

  logger.info(
    `[bot/mvp] close match=${matchId} winner=${settled.award?.memberId ?? 'none'} reason=${settled.reason ?? '-'}`
  );

  return res.status(200).json({
    success: true,
    award: settled.award,
    winnerLabel,
    reason: settled.reason,
    tallies: settled.tallies,
    channelId: poll?.discord_channel_id ?? null,
    messageId: poll?.discord_message_id ?? null,
    // Les équipes, pour la même raison que l'ancrage juste au-dessus : le bot
    // nomme le match dans ses DEUX messages de clôture, et il n'obtient ces
    // noms que par la liste des votes échus. Une clôture demandée (`/mvp
    // clore`) n'y figure pas, et affichait « Équipe 1 vs Équipe 2 ».
    team1Name: settled.team1Name,
    team2Name: settled.team2Name,
  });
}

export default withBotRoute(handler, {
  methods: ['GET', 'POST'],
  rateLimit: {
    // Un vote de masse est le comportement NORMAL ici : la borne globale est
    // large, et c'est la borne par personne qui empêche le matraquage.
    max: 600,
    key: 'bot-match-mvp',
    perActor: { max: 20, windowMs: 60_000, actorField: 'discordUserId' },
  },
  bodySchema: mvpBodySchema,
  querySchema: mvpQuerySchema,
});
