// PATCH /api/bot/v1/matches/[matchId]/discord
//
// Writeback bot -> site des IDs Discord lies a un match. Le bot cree/modifie
// les objets Discord natifs (thread #matchs-live, scheduled event, thread
// forum dispute) et persiste leurs IDs ici pour assurer l'idempotence des
// handlers d'event suivants (ne pas recreer un thread si on a deja le sien).
//
// Auth : x-api-key uniquement (pas de actorDiscordUserId staff requis).
// L'appelant est le bot lui-meme via son service account, pas un admin
// Discord. Les writebacks sont scope-restreints aux 3 colonnes ci-dessous.
//
// Body : { discordThreadId?, discordScheduledEventId?, discordDisputeThreadId? }
// Passer null pour vider un champ (utile quand le thread/event Discord a ete
// supprime manuellement et qu'on veut autoriser le bot a en recreer un).

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withBotRoute } from '@/utils/botAuth';
import { isValidUUID } from '@/utils/apiHelpers';
import { logger } from '@/utils/logger';

const DISCORD_SNOWFLAKE_RE = /^[0-9]{15,25}$/;

function readSnowflake(
  body: Record<string, unknown>,
  key: string
): { has: boolean; value: string | null; error?: string } {
  if (!(key in body)) return { has: false, value: null };
  const v = body[key];
  if (v === null) return { has: true, value: null };
  if (typeof v === 'string' && DISCORD_SNOWFLAKE_RE.test(v.trim())) {
    return { has: true, value: v.trim() };
  }
  return {
    has: true,
    value: null,
    error: `${key} invalide (snowflake Discord attendu)`,
  };
}

async function handler(req: NextApiRequest, res: NextApiResponse) {
  const raw = req.query.matchId;
  const matchId = Array.isArray(raw) ? raw[0] : raw;
  if (!matchId || !isValidUUID(matchId)) {
    return res.status(400).json({ error: 'matchId invalide' });
  }

  const body = (req.body ?? {}) as Record<string, unknown>;

  const fields: Array<[string, string]> = [
    ['discordThreadId', 'discord_thread_id'],
    ['discordScheduledEventId', 'discord_scheduled_event_id'],
    ['discordDisputeThreadId', 'discord_dispute_thread_id'],
  ];

  const updates: Record<string, string | null> = {};
  for (const [bodyKey, dbCol] of fields) {
    const parsed = readSnowflake(body, bodyKey);
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    if (parsed.has) updates[dbCol] = parsed.value;
  }

  if (Object.keys(updates).length === 0) {
    return res.status(400).json({
      error:
        'Aucun champ a mettre a jour (discordThreadId, discordScheduledEventId, discordDisputeThreadId).',
    });
  }

  const { data: match, error: mErr } = await supabaseAdmin
    .from('matches')
    .select(
      'id, discord_thread_id, discord_scheduled_event_id, discord_dispute_thread_id'
    )
    .eq('id', matchId)
    .maybeSingle();
  if (mErr) {
    logger.error('[bot/match/discord] lookup error', mErr);
    return res.status(500).json({ error: 'Erreur de chargement du match' });
  }
  if (!match) return res.status(404).json({ error: 'Match introuvable' });

  const { data: updated, error: upErr } = await supabaseAdmin
    .from('matches')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', matchId)
    .select(
      'id, discord_thread_id, discord_scheduled_event_id, discord_dispute_thread_id'
    )
    .maybeSingle();
  if (upErr || !updated) {
    logger.error('[bot/match/discord] update error', upErr);
    return res.status(500).json({ error: 'Echec de la mise a jour' });
  }

  return res.status(200).json({ success: true, match: updated });
}

export default withBotRoute(handler, {
  methods: ['PATCH'],
  rateLimit: { max: 60, key: 'bot-match-discord' },
  idempotent: true,
});
