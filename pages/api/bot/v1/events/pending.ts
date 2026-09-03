// GET /api/bot/v1/events/pending
//
// Retourne les events bot non encore livres (status='pending' dans la
// table bot_event_outbox), tries du plus ancien au plus recent. Sert au
// bot pour rattraper les events que le push HTTP n'a pas pu delivrer
// (bot down, deploiement, network, etc.).
//
// Le bot consume ces events, fait son traitement, puis appelle
// POST /api/bot/v1/events/[id]/ack pour marquer le succes.
//
// SCOPING : dépend de la clé appelante (`req.botKey`). Le bot MUTUALISÉ voit
// les events de tous les tenants — c'est ce qui lui permet de router vers le
// bon serveur, et chaque row porte son `tenantId` pour ça. Un bot
// auto-hébergé, lui, ne reçoit que les events de SON tenant : le contenu d'un
// event (noms d'équipes, litiges, signalements) n'a rien à faire ailleurs.
//
// Auth : x-api-key (BOT_API_KEY). Pas d'acteur staff — c'est un endpoint
// de service consomme par le bot lui-meme.

import type { NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withBotRoute, type BotCrossTenantRequest } from '@/utils/botAuth';
import { logger } from '@/utils/logger';

const MAX_LIMIT = 200;
const DEFAULT_LIMIT = 50;

async function handler(req: BotCrossTenantRequest, res: NextApiResponse) {
  const rawLimit = Number(req.query.limit);
  const limit =
    Number.isInteger(rawLimit) && rawLimit > 0
      ? Math.min(rawLimit, MAX_LIMIT)
      : DEFAULT_LIMIT;

  let query = supabaseAdmin
    .from('bot_event_outbox')
    .select(
      'id, event_id, event_name, tenant_id, payload, push_attempts, last_push_error, last_push_at, created_at'
    )
    .eq('status', 'pending');
  if (!req.botKey.isPlatformKey) {
    query = query.eq('tenant_id', req.botKey.tenantId);
  }
  const { data, error } = await query
    .order('created_at', { ascending: true })
    .limit(limit);

  if (error) {
    logger.error('[bot/events/pending] error', error);
    return res.status(500).json({ error: 'Erreur de lecture' });
  }

  const events = (data ?? []).map((row) => {
    const r = row as {
      id: number;
      event_id: string;
      event_name: string;
      tenant_id: string;
      payload: unknown;
      push_attempts: number;
      last_push_error: string | null;
      last_push_at: string | null;
      created_at: string;
    };
    return {
      id: r.id,
      eventId: r.event_id,
      eventName: r.event_name,
      tenantId: r.tenant_id,
      payload: r.payload,
      pushAttempts: r.push_attempts,
      lastPushError: r.last_push_error,
      lastPushAt: r.last_push_at,
      createdAt: r.created_at,
    };
  });

  return res.status(200).json({ events, count: events.length });
}

export default withBotRoute(handler, {
  methods: ['GET'],
  rateLimit: { max: 60, key: 'bot-events-pending' },
  crossTenant: true,
});
