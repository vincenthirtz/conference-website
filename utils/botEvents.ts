// utils/botEvents.ts
//
// Push sortant signe HMAC vers le bot Discord (repo separe).
//
// Le bot poll deja /api/bot/reminders, mais le polling est trop lent pour les
// evenements latence-sensibles (annonce de match qui commence, dispute ouverte,
// news qui sort). Cet emetteur permet au site de pousser ces evenements en
// quelques ms.
//
// Auth : HMAC-SHA256 du body (raw JSON string) avec BOT_WEBHOOK_SECRET. Le bot
// recalcule la signature cote receveur et compare en constant-time.
//
// Livraison : 3 tentatives, backoff lineaire 500/1000/1500 ms. Echec apres
// 3 tentatives -> log d'erreur uniquement (pas de persistance/replay en v1 ;
// pose les bases, ajouter une outbox si besoin de garanties at-least-once).

import crypto from 'crypto';
import { logger } from './logger';

export type BotEventName =
  | 'match.starting'
  | 'match.disputed'
  | 'match.finished'
  | 'news.published';

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

export async function emitBotEvent(
  event: BotEventName,
  data: BotEventPayload
): Promise<EmitResult> {
  if (!isConfigured()) {
    // Not an error : in dev / staging, the bot endpoint can simply be unset.
    return { delivered: false, error: 'not_configured', attempts: 0 };
  }

  const url = process.env.BOT_WEBHOOK_URL as string;
  const secret = process.env.BOT_WEBHOOK_SECRET as string;

  const body = JSON.stringify({
    id: crypto.randomUUID(),
    event,
    timestamp: new Date().toISOString(),
    data,
  });

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
        return { delivered: true, status: res.status, attempts: attempt };
      }

      lastStatus = res.status;
      lastErr = `HTTP ${res.status}`;

      // 4xx (sauf 408/429) : pas de retry, le bot rejette explicitement.
      if (res.status >= 400 && res.status < 500 && res.status !== 408 && res.status !== 429) {
        logger.error(`[botEvents] ${event} rejected by bot (${res.status})`);
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
  return {
    delivered: false,
    status: lastStatus,
    error: lastErr,
    attempts: MAX_ATTEMPTS,
  };
}
