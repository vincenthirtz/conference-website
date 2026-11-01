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
//   GET  /library?ticket=…    → WebSocket d'un salon de la Women's Library, nommé
//                               par le ticket (jamais dans le chemin : aucune trace)
//   POST /notify              → diffuse un changement signé par la base à un salon
//   POST /publish             → diffuse les événements signés par l'API à la Library
//
// Worker À PART du site : chaque déploiement d'un Worker redémarre ses
// Durable Objects et coupe leurs connexions ; le site se déploie plusieurs
// fois par jour, ce Worker presque jamais.

import { DurableObject } from 'cloudflare:workers';
import {
  allowsPresence,
  broadcastMessage,
  changeMessage,
  isLibraryPeerRoom,
  isLibraryRoom,
  isPublicRoom,
  isValidRoom,
  LIBRARY_CONNECTION_MAX_MS,
  LIBRARY_RELAY_MAX_PER_S,
  LIBRARY_TRACK_MIN_MS,
  MAX_CLIENT_MESSAGE_BYTES,
  MAX_NOTIFY_BYTES,
  MAX_PUBLISH_BYTES,
  parseLibraryClientMessage,
  parseNotifyBody,
  parsePresence,
  parsePublishBody,
  ticketRoom,
  verifyNotify,
  verifyPublish,
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
  /** Relais récents par écran, en mémoire : perdus à l'hibernation, sans effet. */
  relayWindows = new WeakMap();

  constructor(ctx, env) {
    super(ctx, env);
    this.ctx.setWebSocketAutoResponse(
      new WebSocketRequestResponsePair('ping', 'pong')
    );
  }

  async fetch(request) {
    if (request.headers.get('Upgrade') === 'websocket') {
      const [client, server] = Object.values(new WebSocketPair());
      const room = request.headers.get(ROOM_HEADER) ?? '';
      this.ctx.acceptWebSocket(server);
      if (isLibraryRoom(room)) {
        server.serializeAttachment({
          room,
          conn: crypto.randomUUID(),
          key: null,
          presence: null,
          lastTrackAt: 0,
          validUntil: Date.now() + LIBRARY_CONNECTION_MAX_MS,
        });
        if (isLibraryPeerRoom(room)) {
          server.send(this.libraryPresenceState(null));
        }
      } else {
        server.serializeAttachment({
          room,
          user: request.headers.get(USER_HEADER) || null,
          presence: null,
          lastPresenceAt: 0,
        });
      }
      return new Response(null, { status: 101, webSocket: client });
    }
    if (
      request.method === 'POST' &&
      new URL(request.url).pathname === '/broadcast'
    ) {
      const message = await request.text();
      let delivered = 0;
      for (const ws of this.receivers(null)) {
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
    if (isLibraryRoom(att.room ?? '')) {
      await this.libraryMessage(ws, att, message);
      return;
    }
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

  async libraryMessage(ws, att, raw) {
    const message = parseLibraryClientMessage(raw);
    if (!message) return;
    const now = Date.now();
    if (message.type === 'renew') {
      const verdict = await verifyTicket({
        secret: this.env.REALTIME_TICKET_SECRET ?? '',
        ticket: message.ticket,
        room: att.room,
        now,
      });
      if (verdict.ok) {
        ws.serializeAttachment({
          ...att,
          validUntil: now + LIBRARY_CONNECTION_MAX_MS,
        });
      }
      return;
    }
    // Seul le serveur écrit dans `chat`, `tenant` et `user`.
    if (!isLibraryPeerRoom(att.room)) return;
    if (att.validUntil < now) {
      this.expire(ws);
      this.sendToPeers(this.libraryPresenceState(ws), ws);
      return;
    }
    if (message.type === 'broadcast') {
      if (!this.allowRelay(ws, now)) return;
      this.sendToPeers(broadcastMessage(message.event, message.payload), ws);
      return;
    }
    if (message.type === 'track') {
      if (now - att.lastTrackAt < LIBRARY_TRACK_MIN_MS) return;
      ws.serializeAttachment({
        ...att,
        key: message.key,
        presence: message.state,
        lastTrackAt: now,
      });
      this.sendToPeers(
        JSON.stringify({
          type: 'presence_join',
          conn: att.conn,
          key: message.key,
          state: message.state,
        }),
        ws
      );
      return;
    }
    ws.serializeAttachment({ ...att, key: null, presence: null });
    this.sendToPeers(this.libraryPresenceState(null), ws);
  }

  allowRelay(ws, now) {
    const current = this.relayWindows.get(ws);
    if (!current || now - current.startedAt >= 1000) {
      this.relayWindows.set(ws, { startedAt: now, count: 1 });
      return true;
    }
    current.count++;
    return current.count <= LIBRARY_RELAY_MAX_PER_S;
  }

  expire(ws) {
    try {
      ws.close(4401, 'renew');
    } catch {
      // déjà fermée
    }
  }

  /**
   * Les écrans à servir, sauf `except`. Une connexion de la Library dont le
   * ticket n'a pas été renouvelé est coupée ici : un salon sans trafic n'a rien
   * à apprendre à personne, il n'a pas besoin de se réveiller pour ça.
   */
  receivers(except) {
    const now = Date.now();
    const out = [];
    let expiredWithPresence = false;
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === except || ws.readyState !== WebSocket.OPEN) continue;
      const att = ws.deserializeAttachment();
      if (att?.validUntil && att.validUntil < now) {
        if (att.presence) expiredWithPresence = true;
        this.expire(ws);
        continue;
      }
      out.push(ws);
    }
    if (expiredWithPresence) {
      const state = this.libraryPresenceState(null);
      for (const ws of out) this.trySend(ws, state);
    }
    return out;
  }

  sendToPeers(message, except) {
    for (const ws of this.receivers(except)) this.trySend(ws, message);
  }

  trySend(ws, message) {
    try {
      ws.send(message);
    } catch {
      // connexion en train de se fermer : ignorée
    }
  }

  libraryPresenceState(leaving) {
    const entries = [];
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === leaving || ws.readyState !== WebSocket.OPEN) continue;
      const att = ws.deserializeAttachment();
      if (att?.presence && att.key) {
        entries.push({ conn: att.conn, key: att.key, state: att.presence });
      }
    }
    return JSON.stringify({ type: 'presence_state', entries });
  }

  /** Un écran est parti : ce qui reste du salon, selon le salon. */
  left(ws) {
    const rest = this.ctx.getWebSockets().filter((w) => w !== ws);
    const room = rest[0]?.deserializeAttachment()?.room ?? '';
    if (isLibraryPeerRoom(room)) {
      this.sendToPeers(this.libraryPresenceState(ws), ws);
    } else if (!isLibraryRoom(room)) {
      this.broadcastPresence(ws);
    }
  }

  async webSocketClose(ws, code, reason) {
    try {
      ws.close(code, reason);
    } catch {
      // déjà fermée
    }
    this.left(ws);
  }

  async webSocketError(ws) {
    this.left(ws);
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

async function publish(request, env) {
  if (request.method !== 'POST') return text('Method not allowed', 405);
  if (!env.REALTIME_TICKET_SECRET) return text('Not configured', 503);
  const body = await request.text();
  if (body.length > MAX_PUBLISH_BYTES) return text('Too large', 413);
  const ok = await verifyPublish({
    secret: env.REALTIME_TICKET_SECRET,
    body,
    timestamp: request.headers.get('x-realtime-timestamp'),
    signature: request.headers.get('x-realtime-signature'),
    now: Date.now(),
  });
  if (!ok) return text('Unauthorized', 401);
  const parsed = parsePublishBody(body);
  if (!parsed.ok) return text(`Bad request: ${parsed.error}`, 400);
  const counts = await Promise.all(
    parsed.messages.map(async (m) => {
      const res = await roomStub(env, m.room).fetch('https://room/broadcast', {
        method: 'POST',
        body: broadcastMessage(m.event, m.payload),
      });
      const { delivered } = await res.json();
      return delivered;
    })
  );
  const delivered = counts.reduce((sum, n) => sum + n, 0);
  // Ni salon ni personne dans ce journal : seulement l'événement et le volume.
  console.log(
    `[publish] ${parsed.messages.map((m) => m.event).join(',')} · ${delivered} écran(s)`
  );
  return Response.json({ delivered });
}

async function join(request, env, rawRoom) {
  let room;
  try {
    room = decodeURIComponent(rawRoom);
  } catch {
    return text('Bad room', 400);
  }
  if (!isValidRoom(room)) return text('Bad room', 400);
  // Un salon de la Library ne se nomme jamais dans une adresse : voir /library.
  if (isLibraryRoom(room)) return text('Not found', 404);
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
  // Les journaux de requêtes du Worker sont coupés (realtime/wrangler.jsonc) :
  // cette ligne garde le rythme de connexion des écrans hors Library.
  console.log(`[join] ${room}`);
  // En-têtes internes posés ICI seulement : jamais repris du client.
  const headers = new Headers(request.headers);
  headers.set(ROOM_HEADER, room);
  if (user) headers.set(USER_HEADER, user);
  else headers.delete(USER_HEADER);
  return roomStub(env, room).fetch(new Request(request.url, { headers }));
}

async function joinLibrary(request, env) {
  if (!env.REALTIME_TICKET_SECRET) return text('Not configured', 503);
  const ticket = new URL(request.url).searchParams.get('ticket') ?? '';
  const room = ticketRoom(ticket);
  if (!room || !isLibraryRoom(room)) return text('Unauthorized', 401);
  const verdict = await verifyTicket({
    secret: env.REALTIME_TICKET_SECRET,
    ticket,
    room,
    now: Date.now(),
  });
  if (!verdict.ok) return text('Unauthorized', 401);
  if (request.headers.get('Upgrade') !== 'websocket') {
    return text('Expected WebSocket', 426);
  }
  const headers = new Headers(request.headers);
  headers.set(ROOM_HEADER, room);
  headers.delete(USER_HEADER);
  // L'adresse interne ne reprend pas le ticket.
  return roomStub(env, room).fetch(
    new Request('https://room/library', { headers })
  );
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (pathname === '/health') return text('ok', 200);
    if (pathname === '/notify') return notify(request, env);
    if (pathname === '/publish') return publish(request, env);
    if (pathname === '/library') return joinLibrary(request, env);
    const m = pathname.match(/^\/rooms\/([^/]+)$/);
    if (m) return join(request, env, m[1]);
    return text('Not found', 404);
  },
};
