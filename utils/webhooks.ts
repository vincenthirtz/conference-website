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
 * scrim.planning.*, checkin.nudge, …) qui n'ont aucun
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

/* ------------------------------ anti-SSRF ------------------------------- */
//
// Une URL de webhook est saisie par un staff d'espace, puis appelée par NOS
// serveurs : sans garde, c'est une sonde vers le réseau interne (métadonnées
// cloud 169.254.169.254, localhost, services privés). Deux niveaux :
//   - à l'ÉCRITURE (création, modification) : `checkWebhookUrl` — HTTPS
//     obligatoire, pas d'identifiants dans l'URL, hôte public ;
//   - à l'ENVOI (utils/webhookDelivery.ts) : l'adresse RÉSOLUE est revérifiée
//     par `isBlockedWebhookAddress` (un nom public peut pointer vers 10.0.0.1).

/** Longueur max d'une URL d'abonnement (identique à la contrainte historique). */
export const WEBHOOK_URL_MAX_LENGTH = 2000;

function ipv4Octets(address: string): number[] | null {
  const parts = address.split('.');
  if (parts.length !== 4) return null;
  const octets = parts.map((p) => (/^\d{1,3}$/.test(p) ? Number(p) : NaN));
  return octets.every((o) => Number.isInteger(o) && o >= 0 && o <= 255)
    ? octets
    : null;
}

function isBlockedIpv4(o: number[]): boolean {
  const [a, b, c] = o;
  return (
    a === 0 || // « ce réseau »
    a === 10 ||
    (a === 100 && b >= 64 && b <= 127) || // CGNAT
    a === 127 ||
    (a === 169 && b === 254) || // link-local (métadonnées cloud)
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0 && (c === 0 || c === 2)) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) || // bancs de test
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113) ||
    a >= 224 // multicast + réservé + broadcast
  );
}

/** Groupes hexadécimaux d'une IPv6 (`::` développé), ou null si illisible. */
function ipv6Groups(address: string): number[] | null {
  let addr = address.toLowerCase();
  // Suffixe IPv4 (`::ffff:1.2.3.4`) → deux groupes hex.
  const v4 = addr.match(/^(.*:)(\d{1,3}(?:\.\d{1,3}){3})$/);
  if (v4) {
    const o = ipv4Octets(v4[2]);
    if (!o) return null;
    addr = `${v4[1]}${((o[0] << 8) | o[1]).toString(16)}:${((o[2] << 8) | o[3]).toString(16)}`;
  }
  const halves = addr.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const missing = 8 - head.length - tail.length;
  if (halves.length === 1 ? missing !== 0 : missing < 0) return null;
  const groups = [...head, ...Array(missing).fill('0'), ...tail];
  const nums = groups.map((g) =>
    /^[0-9a-f]{1,4}$/.test(g) ? parseInt(g, 16) : NaN
  );
  return nums.every((n) => Number.isInteger(n)) ? nums : null;
}

/**
 * Adresse IP (v4 ou v6, crochets tolérés) vers laquelle un webhook ne doit
 * JAMAIS partir : boucle locale, réseaux privés, link-local, multicast,
 * plages réservées. Une chaîne qui n'est pas une IP renvoie `false` (c'est un
 * nom d'hôte : voir `checkWebhookUrl`).
 */
export function isBlockedWebhookAddress(address: string): boolean {
  const raw = address.replace(/^\[|\]$/g, '');
  const v4 = ipv4Octets(raw);
  if (v4) return isBlockedIpv4(v4);
  if (!raw.includes(':')) return false;
  const g = ipv6Groups(raw);
  if (!g) return true; // IPv6 illisible : on refuse plutôt que deviner.
  if (g.every((x) => x === 0)) return true; // ::
  if (g.slice(0, 7).every((x) => x === 0) && g[7] === 1) return true; // ::1
  // IPv4 encapsulée (::ffff:a.b.c.d, ::a.b.c.d) : on juge l'IPv4.
  const mapped =
    g.slice(0, 5).every((x) => x === 0) && (g[5] === 0xffff || g[5] === 0);
  if (mapped) {
    return isBlockedIpv4([g[6] >> 8, g[6] & 0xff, g[7] >> 8, g[7] & 0xff]);
  }
  const first = g[0];
  return (
    (first & 0xfe00) === 0xfc00 || // fc00::/7 (ULA)
    (first & 0xffc0) === 0xfe80 || // fe80::/10 (link-local)
    (first & 0xff00) === 0xff00 || // multicast
    (first === 0x2001 && g[1] === 0x0db8) // documentation
  );
}

/** Suffixes de noms qui ne désignent jamais un hôte public. */
const PRIVATE_HOST_SUFFIXES = [
  '.localhost',
  '.local',
  '.internal',
  '.intranet',
  '.lan',
  '.home',
  '.corp',
  '.home.arpa',
];

export type WebhookUrlCheck =
  | { ok: true; url: string }
  | { ok: false; reason: string };

/**
 * Valide l'URL d'un abonnement (création ET modification — mêmes règles) :
 * HTTPS seulement, pas d'identifiants, hôte public (ni IP privée, ni
 * `localhost`, ni nom à un seul label comme `mariadb`). Renvoie l'URL
 * normalisée par le parseur WHATWG (qui ramène `0x7f.1` ou `2130706433` à
 * `127.0.0.1` — la vérification porte donc sur la forme canonique).
 */
export function checkWebhookUrl(raw: unknown): WebhookUrlCheck {
  if (typeof raw !== 'string' || !raw.trim()) {
    return { ok: false, reason: "L'URL est requise." };
  }
  const input = raw.trim();
  if (input.length > WEBHOOK_URL_MAX_LENGTH) {
    return { ok: false, reason: 'URL trop longue.' };
  }
  let parsed: URL;
  try {
    parsed = new URL(input);
  } catch {
    return { ok: false, reason: 'URL invalide.' };
  }
  if (parsed.protocol !== 'https:') {
    return { ok: false, reason: "L'URL doit être en HTTPS." };
  }
  if (parsed.username || parsed.password) {
    return {
      ok: false,
      reason: "L'URL ne doit pas contenir d'identifiants.",
    };
  }
  const host = parsed.hostname.toLowerCase().replace(/\.$/, '');
  if (!host) return { ok: false, reason: 'URL invalide.' };
  const isIpLiteral = host.startsWith('[') || ipv4Octets(host) !== null;
  if (isIpLiteral) {
    if (isBlockedWebhookAddress(host)) {
      return { ok: false, reason: 'Adresse privée ou réservée refusée.' };
    }
  } else if (
    host === 'localhost' ||
    !host.includes('.') ||
    PRIVATE_HOST_SUFFIXES.some((s) => host.endsWith(s))
  ) {
    return { ok: false, reason: 'Hôte non public refusé.' };
  }
  if (parsed.href.length > WEBHOOK_URL_MAX_LENGTH) {
    return { ok: false, reason: 'URL trop longue.' };
  }
  return { ok: true, url: parsed.href };
}

/** Retries max d'une même livraison avant abandon (le cron 1-min = le backoff). */
export const WEBHOOK_MAX_ATTEMPTS = 5;

/** Échecs consécutifs (across events) avant auto-désactivation de l'abonnement. */
export const WEBHOOK_MAX_CONSECUTIVE_FAILURES = 15;
