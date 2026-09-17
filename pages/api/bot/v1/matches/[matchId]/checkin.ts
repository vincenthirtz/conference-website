// POST /api/bot/v1/matches/[matchId]/checkin
//
// Permet au bot Discord de valider le check-in d'une equipe via un clic de
// bouton (DM T-30, salon prive du match) ou /checkin, sans passage navigateur.
//
// Au clic, le bot appelle cet endpoint avec le Discord user id de la personne ;
// on retrouve son compte via user_discord_links, on determine pour QUELLE
// equipe du match elle peut pointer, et on redeem le token cote serveur — le
// token n'a jamais besoin de sortir.
//
// Qui peut pointer (decision 2026-09-17, regle unique dans
// utils/teams/canCheckIn.ts) : la capitaine (teams.captain_id), ou une membre
// au role d'equipe coach / manager (casse et espaces ignores). Avant : la
// capitaine SEULE, ce qui laissait une equipe sans capitaine (creee par une
// manager) sans aucun moyen de pointer depuis Discord.
//
// Le bouton est poste dans le salon prive du match, visible des DEUX roles
// d'equipe : c'est donc ici, et nulle part ailleurs, que se joue le refus
// d'une joueuse simple ou d'une capitaine adverse.
//
// Auth: x-api-key (BOT_API_KEY) + regle ci-dessus sur le discordUserId.

import { z } from 'zod';
import type { NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withBotRoute, type BotTenantRequest } from '@/utils/botAuth';
import { redeemCheckinToken } from '@/utils/checkin';
import {
  loadCheckinPermission,
  type CheckinPermission,
} from '@/utils/teams/canCheckIn';
import { logPlayerAction } from '@/utils/botPlayerLogs';
import { logger } from '@/utils/logger';
import { checkinBodySchema } from '@/lib/apiContracts/bot/matches/[matchId]/checkin';
import { checkinQuerySchema } from '@/lib/apiContracts/bot/matches/[matchId]/checkin.query';

