// POST /api/bot/v1/tickets/close-log
//
// Le bot Discord possède un système de tickets. À la FERMETURE d'un ticket, il
// pousse ici un enregistrement d'audit que le site archive dans `staff_logs`
// (visible dans /admin/logs) avec `via: 'discord_bot'`.
//
// On résout le Discord id de la personne qui ferme le ticket
// (`closedByDiscordId`) vers son compte site via `user_discord_links`
// (global — pas de scope tenant sur cette table). L'`auth_user_id` lié sert de
// `staffId` ; s'il n'y a pas de lien, `staffId` est null et `logBotStaffAction`
// est un no-op (aucune row écrite).
//
// Auth : x-api-key (per-tenant). Tenant-scopé : req.botContext.tenantId.
//
// Réponse 200 : { logged: boolean }. `logged` vaut true si une row staff_logs a
// été écrite (closer lié au site), false sinon (closer non lié).

import { z } from 'zod';
import type { NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withBotRoute, type BotTenantRequest } from '@/utils/botAuth';
import { discordIdSchema, boundedString } from '@/utils/botValidation';
import { logBotStaffAction } from '@/utils/botActor';
import { logger } from '@/utils/logger';

const closeLogBodySchema = z.object({
  closedByDiscordId: discordIdSchema,
  number: z.number().int().min(0),
  category: boundedString(1, 100),
  openerDiscordId: discordIdSchema,
  claimedByDiscordId: discordIdSchema.nullish(),
  messageCount: z.number().int().min(0).nullish(),
  channelName: boundedString(1, 200).nullish(),
});

async function handler(req: BotTenantRequest, res: NextApiResponse) {
  const input = req.botInput as z.infer<typeof closeLogBodySchema>;

  // Résolution du closer Discord -> auth_user_id (NULL si non lié au site).
  // user_discord_links est global (pas de colonne tenant_id).
  let staffId: string | null = null;
  const { data: link, error: linkErr } = await supabaseAdmin
    .from('user_discord_links')
    .select('auth_user_id')
    .eq('discord_user_id', input.closedByDiscordId)
    .maybeSingle();
  if (linkErr) {
    logger.error('[bot/tickets/close-log] link lookup error', linkErr);
    return res
      .status(500)
      .json({ error: 'Erreur de résolution du compte lié.' });
  }
  if (typeof link?.auth_user_id === 'string') {
    staffId = link.auth_user_id;
  }

  // Audit : no-op si staffId est null (closer non lié). Erreurs swallow côté
  // helper — l'audit ne doit jamais faire échouer la fermeture du ticket.
  await logBotStaffAction({
    staffId,
    action: 'ticket_closed',
    entity_type: 'ticket',
    entity_id: String(input.number),
    payload: {
      category: input.category,
      openerDiscordId: input.openerDiscordId,
      claimedByDiscordId: input.claimedByDiscordId ?? null,
      messageCount: input.messageCount ?? null,
      channelName: input.channelName ?? null,
    },
  });

  return res.status(200).json({ logged: staffId !== null });
}

export default withBotRoute(handler, {
  methods: ['POST'],
  rateLimit: { max: 30, key: 'bot-tickets-close-log' },
  bodySchema: closeLogBodySchema,
});
