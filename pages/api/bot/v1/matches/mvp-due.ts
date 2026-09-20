// GET /api/bot/v1/matches/mvp-due
//
// Les votes MVP dont la fenêtre est écoulée et qui n'ont pas encore été
// dépouillés. Le bot vient les chercher, appelle `close` sur chacun, puis édite
// son message pour annoncer la gagnante.
//
// POURQUOI LE BOT ET PAS UN CRON DU SITE. Le dépouillement pourrait tourner
// côté site — mais l'annonce, elle, doit éditer un message Discord, ce que seul
// le bot peut faire. Faire porter les deux au bot évite qu'un vote soit clos en
// base sans que le message correspondant cesse d'inviter à voter : c'est
// exactement l'écart qui avait rendu l'ancien sondage inexploitable.

import type { NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { withBotRoute, type BotTenantRequest } from '@/utils/botAuth';
import { logger } from '@/utils/logger';

/** Garde-fou : une réponse du poller reste petite et prévisible. */
const MAX_ROWS = 25;

async function handler(req: BotTenantRequest, res: NextApiResponse) {
  const tenantId = req.botContext.tenantId;
  const nowIso = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from('match_mvp_polls')
    .select(
      `id, match_id, closes_at, discord_channel_id, discord_message_id,
       match:matches!inner(id, round_name, tournament_id,
         team1:teams!matches_team1_fk(name),
         team2:teams!matches_team2_fk(name))`
    )
    .eq('tenant_id', tenantId)
    .not('posted_at', 'is', null)
    .is('closed_at', null)
    .lte('closes_at', nowIso)
    .order('closes_at', { ascending: true })
    .limit(MAX_ROWS);

  if (error) {
    logger.error('[bot/mvp-due] error', error);
    return res.status(500).json({ error: 'Erreur de chargement' });
  }

  const due = (data || []).map((row) => {
    const raw = (row as { match?: unknown }).match;
    const match = (Array.isArray(raw) ? raw[0] : raw) as {
      round_name: string | null;
      tournament_id: string | null;
      team1?: { name?: string } | { name?: string }[] | null;
      team2?: { name?: string } | { name?: string }[] | null;
    } | null;
    const pick = (t: unknown): string | null => {
      const v = (Array.isArray(t) ? t[0] : t) as { name?: string } | null;
      return v?.name ?? null;
    };
    return {
      matchId: row.match_id as string,
      closesAt: row.closes_at as string | null,
      channelId: row.discord_channel_id as string | null,
      messageId: row.discord_message_id as string | null,
      roundName: match?.round_name ?? null,
      tournamentId: match?.tournament_id ?? null,
      team1Name: pick(match?.team1),
      team2Name: pick(match?.team2),
    };
  });

  return res.status(200).json({ due, count: due.length });
}

export default withBotRoute(handler, {
  methods: ['GET'],
  rateLimit: { max: 120, key: 'bot-mvp-due' },
});
