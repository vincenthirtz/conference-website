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
 * Salons ouverts sans ticket : ce qu'ils signalent est déjà lisible par
 * tout le monde dans la base (scènes et thèmes caster, que l'overlay OBS lit
 * sans compte ; drafts regardés par le public) ou sert aux contrôles
 * (`test:`). Tout le reste exige un ticket signé par l'API.
 */
const PUBLIC_ROOMS = ['caster:scenes', 'caster:themes'];
const PUBLIC_ROOM_PREFIXES = ['caster:scene:', 'draft:', 'test:'];

export function isPublicRoom(name: string): boolean {
  return (
    PUBLIC_ROOMS.includes(name) ||
    PUBLIC_ROOM_PREFIXES.some((p) => name.startsWith(p))
  );
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
export async function verifyNotify(opts: SignedRequest): Promise<boolean> {
  return verifySigned(opts, '');
}

type SignedRequest = {
  secret: string;
  body: string;
  timestamp: string | null;
  signature: string | null;
  now: number;
};

async function verifySigned(
  opts: SignedRequest,
  prefix: string
): Promise<boolean> {
  const { secret, body, timestamp, signature, now } = opts;
  if (!secret || !timestamp || !signature) return false;
  if (!/^\d{1,16}$/.test(timestamp) || !/^[0-9a-f]{64}$/.test(signature)) {
    return false;
  }
  if (Math.abs(now - Number(timestamp)) > NOTIFY_MAX_SKEW_MS) return false;
  return sameHex(
    await hmacHex(secret, `${prefix}${timestamp}.${body}`),
    signature
  );
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

/* ------------------------------------------------- la Women's Library --- */

/**
 * Salons de la Women's Library : `room` (présence et déplacements, écrits par
 * les joueuses, rien n'y fait foi), `chat`, `tenant` et `user` (écrits par
 * l'API seule). À la différence des autres salons, ils portent des données :
 * positions, messages du chat. Le ticket y est donc toujours exigé, et décidé
 * par les mêmes règles que l'entrée dans la salle.
 *
 * AUCUNE TRACE DE QUI FRÉQUENTE LA GRANDE SALLE DE LECTURE
 * (conference-api tests/unit/libraryReadingRoomPrivacy.test.ts) : le salon ne
 * figure pas dans l'adresse de connexion (il est dans le ticket), le ticket ne
 * porte pas la joueuse, et le Worker ne journalise ni salon ni personne.
 */
const LIBRARY_ROOM_PATTERN =
  /^library:(room|chat|tenant|user):[A-Za-z0-9_-]{1,64}$/;

export function isLibraryRoom(name: string): boolean {
  return typeof name === 'string' && LIBRARY_ROOM_PATTERN.test(name);
}

/** Le seul salon de la Library où les écrans écrivent. */
export function isLibraryPeerRoom(name: string): boolean {
  return isLibraryRoom(name) && name.startsWith('library:room:');
}

/**
 * Durée d'une connexion sans ticket renouvelé. Comme Supabase Realtime, qui
 * relit les droits au plus tard à chaque jeton (une heure) : un bannissement
 * ou une expulsion finit par couper aussi un client qui ignorerait l'événement.
 */
export const LIBRARY_CONNECTION_MAX_MS = 60 * 60_000;
/** Une présence au plus sur ce délai : l'écran en envoie une par seconde. */
export const LIBRARY_TRACK_MIN_MS = 500;
/** Messages relayés au plus par seconde et par écran (un écran honnête : ~8). */
export const LIBRARY_RELAY_MAX_PER_S = 20;

export const MAX_PUBLISH_BYTES = 64 * 1024;
export const MAX_PUBLISH_MESSAGES = 20;

const EVENT_PATTERN = /^[a-z_]{1,32}$/;

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);

/** Le salon annoncé par un ticket, SANS le vérifier (`verifyTicket` le fait). */
export function ticketRoom(ticket: string): string | null {
  if (typeof ticket !== 'string' || ticket.length > 1024) return null;
  const dot = ticket.lastIndexOf('.');
  if (dot <= 0) return null;
  try {
    const { r } = JSON.parse(fromB64url(ticket.slice(0, dot))) as {
      r?: unknown;
    };
    return typeof r === 'string' ? r : null;
  } catch {
    return null;
  }
}

/**
 * Diffusion envoyée par l'API : mêmes en-têtes que `verifyNotify`, HMAC-SHA256
 * de `publish.${timestamp}.${body}` avec le secret des tickets, que l'API a
 * déjà. Le préfixe empêche de rejouer une signature d'un autre usage.
 */
export async function verifyPublish(opts: SignedRequest): Promise<boolean> {
  return verifySigned(opts, 'publish.');
}

export type PublishMessage = {
  room: string;
  event: string;
  payload: Record<string, unknown>;
};

/** Corps d'une diffusion : `{ messages: [{ room, event, payload }] }`. */
export function parsePublishBody(
  raw: string
): { ok: true; messages: PublishMessage[] } | { ok: false; error: string } {
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return { ok: false, error: 'json' };
  }
  const list = isPlainObject(v) ? v.messages : null;
  if (
    !Array.isArray(list) ||
    list.length === 0 ||
    list.length > MAX_PUBLISH_MESSAGES
  ) {
    return { ok: false, error: 'messages' };
  }
  const messages: PublishMessage[] = [];
  for (const m of list) {
    if (!isPlainObject(m)) return { ok: false, error: 'messages' };
    const { room, event, payload } = m;
    if (typeof room !== 'string' || !isLibraryRoom(room)) {
      return { ok: false, error: 'room' };
    }
    if (typeof event !== 'string' || !EVENT_PATTERN.test(event)) {
      return { ok: false, error: 'event' };
    }
    if (!isPlainObject(payload)) return { ok: false, error: 'payload' };
    messages.push({ room, event, payload });
  }
  return { ok: true, messages };
}

/** Un événement diffusé aux écrans d'un salon de la Library. */
export function broadcastMessage(
  event: string,
  payload: Record<string, unknown>
): string {
  return JSON.stringify({ type: 'broadcast', event, payload });
}

export type LibraryClientMessage =
  | { type: 'broadcast'; event: string; payload: Record<string, unknown> }
  | { type: 'track'; key: string; state: Record<string, unknown> }
  | { type: 'untrack' }
  | { type: 'renew'; ticket: string };

/**
 * Message d'un écran dans un salon de la Library ; sinon `null`. Le contenu
 * n'est pas jugé ici : les écrans qui le reçoivent le valident, et ne montrent
 * une présence que si son jeton signé se vérifie.
 */
export function parseLibraryClientMessage(
  raw: unknown
): LibraryClientMessage | null {
  if (typeof raw !== 'string' || raw.length > MAX_CLIENT_MESSAGE_BYTES) {
    return null;
  }
  let v: unknown;
  try {
    v = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isPlainObject(v)) return null;
  switch (v.type) {
    case 'broadcast':
      return typeof v.event === 'string' &&
        EVENT_PATTERN.test(v.event) &&
        isPlainObject(v.payload)
        ? { type: 'broadcast', event: v.event, payload: v.payload }
        : null;
    case 'track':
      return typeof v.key === 'string' &&
        ID_PATTERN.test(v.key) &&
        isPlainObject(v.state)
        ? { type: 'track', key: v.key, state: v.state }
        : null;
    case 'untrack':
      return { type: 'untrack' };
    case 'renew':
      return typeof v.ticket === 'string' && v.ticket.length <= 1024
        ? { type: 'renew', ticket: v.ticket }
        : null;
    default:
      return null;
  }
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
