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
// Body : { discordThreadId?, discordScheduledEventId?, discordDisputeThreadId?,
//          discordMatchChannelId? }
// Passer null pour vider un champ (utile quand le thread/event/salon Discord a
// ete supprime manuellement et qu'on veut autoriser le bot a en recreer un).
//
// Degradation gracieuse (T4) : `discord_match_channel_id` est ajoute par une
// migration separee qui peut ne pas encore etre appliquee au moment du deploy.
// Si l'update echoue parce que la colonne manque (Postgres 42703), on renvoie
// un 503 explicite plutot qu'un 500 opaque, sans impacter les 3 autres champs.

import { z } from 'zod';
import type { NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withBotRoute, type BotTenantRequest } from '@/utils/botAuth';
import { uuidSchema } from '@/utils/botValidation';
import { logger } from '@/utils/logger';

const DISCORD_SNOWFLAKE_RE = /^[0-9]{15,25}$/;

// matchId (path) seulement. Le body PATCH garde sa validation inline : la
// distinction « clé absente » (champ non touché) vs « clé = null » (efface la
// colonne) repose sur `key in body` via readSnowflake(), non modélisable
// proprement en zod avec .optional().nullable().
const discordQuerySchema = z.object({ matchId: uuidSchema });

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

async function handler(req: BotTenantRequest, res: NextApiResponse) {
  const { matchId } = req.botQuery as z.infer<typeof discordQuerySchema>;

  const body = (req.body ?? {}) as Record<string, unknown>;

  // Colonnes stables (toujours presentes). Le select critique ne lit QUE
  // celles-ci : `discord_match_channel_id` n'y est PAS ajoute pour ne pas
  // casser le writeback des 3 champs historiques si la migration T4 n'est pas
  // encore appliquee.
  const STABLE_COLS =
    'id, discord_thread_id, discord_scheduled_event_id, discord_dispute_thread_id';

  // Colonne T4, ajoutee par une migration separee (peut etre absente).
  const CHANNEL_COL = 'discord_match_channel_id';

  const fields: Array<[string, string]> = [
    ['discordThreadId', 'discord_thread_id'],
    ['discordScheduledEventId', 'discord_scheduled_event_id'],
    ['discordDisputeThreadId', 'discord_dispute_thread_id'],
    ['discordMatchChannelId', CHANNEL_COL],
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
        'Aucun champ a mettre a jour (discordThreadId, discordScheduledEventId, discordDisputeThreadId, discordMatchChannelId).',
    });
  }

  const touchesChannel = CHANNEL_COL in updates;

  const { data: match, error: mErr } = await supabaseAdmin
    .from('matches')
    .select(STABLE_COLS)
    .eq('tenant_id', req.botContext.tenantId)
    .eq('id', matchId)
    .maybeSingle();
  if (mErr) {
    logger.error('[bot/match/discord] lookup error', mErr);
    return res.status(500).json({ error: 'Erreur de chargement du match' });
  }
  if (!match) return res.status(404).json({ error: 'Match introuvable' });

  // Le select de retour inclut la colonne T4 uniquement quand on l'a touchee,
  // de sorte qu'un PATCH des 3 champs historiques ne depend jamais d'elle.
  const returnCols = touchesChannel
    ? `${STABLE_COLS}, ${CHANNEL_COL}`
    : STABLE_COLS;

  const { data: updated, error: upErr } = await supabaseAdmin
    .from('matches')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('tenant_id', req.botContext.tenantId)
    .eq('id', matchId)
    .select(returnCols)
    .maybeSingle();
  if (upErr || !updated) {
    // Colonne T4 absente (migration pas encore appliquee) : erreur claire,
    // pas de 500 opaque. Postgres remonte 42703 (undefined_column).
    if (
      touchesChannel &&
      ((upErr as { code?: string } | null)?.code === '42703' ||
        /discord_match_channel_id/i.test(
          (upErr as { message?: string })?.message ?? ''
        ))
    ) {
      logger.error(
        '[bot/match/discord] colonne discord_match_channel_id absente',
        upErr
      );
      return res.status(503).json({
        error:
          'Champ discordMatchChannelId indisponible : migration discord_match_channel_id non appliquee.',
        code: 'CHANNEL_COLUMN_MISSING',
      });
    }
    logger.error('[bot/match/discord] update error', upErr);
    return res.status(500).json({ error: 'Echec de la mise a jour' });
  }

  return res.status(200).json({ success: true, match: updated });
}

export default withBotRoute(handler, {
  methods: ['PATCH'],
  rateLimit: { max: 60, key: 'bot-match-discord' },
  idempotent: true,
  querySchema: discordQuerySchema,
  // Régie+ : liaison salons/threads Discord d'un match (production).
  requireCapability: 'discordEventOps:full',
});
