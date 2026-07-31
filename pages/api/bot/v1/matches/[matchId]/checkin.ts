// POST /api/bot/v1/matches/[matchId]/checkin
//
// Permet au bot Discord de valider le check-in d'un capitaine via un clic
// de bouton DM, sans passage navigateur.
//
// Le bot DM les deux capitaines a T-30 (cf. /api/bot/v1/reminders) avec un
// bouton "Check-in". Au clic, le bot appelle cet endpoint avec le Discord
// user id du capitaine ; on retrouve l'equipe via user_discord_links et on
// redeem le token cote serveur — le token n'a jamais besoin de sortir.
//
// Auth: x-api-key (BOT_API_KEY) + verification que le discordUserId est
// bien lie a l'un des deux capitaines du match.

import { z } from 'zod';
import type { NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withBotRoute, type BotTenantRequest } from '@/utils/botAuth';
import { discordIdSchema, uuidSchema } from '@/utils/botValidation';
import { redeemCheckinToken } from '@/utils/checkin';
import { logPlayerAction } from '@/utils/botPlayerLogs';
import { logger } from '@/utils/logger';

const checkinBodySchema = z.object({ discordUserId: discordIdSchema });
const checkinQuerySchema = z.object({ matchId: uuidSchema });

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

  const captainIds: string[] = [team1?.captain_id, team2?.captain_id].filter(
    (v): v is string => typeof v === 'string'
  );
  if (captainIds.length === 0) {
    return res
      .status(400)
      .json({ error: 'Aucun capitaine defini pour ce match' });
  }

  // Resolve which captain the discordUserId belongs to.
  const { data: links, error: linkErr } = await supabaseAdmin
    .from('user_discord_links')
    .select('auth_user_id, discord_user_id')
    .in('auth_user_id', captainIds)
    .eq('discord_user_id', discordUserId)
    .limit(1);

  if (linkErr) {
    logger.error('[bot/matches/checkin] link lookup error', linkErr);
    return res.status(500).json({ error: 'Erreur de verification capitaine' });
  }

  const matchedCaptainAuthId = links?.[0]?.auth_user_id ?? null;
  if (!matchedCaptainAuthId) {
    return res.status(403).json({
      error:
        "Ce compte Discord n'est pas le capitaine d'une des deux equipes de ce match.",
    });
  }

  const side: 1 | 2 = matchedCaptainAuthId === team1?.captain_id ? 1 : 2;
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
    logger.info('[bot/matches/checkin] captain checked in via bot', {
      matchId: result.matchId,
      teamSlot: result.teamSlot,
      discordUserId,
      captainAuthId: matchedCaptainAuthId,
    });
    void logPlayerAction({
      tenantId: req.botContext.tenantId,
      actorAuthUserId: matchedCaptainAuthId,
      actorDiscordUserId: discordUserId,
      action: 'checkin',
      entityType: 'match',
      entityId: result.matchId,
      payload: { team_slot: result.teamSlot },
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
    // Action par capitaine : borne par acteur (id sous `discordUserId`).
    perActor: { max: 10, windowMs: 60_000, actorField: 'discordUserId' },
  },
  idempotent: true,
  bodySchema: checkinBodySchema,
  querySchema: checkinQuerySchema,
});
