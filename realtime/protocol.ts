// realtime/protocol.ts
//
// Règles du temps réel sur Cloudflare (Worker « owwomenscup-realtime »,
// realtime/worker.mjs, plan docs/REALTIME-DO.md) : noms des salons, salons
// publics ou privés, tickets d'entrée, notifications signées et messages
// envoyés aux écrans.
//
// Les messages ne portent AUCUNE donnée : « la table X, ligne Y, a changé ».
// L'écran recharge avec ses propres droits ; les règles d'accès restent dans
// l'API et la base.
//
// APIs web standard uniquement (WebCrypto) : ce module tourne dans le Worker
// et sous vitest.

/** `matches:tournament:<id>`, `draft:<id>`, `caster:presence`… */
const ROOM_PATTERN = /^[a-z]+(?::[A-Za-z0-9_-]{1,64}){0,3}$/;
const ROOM_MAX_LENGTH = 160;

export function isValidRoom(name: string): boolean {
  return (
    typeof name === 'string' &&
    name.length <= ROOM_MAX_LENGTH &&
    ROOM_PATTERN.test(name)
  );
}

/**
 * Salons ouverts sans ticket : ce qu'ils diffusent est déjà public (scène
 * d'un overlay OBS, draft regardé par le public) ou sert aux contrôles
 * (`test:`). Tout le reste exige un ticket signé par l'API.
 */
const PUBLIC_ROOM_PREFIXES = ['caster:scene:', 'draft:', 'test:'];

export function isPublicRoom(name: string): boolean {
  return PUBLIC_ROOM_PREFIXES.some((p) => name.startsWith(p));
}

/** La présence (qui est connecté) n'est permise que dans ces salons. */
const PRESENCE_ROOM_PREFIXES = ['caster:presence', 'test:'];

export function allowsPresence(name: string): boolean {
  return PRESENCE_ROOM_PREFIXES.some((p) => name.startsWith(p));
}

export const MAX_NOTIFY_BYTES = 4096;
export const MAX_CLIENT_MESSAGE_BYTES = 2048;
/** Écart toléré entre l'horodatage d'une notification et l'heure du Worker. */
export const NOTIFY_MAX_SKEW_MS = 5 * 60_000;

const encoder = new TextEncoder();

