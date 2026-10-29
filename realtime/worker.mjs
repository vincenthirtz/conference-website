// realtime/worker.mjs — Worker « owwomenscup-realtime » (realtime/wrangler.jsonc).
// Plan : docs/REALTIME-DO.md. Règles pures et testées : realtime/protocol.ts.
//
// Un Durable Object `Room` par salon (`matches:tournament:<id>`, `draft:<id>`…),
// en API d'hibernation : un salon où rien ne se passe ne consomme rien, et le
// `ping` des écrans reçoit son `pong` sans réveiller l'objet.
//
// Routes :
//   GET  /health              → 200
//   GET  /rooms/<salon>       → WebSocket (salon privé : ?ticket=<ticket signé par l'API>)
//   POST /notify              → diffuse un changement signé par la base à un salon
//
// Worker À PART du site : chaque déploiement d'un Worker redémarre ses
// Durable Objects et coupe leurs connexions ; le site se déploie plusieurs
// fois par jour, ce Worker presque jamais.

import { DurableObject } from 'cloudflare:workers';
import {
  allowsPresence,
  changeMessage,
  isPublicRoom,
  isValidRoom,
  MAX_CLIENT_MESSAGE_BYTES,
  MAX_NOTIFY_BYTES,
  parseNotifyBody,
  parsePresence,
  verifyNotify,
  verifyTicket,
} from './protocol.ts';

const ROOM_HEADER = 'x-realtime-room';
const USER_HEADER = 'x-realtime-user';

const text = (body, status) =>
  new Response(body, {
    status,
    headers: { 'content-type': 'text/plain; charset=utf-8' },
  });

export class Room extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.ctx.setWebSocketAutoResponse(
      new WebSocketRequestResponsePair('ping', 'pong')
    );
  }

  async fetch(request) {
    if (request.headers.get('Upgrade') === 'websocket') {
      const [client, server] = Object.values(new WebSocketPair());
      this.ctx.acceptWebSocket(server);
      server.serializeAttachment({
        room: request.headers.get(ROOM_HEADER) ?? '',
        user: request.headers.get(USER_HEADER) || null,
        presence: null,
        lastPresenceAt: 0,
      });
      return new Response(null, { status: 101, webSocket: client });
    }
    if (
      request.method === 'POST' &&
      new URL(request.url).pathname === '/broadcast'
    ) {
      const message = await request.text();
      let delivered = 0;
      for (const ws of this.ctx.getWebSockets()) {
        try {
          ws.send(message);
          delivered++;
        } catch {
          // connexion en train de se fermer : ignorée
        }
      }
      return Response.json({ delivered });
    }
    return text('Not found', 404);
  }

  async webSocketMessage(ws, message) {
    if (
      typeof message !== 'string' ||
      message.length > MAX_CLIENT_MESSAGE_BYTES
    )
      return;
    const att = ws.deserializeAttachment() ?? {};
    if (!allowsPresence(att.room ?? '')) return;
    // Présence anonyme seulement dans les salons de contrôle (`test:`).
    if (!att.user && !String(att.room).startsWith('test:')) return;
    const presence = parsePresence(message);
    if (!presence) return;
    const now = Date.now();
    if (now - (att.lastPresenceAt ?? 0) < 1000) return;
    ws.serializeAttachment({
      ...att,
      presence: presence.state,
      lastPresenceAt: now,
    });
    this.broadcastPresence(null);
  }

  async webSocketClose(ws, code, reason) {
    try {
      ws.close(code, reason);
    } catch {
      // déjà fermée
    }
    this.broadcastPresence(ws);
  }

  async webSocketError(ws) {
    this.broadcastPresence(ws);
  }

  broadcastPresence(leaving) {
    const sockets = this.ctx.getWebSockets().filter((ws) => ws !== leaving);
    const users = [];
    for (const ws of sockets) {
      const att = ws.deserializeAttachment();
      if (att?.presence) users.push({ user: att.user, state: att.presence });
    }
    if (!users.length && !leaving) return;
    const message = JSON.stringify({ type: 'presence', users });
    for (const ws of sockets) {
      try {
        ws.send(message);
      } catch {
        // connexion en train de se fermer : ignorée
      }
    }
  }
}

const roomStub = (env, room) => env.ROOMS.get(env.ROOMS.idFromName(room));

async function notify(request, env) {
  if (request.method !== 'POST') return text('Method not allowed', 405);
  if (!env.REALTIME_NOTIFY_SECRET) return text('Not configured', 503);
  const body = await request.text();
  if (body.length > MAX_NOTIFY_BYTES) return text('Too large', 413);
  const ok = await verifyNotify({
    secret: env.REALTIME_NOTIFY_SECRET,
    body,
    timestamp: request.headers.get('x-realtime-timestamp'),
    signature: request.headers.get('x-realtime-signature'),
    now: Date.now(),
  });
  if (!ok) return text('Unauthorized', 401);
  const parsed = parseNotifyBody(body);
  if (!parsed.ok) return text(`Bad request: ${parsed.error}`, 400);
  const res = await roomStub(env, parsed.room).fetch('https://room/broadcast', {
    method: 'POST',
    body: changeMessage(parsed.room, parsed.event, Date.now()),
  });
  // Journal de comparaison (étape 2, docs/REALTIME-DO.md) : délai depuis la
  // base et écrans touchés. Aucune donnée de ligne.
  const { delivered } = await res.clone().json();
  const lag = Date.now() - Number(request.headers.get('x-realtime-timestamp'));
  console.log(
    `[notify] ${parsed.event.table} ${parsed.event.op} ${parsed.room} · ${lag} ms · ${delivered} écran(s)`
  );
  return res;
}

async function join(request, env, rawRoom) {
  let room;
  try {
    room = decodeURIComponent(rawRoom);
  } catch {
    return text('Bad room', 400);
  }
  if (!isValidRoom(room)) return text('Bad room', 400);
  let user = null;
  if (!isPublicRoom(room)) {
    if (!env.REALTIME_TICKET_SECRET) return text('Not configured', 503);
    const verdict = await verifyTicket({
      secret: env.REALTIME_TICKET_SECRET,
      ticket: new URL(request.url).searchParams.get('ticket') ?? '',
      room,
      now: Date.now(),
    });
    if (!verdict.ok) return text('Unauthorized', 401);
    user = verdict.user;
  }
  if (request.headers.get('Upgrade') !== 'websocket') {
    return text('Expected WebSocket', 426);
  }
  // En-têtes internes posés ICI seulement : jamais repris du client.
  const headers = new Headers(request.headers);
  headers.set(ROOM_HEADER, room);
  if (user) headers.set(USER_HEADER, user);
  else headers.delete(USER_HEADER);
  return roomStub(env, room).fetch(new Request(request.url, { headers }));
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname === '/health') return text('ok', 200);
    if (pathname === '/notify') return notify(request, env);
    const m = pathname.match(/^\/rooms\/([^/]+)$/);
    if (m) return join(request, env, m[1]);
    return text('Not found', 404);
  },
};
