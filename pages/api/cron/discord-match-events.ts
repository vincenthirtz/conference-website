// pages/api/cron/discord-match-events.ts
//
// Filet des événements Discord programmés des matchs : chaque matin, tout
// match des 36 prochaines heures qui n'a pas encore d'event Discord
// (`matches.discord_scheduled_event_id` NULL) est re-signalé au bot par un
// `match.scheduled`.
//
// POURQUOI. Le bot ne crée l'event qu'à réception de `match.scheduled`, émis
// quand le créneau d'un match CHANGE (utils/matches/scheduleEvents.ts). Tout
// match daté par un chemin qui n'émettait pas — la planification en masse de
// la saison 2026, le 31/08, avant le correctif du 11/09 — n'avait jamais
// d'event : le 07/10, la soirée a démarré sans rien sur le Discord.
//
// LA VEILLE. Passage quotidien à 10:00 UTC, horizon 36 h : la soirée du
// lendemain entière (dernier match ~22:00 UTC) est couverte dès la veille au
// matin, et un oubli du jour même est rattrapé au passage.
//
// BOT SEUL. Livraison directe (pushBotEventDirect), PAS par l'outbox : les
// dispatchers push/email la lisent aussi et enverraient aux joueuses un
// « Match planifié » pour un match connu depuis des semaines.
//
// IDEMPOTENT. Le bot réécrit `discord_scheduled_event_id` dès l'event créé :
// le passage suivant ne voit plus le match. Une livraison ratée est retentée
// le lendemain (encore dans l'horizon si le match est le soir même).
//
// Auth : Bearer CRON_SECRET (header) ou ?secret=... (query). GET + POST.
// `?dry_run=1` liste les matchs visés sans rien livrer.

import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '@/utils/supabase';
import { pushBotEventDirect } from '@/utils/botEvents';
import { enrichMatchEvent } from '@/utils/matches/botEventEnrich';
import { buildScheduleEvents } from '@/utils/matches/scheduleEvents';
import { logger } from '@/utils/logger';

/** Fenêtre couverte à chaque passage. */
export const HORIZON_HOURS = 36;
/** Plafond par passage (Discord limite à 100 events programmés par serveur). */
const BATCH = 50;

type MatchRow = {
  id: string;
  tenant_id: string;
  tournament_id: string | null;
  scrim_id: string | null;
  scheduled_at: string;
};

function isAuthorized(req: NextApiRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    logger.error('[cron/discord-match-events] CRON_SECRET absent — refus');
    return false;
  }
  if (req.headers.authorization === `Bearer ${secret}`) return true;
  const q = req.query.secret;
  return typeof q === 'string' && q === secret;
}

export async function runDiscordMatchEvents(
  now: Date = new Date(),
  dryRun = false
) {
  const horizon = new Date(now.getTime() + HORIZON_HOURS * 3_600_000);
  const { data, error } = await supabaseAdmin
    .from('matches')
    .select('id, tenant_id, tournament_id, scrim_id, scheduled_at')
    .is('discord_scheduled_event_id', null)
    .is('deleted_at', null)
    .neq('status', 'finished')
    .gt('scheduled_at', now.toISOString())
    .lte('scheduled_at', horizon.toISOString())
    .order('scheduled_at', { ascending: true })
    .limit(BATCH);
  if (error) {
    logger.error('[cron/discord-match-events] lookup error', error);
    return { candidates: 0, delivered: 0, failed: 0, error: 'lookup_failed' };
  }

  const rows = (data ?? []) as MatchRow[];
  if (dryRun) {
    return {
      candidates: rows.length,
      delivered: 0,
      failed: 0,
      dryRun: true,
      matches: rows.map((r) => ({ id: r.id, scheduledAt: r.scheduled_at })),
    };
  }

  let delivered = 0;
  let failed = 0;
  // Séquentiel : quelques matchs par jour, et le bot crée les events un par
  // un côté Discord (rate limit par serveur).
  for (const m of rows) {
    const enriched = await enrichMatchEvent(m.id);
    const [item] = buildScheduleEvents(
      {
        matchId: m.id,
        tournamentId: m.tournament_id,
        scrimId: m.scrim_id,
        previous: null,
        next: m.scheduled_at,
      },
      enriched
    );
    const result = await pushBotEventDirect(item.event, item.data, m.tenant_id);
    if (result.delivered) {
      delivered++;
    } else {
      failed++;
      logger.warn(
        '[cron/discord-match-events] livraison échouée match=%s (%s)',
        m.id,
        result.error ?? 'inconnu'
      );
    }
  }
  return { candidates: rows.length, delivered, failed };
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    res.setHeader('Allow', 'POST,GET');
    return res.status(405).json({ error: 'Method not allowed' });
  }
  if (!isAuthorized(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const dryRun = req.query.dry_run === '1';
    const result = await runDiscordMatchEvents(new Date(), dryRun);
    logger.info(
      '[cron/discord-match-events] tick candidates=%d delivered=%d failed=%d',
      result.candidates,
      result.delivered,
      result.failed
    );
    return res.status(200).json(result);
  } catch (err) {
    logger.error('[cron/discord-match-events] handler error', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