export async function hmacHex(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = new Uint8Array(
    await crypto.subtle.sign('HMAC', key, encoder.encode(data))
  );
  return Array.from(sig, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Comparaison en temps constant de deux chaînes hexadécimales. */
function sameHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * Notification envoyée par la base (déclencheur Postgres + pg_net) :
 * signature HMAC-SHA256 de `${timestamp}.${body}`, en-têtes
 * `x-realtime-timestamp` (millisecondes) et `x-realtime-signature` (hex).
 */
export async function verifyNotify(opts: {
  secret: string;
  body: string;
  timestamp: string | null;
  signature: string | null;
  now: number;
}): Promise<boolean> {
  const { secret, body, timestamp, signature, now } = opts;
  if (!secret || !timestamp || !signature) return false;
  if (!/^\d{1,16}$/.test(timestamp) || !/^[0-9a-f]{64}$/.test(signature)) {
    return false;
  }
  if (Math.abs(now - Number(timestamp)) > NOTIFY_MAX_SKEW_MS) return false;
  return sameHex(await hmacHex(secret, `${timestamp}.${body}`), signature);
}

export type ChangeOp = 'INSERT' | 'UPDATE' | 'DELETE';
export type ChangeEvent = { table: string; op: ChangeOp; id: string | null };

const OPS: readonly string[] = ['INSERT', 'UPDATE', 'DELETE'];
const TABLE_PATTERN = /^[a-z][a-z0-9_]{0,62}$/;
const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

/** Corps d'une notification : `{ room, table, op, id? }`. */
export function parseNotifyBody(
  raw: string
):
  | { ok: true; room: string; event: ChangeEvent }
  | { ok: false; error: string } {
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return { ok: false, error: 'json' };
  }
  if (!v || typeof v !== 'object') return { ok: false, error: 'json' };
  const { room, table, op, id } = v as Record<string, unknown>;
  if (typeof room !== 'string' || !isValidRoom(room)) {
    return { ok: false, error: 'room' };
  }
  if (typeof table !== 'string' || !TABLE_PATTERN.test(table)) {
    return { ok: false, error: 'table' };
  }
  if (typeof op !== 'string' || !OPS.includes(op)) {
    return { ok: false, error: 'op' };
  }
  if (id != null && (typeof id !== 'string' || !ID_PATTERN.test(id))) {
    return { ok: false, error: 'id' };
  }
  return {
    ok: true,
    room,
    event: { table, op: op as ChangeOp, id: (id as string | null) ?? null },
  };
}

/** Message diffusé aux écrans d'un salon. */
export function changeMessage(
  room: string,
  event: ChangeEvent,
  at: number
): string {
  return JSON.stringify({ type: 'change', room, ...event, at });
}

const b64url = (s: string) =>
  btoa(String.fromCharCode(...encoder.encode(s)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

const fromB64url = (s: string) => {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/'));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
};

/**
 * Ticket d'entrée dans un salon privé, émis par l'API : charge utile
 * `{ r: salon, exp: secondes Unix, u?: utilisateur }` en base64url, point,
 * HMAC-SHA256 hex de cette charge utile.
 */
export async function signTicket(opts: {
  secret: string;
  room: string;
  exp: number;
  user?: string;
}): Promise<string> {
  const payload = b64url(
    JSON.stringify({
      r: opts.room,
      exp: opts.exp,
      ...(opts.user ? { u: opts.user } : {}),
    })
  );
  return `${payload}.${await hmacHex(opts.secret, payload)}`;
}

export async function verifyTicket(opts: {
  secret: string;
  ticket: string;
  room: string;
  now: number;
}): Promise<{ ok: true; user: string | null } | { ok: false }> {
  const { secret, ticket, room, now } = opts;
  if (!secret || typeof ticket !== 'string' || ticket.length > 1024) {
    return { ok: false };
  }
  const dot = ticket.lastIndexOf('.');
  if (dot <= 0) return { ok: false };
  const payload = ticket.slice(0, dot);
  const sig = ticket.slice(dot + 1);
  if (!/^[0-9a-f]{64}$/.test(sig)) return { ok: false };
  if (!sameHex(await hmacHex(secret, payload), sig)) return { ok: false };
  let data: { r?: unknown; exp?: unknown; u?: unknown };
  try {
    data = JSON.parse(fromB64url(payload));
  } catch {
    return { ok: false };
  }
  if (data.r !== room) return { ok: false };
  if (typeof data.exp !== 'number' || data.exp * 1000 <= now) {
    return { ok: false };
  }
  const user =
    typeof data.u === 'string' && ID_PATTERN.test(data.u) ? data.u : null;
  return { ok: true, user };
}

/**
 * Message de présence envoyé par un écran : `{ type: 'presence', state }`,
 * `state` = objet plat (10 clés au plus, valeurs courtes). Sinon `null`.
 */
export function parsePresence(
  raw: string
): { state: Record<string, string | number | boolean> } | null {
  if (typeof raw !== 'string' || raw.length > MAX_CLIENT_MESSAGE_BYTES) {
    return null;
  }
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!v || typeof v !== 'object') return null;
  const { type, state } = v as Record<string, unknown>;
  if (type !== 'presence' || !state || typeof state !== 'object') return null;
  const entries = Object.entries(state as Record<string, unknown>);
  if (entries.length > 10) return null;
  const out: Record<string, string | number | boolean> = {};
  for (const [k, val] of entries) {
    if (!/^[A-Za-z0-9_]{1,32}$/.test(k)) return null;
    if (typeof val === 'string') {
      if (val.length > 100) return null;
      out[k] = val;
    } else if (typeof val === 'number' && Number.isFinite(val)) {
      out[k] = val;
    } else if (typeof val === 'boolean') {
      out[k] = val;
    } else {
      return null;
    }
  }
  return { state: out };
}
