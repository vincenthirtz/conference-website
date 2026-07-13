// utils/webhooks.ts
//
// Helpers PURS (testables sans DB) du système de webhooks sortants :
//   - liste blanche des events webhookables (sous-ensemble PUBLIC de
//     BotEventName — jamais les events Discord internes),
//   - matching event ↔ abonnement,
//   - signature HMAC du corps + en-têtes,
//   - génération du secret d'abonnement.
//
// Le dispatcher (pages/api/cron/webhook-dispatch.ts) et l'API admin consomment
// ces helpers. Aucune I/O ici.

import crypto from 'crypto';

/**
 * Events exposables à des tiers via webhook. Sous-ensemble PUBLIC de
 * `BotEventName` (utils/botEvents.ts) : on EXCLUT délibérément les events
 * d'opération Discord interne (team.member.*, cast.*, staff.role.changed,
 * scrim.planning.*, checkin.nudge, broadcast.state_changed, …) qui n'ont aucun
 * sens hors de notre stack. Ajouter un event ici = décision produit explicite.
 */
export const WEBHOOK_EVENT_TYPES = [
  'match.scheduled',
  'match.starting',
  'match.finished',
  'match.disputed',
  'match.dispute.resolved',
  'match.forfeit',
  'tournament.finalized',
  'registration.new',
  'news.published',
  'checkin.opened',
] as const;

export type WebhookEventType = (typeof WEBHOOK_EVENT_TYPES)[number];

/**
 * Short, front-neutral descriptions for each PUBLIC webhook event. Consumed by
 * the developer portal catalog endpoint (`/api/public/webhook-events`) so the
 * docs page + dashboard can render "what events you can subscribe to" without
 * duplicating copy. Keys MUST stay in sync with `WEBHOOK_EVENT_TYPES` — the
 * `Record<WebhookEventType, string>` type makes a missing/extra key a compile
 * error. Descriptions are intentionally short and language-neutral (usable in
 * FR + EN docs).
 */
export const WEBHOOK_EVENT_DESCRIPTIONS: Record<WebhookEventType, string> = {
  'match.scheduled': 'A match has been scheduled (date/time set).',
  'match.starting': 'A match is about to start.',
  'match.finished': 'A match has finished and a result has been recorded.',
  'match.disputed': 'A match result has been disputed by a participant.',
  'match.dispute.resolved': 'A disputed match has been resolved by staff.',
  'match.forfeit': 'A match has been won by forfeit (walkover).',
  'tournament.finalized':
    'A tournament is over and its final standings are set.',
  'registration.new': 'A new team registration has been submitted.',
  'news.published': 'A news article has been published.',
  'checkin.opened': 'Check-in has opened for a tournament or match.',
};

const WEBHOOK_EVENT_SET: ReadonlySet<string> = new Set(WEBHOOK_EVENT_TYPES);

/** L'event outbox est-il exposable via webhook ? */
export function isWebhookableEvent(eventName: string): boolean {
  return WEBHOOK_EVENT_SET.has(eventName);
}

/**
 * Valide/normalise une liste d'event_types soumise à l'abonnement.
 * Accepte `['*']` (tous) ou un sous-ensemble strict de WEBHOOK_EVENT_TYPES.
 * Retourne `{ ok, types }` (dédupliqués) ou `{ ok:false, invalid }`.
 */
export function parseWebhookEventTypes(
  input: unknown
): { ok: true; types: string[] } | { ok: false; invalid: string[] } {
  if (!Array.isArray(input)) return { ok: false, invalid: ['(not an array)'] };
  const values = input.filter((v): v is string => typeof v === 'string');
  const deduped = [...new Set(values)];
  if (deduped.length === 1 && deduped[0] === '*')
    return { ok: true, types: ['*'] };
  const invalid = deduped.filter((v) => v !== '*' && !WEBHOOK_EVENT_SET.has(v));
  if (invalid.length > 0) return { ok: false, invalid };
  if (deduped.length === 0) return { ok: false, invalid: ['(empty)'] };
  return { ok: true, types: deduped };
}

/**
 * Un event correspond-il au filtre d'un abonnement ? `'*'` = tous les events
 * webhookables. Sinon match exact sur le nom. On revérifie
 * `isWebhookableEvent` pour que `'*'` ne fuite JAMAIS un event non exposable.
 */
export function eventMatchesSubscription(
  eventName: string,
  eventTypes: readonly string[]
): boolean {
  if (!isWebhookableEvent(eventName)) return false;
  if (eventTypes.includes('*')) return true;
  return eventTypes.includes(eventName);
}

/** Signature HMAC-SHA256 hex du corps brut (même formule que emitBotEvent). */
export function signWebhookBody(secret: string, rawBody: string): string {
  return crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
}

/** En-têtes d'un POST webhook. `signature` = hex HMAC-SHA256 du corps. */
export function buildWebhookHeaders(params: {
  secret: string;
  rawBody: string;
  eventName: string;
  eventId: string;
  tenantId: string;
}): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    'User-Agent': 'conference-website-webhooks/1',
    'X-Webhook-Event': params.eventName,
    'X-Webhook-Id': params.eventId,
    'X-Tenant-Id': params.tenantId,
    'X-Webhook-Signature': `sha256=${signWebhookBody(params.secret, params.rawBody)}`,
  };
}

/** Secret d'abonnement : `whsec_` + 24 octets hex. Révélé une seule fois. */
export function generateWebhookSecret(): string {
  return `whsec_${crypto.randomBytes(24).toString('hex')}`;
}

/** Retries max d'une même livraison avant abandon (le cron 1-min = le backoff). */
export const WEBHOOK_MAX_ATTEMPTS = 5;

/** Échecs consécutifs (across events) avant auto-désactivation de l'abonnement. */
export const WEBHOOK_MAX_CONSECUTIVE_FAILURES = 15;
