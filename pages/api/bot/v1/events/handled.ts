// POST /api/bot/v1/events/handled
//
// Le bot claim qu'il s'apprête à traiter un event (ou l'a traité). INSERT
// avec ON CONFLICT DO NOTHING : retourne `wasNew=true` si la row a été
// créée (le caller peut dispatcher), `wasNew=false` si l'event était déjà
// claimé (skip dispatch).
//
// Pattern d'usage côté bot :
//
//   const claim = await claimEventApi(eventId, 'webhook');
//   if (!claim.wasNew) return; // déjà traité
//   await dispatchEvent(...);
//
// Idempotent : même eventId peut être POST plusieurs fois sans erreur.
// Auth : x-api-key (BOT_API_KEY).

import { z } from 'zod';
import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withBotRoute } from '@/utils/botAuth';
import { uuidSchema } from '@/utils/botValidation';
import { logger } from '@/utils/logger';

// eventId : UUID requis (uuidSchema = ancien isValidUUID + trim).
// source : optionnel. Sémantique historique = string acceptée seulement si
// length <= 32, sinon traitée comme `null` (PAS de rejet). On reproduit ça
// avec un transform qui nullifie les valeurs hors borne plutôt que de 400.
const handledBodySchema = z.object({
  eventId: uuidSchema,
  source: z
    .unknown()
    .transform((v) => (typeof v === 'string' && v.length <= 32 ? v : null))
    .optional(),
});

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const input = req.botInput as z.infer<typeof handledBodySchema>;
  const eventId = input.eventId;
  const source = input.source ?? null;

  // 1) Check d'abord pour distinguer wasNew vs existing. INSERT ON CONFLICT
  //    DO NOTHING ne dit pas directement si une row a été créée sans un
  //    select supplémentaire. On fait donc SELECT puis INSERT si absent,
  //    avec un fallback gérant la race condition (deux réplicas bot qui
  //    claim simultanément le même event_id).
  const { data: existing, error: selErr } = await supabaseAdmin
    .from('discord_event_ack')
    .select('handled_at')
    .eq('event_id', eventId)
    .maybeSingle();
  if (selErr) {
    logger.error('[bot/events/handled] select error', selErr);
    return res.status(500).json({ error: 'Erreur de lecture' });
  }
  if (existing) {
    return res.status(200).json({
      wasNew: false,
      handledAt: existing.handled_at,
    });
  }

  const { data: inserted, error: insErr } = await supabaseAdmin
    .from('discord_event_ack')
    .insert({ event_id: eventId, source })
    .select('handled_at')
    .maybeSingle();

  // Race : un autre process a inséré entre le SELECT et l'INSERT. PostgreSQL
  // renvoie un 23505 (unique violation) car event_id est PK.
  if (insErr) {
    if ((insErr as { code?: string }).code === '23505') {
      // Re-fetch pour renvoyer le handled_at canonique (de l'autre process).
      const { data: now } = await supabaseAdmin
        .from('discord_event_ack')
        .select('handled_at')
        .eq('event_id', eventId)
        .maybeSingle();
      return res.status(200).json({
        wasNew: false,
        handledAt: now?.handled_at ?? null,
      });
    }
    logger.error('[bot/events/handled] insert error', insErr);
    return res.status(500).json({ error: 'Erreur de claim' });
  }

  return res.status(201).json({
    wasNew: true,
    handledAt: inserted?.handled_at ?? null,
  });
}

export default withBotRoute(handler, {
  methods: ['POST'],
  rateLimit: { max: 240, key: 'bot-events-handled' },
  idempotent: false, // l'endpoint est lui-même idempotent (INSERT ON CONFLICT)
  bodySchema: handledBodySchema,
  // NON gaté : fait partie de la boucle de livraison d'outbox (pending →
  // process → handled), infra du bot et non une feature tenant. Le gating des
  // opérations de production (qui CRÉENT les cues) vit sur cast/runs/broadcast.
});
