// pages/api/bot/v1/free-players/announcement.ts
//
// POST — le bot dit OÙ il a annoncé une fiche « joueuse libre ».
//
// POURQUOI. L'annonce Discord (`free_player.registered`) survivait à la fiche :
// retrait, péremption, suppression staff, le message restait dans le salon de
// recrutement. Le bot ne tient pas d'état ; c'est donc le site qui garde
// l'ancrage, et qui demandera la suppression (`free_player.withdrawn`) le jour
// où la fiche s'en ira. Même principe que l'ancrage du vote MVP public.
//
// 404 si la fiche n'existe plus : elle a été retirée entre l'inscription et la
// fin de l'annonce. Le bot supprime alors aussitôt le message qu'il vient de
// poster — sinon il resterait orphelin, sans plus personne pour le réclamer.
//
// Fiches web seulement : le bot n'annonce que les inscriptions du site, et une
// fiche Discord vit au rythme du rôle, pas d'une annonce.

import type { z } from 'zod';
import type { NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withBotRoute, type BotTenantRequest } from '@/utils/botAuth';
import { logger } from '@/utils/logger';
import {
  ANNOUNCEMENT_SELECT,
  requestAnnouncementWithdrawal,
  type AnnouncedRow,
} from '@/utils/freePlayers/announcement';
import { announcementBodySchema } from '@/lib/apiContracts/bot/free-players/announcement';

const NOT_FOUND = {
  error: 'Aucune fiche « joueuse libre » ne correspond.',
  code: 'FREE_PLAYER_NOT_FOUND',
} as const;

async function handler(req: BotTenantRequest, res: NextApiResponse) {
  if (!supabaseAdmin) {
    return res.status(503).json({ error: 'Service indisponible.' });
  }

  const tenantId = req.botContext.tenantId;
  const body = req.botInput as z.infer<typeof announcementBodySchema>;

  const { data: existing, error: readErr } = await supabaseAdmin
    .from('free_players')
    .select(ANNOUNCEMENT_SELECT)
    .eq('id', body.freePlayerId)
    .eq('tenant_id', tenantId)
    .eq('source', 'web')
    .maybeSingle();
  if (readErr) {
    logger.error('[bot/free-players/announcement] read error', readErr, {
      tenantId,
    });
    return res.status(500).json({ error: 'Lecture impossible.' });
  }
  if (!existing) return res.status(404).json(NOT_FOUND);

  const previous = existing as AnnouncedRow;

  const { error: updateErr } = await supabaseAdmin
    .from('free_players')
    .update({
      discord_announce_channel_id: body.channelId,
      discord_announce_message_id: body.messageId,
    })
    .eq('id', body.freePlayerId)
    .eq('tenant_id', tenantId);
  if (updateErr) {
    logger.error('[bot/free-players/announcement] update error', updateErr, {
      tenantId,
    });
    return res.status(500).json({ error: 'Ancrage impossible.' });
  }

  // Une fiche n'a qu'UNE annonce vivante. Si un autre message était déjà
  // ancré (réannonce après prolongation, rejeu), l'ancien part — sinon il
  // deviendrait orphelin, plus jamais réclamé par personne.
  if (
    previous.discord_announce_message_id &&
    previous.discord_announce_message_id !== body.messageId
  ) {
    await requestAnnouncementWithdrawal(previous, 'removed');
  }

  return res.status(200).json({ ok: true });
}

export default withBotRoute(handler, {
  methods: ['POST'],
  rateLimit: { max: 30, key: 'bot-free-players-announcement' },
  idempotent: true,
  bodySchema: announcementBodySchema,
});
