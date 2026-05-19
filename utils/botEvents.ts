// utils/botEvents.ts
//
// Push sortant signe HMAC vers le bot Discord (repo separe).
//
// Le bot poll deja /api/bot/v1/reminders, mais le polling est trop lent pour les
// evenements latence-sensibles (annonce de match qui commence, dispute ouverte,
// news qui sort). Cet emetteur permet au site de pousser ces evenements en
// quelques ms.
//
// Auth : HMAC-SHA256 du body (raw JSON string) avec BOT_WEBHOOK_SECRET. Le bot
// recalcule la signature cote receveur et compare en constant-time.
//
// Livraison at-least-once :
//   1. Chaque event est insere dans bot_event_outbox (status='pending').
//   2. On tente le push HTTP (3 retries, backoff lineaire).
//   3. Sur succes : status='delivered', delivered_at=now().
//   4. Sur echec : row reste 'pending' ; le bot peut la rattraper via
//      GET /api/bot/v1/events/pending puis POST /api/bot/v1/events/[id]/ack.

import crypto from 'crypto';
import { supabaseAdmin } from './supabase';
import { logger } from './logger';

export type BotEventName =
  | 'match.starting'
  | 'match.scheduled'
  | 'match.unscheduled'
  | 'match.disputed'
  | 'match.dispute.resolved'
  | 'match.finished'
  | 'news.published'
  | 'team.created'
  | 'team.dissolved'
  | 'team.member.added'
  | 'team.member.removed'
  | 'team.captain.changed'
  | 'staff.role.changed'
  | 'scrim.created'
  | 'scrim.scheduled'
  | 'scrim.starting'
  | 'scrim.finished'
  | 'scrim.cancelled'
  | 'scrim.deleted'
  | 'cast.assigned'
  | 'cast.unassigned'
  | 'cast.briefing.rescheduled';

export type BotEventPayload = Record<string, unknown>;

export type EmitResult = {
  delivered: boolean;
  status?: number;
  error?: string;
  attempts: number;
};

const MAX_ATTEMPTS = 3;
const TIMEOUT_MS = 5_000;

function isConfigured(): boolean {
  return Boolean(process.env.BOT_WEBHOOK_URL && process.env.BOT_WEBHOOK_SECRET);
}

async function persistOutbox(params: {
  eventId: string;
  eventName: BotEventName;
  payload: unknown;
}): Promise<number | null> {
  if (!supabaseAdmin) return null;
  const { data, error } = await supabaseAdmin
    .from('bot_event_outbox')
    .insert({
      event_id: params.eventId,
      event_name: params.eventName,
      payload: params.payload,
      status: 'pending',
    })
    .select('id')
    .maybeSingle();
  if (error) {
    logger.error('[botEvents] outbox insert error', error);
    return null;
  }
  return (data?.id as number | undefined) ?? null;
}

async function markDelivered(outboxId: number): Promise<void> {
  if (!supabaseAdmin) return;
  const { error } = await supabaseAdmin
    .from('bot_event_outbox')
    .update({
      status: 'delivered',
      delivered_at: new Date().toISOString(),
    })
    .eq('id', outboxId);
  if (error) {
    logger.error('[botEvents] outbox markDelivered error', error);
  }
}

async function recordPushAttempt(
  outboxId: number,
  errorMessage: string | null
): Promise<void> {
  if (!supabaseAdmin) return;
  const updates: Record<string, unknown> = {
    last_push_at: new Date().toISOString(),
    last_push_error: errorMessage,
  };
  // push_attempts increment : on lit puis incremente. La concurrence n'est
  // pas critique ici (compteur best-effort, pas un verrou).
  const { data } = await supabaseAdmin
    .from('bot_event_outbox')
    .select('push_attempts')
    .eq('id', outboxId)
    .maybeSingle();
  updates.push_attempts = ((data?.push_attempts as number) ?? 0) + 1;
  await supabaseAdmin
    .from('bot_event_outbox')
    .update(updates)
    .eq('id', outboxId);
}

export async function emitBotEvent(
  event: BotEventName,
  data: BotEventPayload
): Promise<EmitResult> {
  const eventId = crypto.randomUUID();
  const fullPayload = {
    id: eventId,
    event,
    timestamp: new Date().toISOString(),
    data,
  };

  // Persist d'abord — meme si le push HTTP rate, l'outbox permettra au bot
  // de rattraper via polling.
  const outboxId = await persistOutbox({
    eventId,
    eventName: event,
    payload: fullPayload,
  });

  if (!isConfigured()) {
    // Dev/staging : pas de webhook configure. L'outbox suffit ; le bot pollera.
    return { delivered: false, error: 'not_configured', attempts: 0 };
  }

  const url = process.env.BOT_WEBHOOK_URL as string;
  const secret = process.env.BOT_WEBHOOK_SECRET as string;

  const body = JSON.stringify(fullPayload);
  const signature = crypto
    .createHmac('sha256', secret)
    .update(body)
    .digest('hex');

  let lastErr: string | undefined;
  let lastStatus: number | undefined;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Signature': signature,
          'X-Webhook-Event': event,
        },
        body,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });

      if (res.ok) {
        if (outboxId !== null) await markDelivered(outboxId);
        return { delivered: true, status: res.status, attempts: attempt };
      }

      lastStatus = res.status;
      lastErr = `HTTP ${res.status}`;

      // 4xx (sauf 408/429) : pas de retry, le bot rejette explicitement.
      // On marque l'echec dans l'outbox mais l'event reste 'pending' — un
      // operateur peut decider de re-pousser manuellement apres correction.
      if (
        res.status >= 400 &&
        res.status < 500 &&
        res.status !== 408 &&
        res.status !== 429
      ) {
        logger.error(`[botEvents] ${event} rejected by bot (${res.status})`);
        if (outboxId !== null) await recordPushAttempt(outboxId, lastErr);
        return {
          delivered: false,
          status: res.status,
          error: lastErr,
          attempts: attempt,
        };
      }
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e);
    }

    if (attempt < MAX_ATTEMPTS) {
      await new Promise((r) => setTimeout(r, 500 * attempt));
    }
  }

  logger.error(
    `[botEvents] ${event} delivery failed after ${MAX_ATTEMPTS} attempts: ${lastErr}`
  );
  if (outboxId !== null) {
    await recordPushAttempt(outboxId, lastErr ?? 'unknown');
  }
  return {
    delivered: false,
    status: lastStatus,
    error: lastErr,
    attempts: MAX_ATTEMPTS,
  };
}