async function handler(req: BotTenantRequest, res: NextApiResponse) {
  const { matchId } = req.botQuery as z.infer<typeof checkinQuerySchema>;
  const { discordUserId } = req.botInput as z.infer<typeof checkinBodySchema>;

  const { data: match, error: matchErr } = await supabaseAdmin
    .from('matches')
    .select(
      `id, status, scheduled_at, is_bye,
       team1_id, team2_id,
       team1_checkin_token, team2_checkin_token,
       team1:team1_id (id, name, captain_id),
       team2:team2_id (id, name, captain_id)`
    )
    .eq('tenant_id', req.botContext.tenantId)
    .eq('id', matchId)
    .maybeSingle();

  if (matchErr) {
    logger.error('[bot/matches/checkin] match lookup error', matchErr);
    return res.status(500).json({ error: 'Erreur de lecture du match' });
  }
  if (!match) return res.status(404).json({ error: 'Match introuvable' });
  if (match.is_bye) {
    return res
      .status(400)
      .json({ error: 'Match marque bye, check-in inutile' });
  }

  const team1 = Array.isArray((match as any).team1)
    ? (match as any).team1[0]
    : (match as any).team1;
  const team2 = Array.isArray((match as any).team2)
    ? (match as any).team2[0]
    : (match as any).team2;

  // 1. Qui clique ? Sans compte relie, on ne peut rien verifier : refus.
  //    `discord_user_id` est UNIQUE en base, d'ou maybeSingle.
  const { data: link, error: linkErr } = await supabaseAdmin
    .from('user_discord_links')
    .select('auth_user_id')
    .eq('discord_user_id', discordUserId)
    .maybeSingle();

  if (linkErr) {
    logger.error('[bot/matches/checkin] link lookup error', linkErr);
    return res.status(500).json({
      error: 'Erreur de vérification du compte. Réessaie dans un instant.',
    });
  }

  const actorAuthId =
    (link as { auth_user_id?: string | null } | null)?.auth_user_id ?? null;
  if (!actorAuthId) {
    return res.status(403).json({
      error:
        "Ton compte Discord n'est pas relié à un compte du site : impossible de vérifier que tu peux faire le check-in. Le check-in est fait par la capitaine, le coach ou la manager de l'équipe.",
      code: 'CHECKIN_NOT_ALLOWED',
    });
  }

  // 2. Pour quelle(s) equipe(s) du match peut-elle pointer ? Les deux cotes
  //    sont evalues : une capitaine adverse est ainsi refusee pour l'autre
  //    equipe, et on ne suppose pas qu'une personne n'appartient qu'a un cote.
  const sides = [
    { slot: 1 as const, teamId: team1?.id ?? match.team1_id ?? null },
    { slot: 2 as const, teamId: team2?.id ?? match.team2_id ?? null },
  ].filter((s): s is { slot: 1 | 2; teamId: string } => !!s.teamId);

  const evaluated: { slot: 1 | 2; permission: CheckinPermission }[] =
    await Promise.all(
      sides.map(async (s) => ({
        slot: s.slot,
        permission: await loadCheckinPermission(
          actorAuthId,
          req.botContext.tenantId,
          s.teamId
        ),
      }))
    );

  const allowedSides = evaluated.filter((e) => e.permission.allowed);

  if (allowedSides.length === 0) {
    // Lecture en echec : on ne sait pas, on ne refuse pas pour autant — 500,
    // que le bot affiche et que l'utilisatrice peut rejouer (idempotent).
    if (evaluated.some((e) => e.permission.failed)) {
      return res.status(500).json({
        error:
          'Erreur de vérification des droits de check-in. Réessaie dans un instant.',
      });
    }
    return res.status(403).json({
      error:
        "Le check-in est fait par la capitaine, le coach ou la manager de l'équipe. Tu n'as pas ce rôle pour ce match.",
      code: 'CHECKIN_NOT_ALLOWED',
    });
  }

  // Autorisee des deux cotes (ex. capitaine d'une equipe et manager de
  // l'autre) : le capitanat tranche. Sinon on ne choisit pas a sa place —
  // pointer la mauvaise equipe serait pire qu'un refus explicite.
  let chosen = allowedSides[0];
  if (allowedSides.length > 1) {
    const captainSides = allowedSides.filter(
      (e) => e.permission.authority === 'captain'
    );
    if (captainSides.length !== 1) {
      return res.status(409).json({
        error:
          "Tu peux faire le check-in des deux équipes de ce match : impossible de savoir laquelle pointer depuis Discord. Utilise le lien de check-in de l'équipe concernée ou contacte le staff.",
        code: 'CHECKIN_TEAM_AMBIGUOUS',
      });
    }
    chosen = captainSides[0];
  }

  const side: 1 | 2 = chosen.slot;
  const token =
    side === 1 ? match.team1_checkin_token : match.team2_checkin_token;

  if (!token) {
    return res.status(409).json({
      error:
        "Le check-in n'est pas encore ouvert pour ce match (token non genere).",
    });
  }

  const result = await redeemCheckinToken(req.botContext.tenantId, token);
  if (!result.ok) {
    return res.status(400).json({ error: result.error });
  }

  if (!result.alreadyCheckedIn) {
    logger.info('[bot/matches/checkin] team checked in via bot', {
      matchId: result.matchId,
      teamSlot: result.teamSlot,
      discordUserId,
      actorAuthId,
      authority: chosen.permission.authority,
    });
    void logPlayerAction({
      tenantId: req.botContext.tenantId,
      actorAuthUserId: actorAuthId,
      actorDiscordUserId: discordUserId,
      action: 'checkin',
      entityType: 'match',
      entityId: result.matchId,
      // `authority` : capitaine ou role d'equipe — l'audit doit dire a quel
      // titre l'equipe a ete engagee, maintenant que ce n'est plus toujours
      // la capitaine.
      payload: {
        team_slot: result.teamSlot,
        authority: chosen.permission.authority,
      },
    });
  }

  return res.status(200).json({
    success: true,
    matchId: result.matchId,
    teamSlot: result.teamSlot,
    teamName: result.teamName,
    checkedInAt: result.checkedInAt,
    alreadyCheckedIn: result.alreadyCheckedIn,
  });
}

export default withBotRoute(handler, {
  methods: ['POST'],
  rateLimit: {
    max: 60,
    key: 'bot-match-checkin',
    // Action par personne (capitaine, coach, manager) : borne par acteur (id
    // sous `discordUserId`).
    perActor: { max: 10, windowMs: 60_000, actorField: 'discordUserId' },
  },
  idempotent: true,
  bodySchema: checkinBodySchema,
  querySchema: checkinQuerySchema,
});
