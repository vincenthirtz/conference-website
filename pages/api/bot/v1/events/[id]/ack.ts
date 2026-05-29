// POST /api/bot/v1/events/[id]/ack
//
// Le bot acknowledge la livraison d'un event recupere via
// GET /api/bot/v1/events/pending. La row passe a status='delivered',
// delivered_at=now(). Idempotent — re-acknowledger une row deja delivered
// renvoie 200 sans erreur.
//
// EXCEPTION DE SCOPING TENANT_ID : pendant que /events/pending est
// cross-tenant (le bot route via le tenantId inclus dans chaque row), l'ack
// l'est aussi — sinon le bot devrait reenvoyer un header x-tenant-id
// derive de la row, ce qui rend le contract plus fragile. L'`id` (PK
// numerique) est globalement unique, donc pas de risque de collision.
//
// Auth : x-api-key (BOT_API_KEY). Le bot s'authentifie via la cle ; pas
// d'acteur Discord requis (c'est le bot lui-meme).
//
// L'id dans l'URL est l'integer `id` de bot_event_outbox (pas l'event_id
// UUID, qui est la cle externe).

import { z } from 'zod';
import type { NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withBotRoute, type BotCrossTenantRequest } from '@/utils/botAuth';
import { logger } from '@/utils/logger';

// L'`id` dans l'URL est l'integer PK de bot_event_outbox (pas l'event_id UUID).
// req.query.id est une string → z.coerce.number().int().positive() reproduit
// exactement le check historique `Number.isInteger(id) && id > 0`.
// Pas de bodySchema : le body est vide pour cette route (on n'en rejette pas
// l'absence).
const ackQuerySchema = z.object({
  id: z.coerce.number().int().positive(),
});

async function handler(req: BotCrossTenantRequest, res: NextApiResponse) {
  const { id } = req.botQuery as z.infer<typeof ackQuerySchema>;

  const { data: row, error: fetchErr } = await supabaseAdmin
    .from('bot_event_outbox')
    .select('id, status')
    .eq('id', id)
    .maybeSingle();
  if (fetchErr) {
    logger.error('[bot/events/ack] lookup error', fetchErr);
    return res.status(500).json({ error: 'Erreur de chargement' });
  }
  if (!row) {
    return res.status(404).json({ error: 'Event introuvable' });
  }

  if (row.status === 'delivered') {
    // Idempotent : pas d'erreur, on renvoie l'etat actuel.
    return res
      .status(200)
      .json({ success: true, id, status: 'delivered', alreadyAcked: true });
  }

  const { error: updErr } = await supabaseAdmin
    .from('bot_event_outbox')
    .update({
      status: 'delivered',
      delivered_at: new Date().toISOString(),
    })
    .eq('id', id);
  if (updErr) {
    logger.error('[bot/events/ack] update error', updErr);
    return res.status(500).json({ error: "Echec de l'ack" });
  }

  return res.status(200).json({ success: true, id, status: 'delivered' });
}

export default withBotRoute(handler, {
  methods: ['POST'],
  rateLimit: { max: 120, key: 'bot-events-ack' },
  idempotent: true,
  crossTenant: true,
  querySchema: ackQuerySchema,
});
