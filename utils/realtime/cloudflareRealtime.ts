// utils/realtime/cloudflareRealtime.ts
//
// Connexion des écrans aux salons du Worker temps réel « owwomenscup-realtime »
// (realtime/worker.mjs, docs/REALTIME-DO.md, étape 3). Règles pures :
// utils/realtime/rooms.ts.
//
// - Une seule WebSocket par salon, partagée par toutes les écoutes de la page
//   (le draft écoute deux tables dans le même salon).
// - Salon privé : ticket demandé à l'API à CHAQUE connexion (il vit quelques
//   minutes) ; refus 4xx = abandon, pas de boucle.
// - Reconnexion seule, avec un délai croissant ; `ping` toutes les 30 s (le
//   salon répond `pong` sans se réveiller).
// - Présence : dernier état gardé et renvoyé à chaque (re)connexion ; une mise
//   à jour par seconde au plus, la dernière gagne (le salon ignore les plus
//   rapprochées).

import { supabaseClient } from '@/utils/supabaseBrowser';
import {
  parseRoomMessage,
  pickRealtimeBackend,
  type RealtimeBackend,
  type RoomMessage,
  ticketPathFor,
} from './rooms';

/** Interrupteur lu une fois au chargement de la page (cf. pickRealtimeBackend). */
export const REALTIME_BACKEND: RealtimeBackend = pickRealtimeBackend(
  process.env.NEXT_PUBLIC_REALTIME_BACKEND,
  typeof window !== 'undefined' ? window.location.search : undefined
);

const REALTIME_URL =
  process.env.NEXT_PUBLIC_REALTIME_URL || 'https://realtime.owwomenscup.fr';

const PING_MS = 30_000;
const PRESENCE_MIN_MS = 1100;
const RETRY_MS = [1000, 2000, 5000, 10_000, 30_000];

export type RoomListener = {
  onMessage: (message: RoomMessage) => void;
  /** 'SUBSCRIBED' | 'CHANNEL_ERROR' | 'CLOSED', comme Supabase. */
  onStatus?: (status: string) => void;
};

type Connection = {
  room: string;
  listeners: Set<RoomListener>;
  ws: WebSocket | null;
  attempt: number;
  closed: boolean;
  retryTimer: ReturnType<typeof setTimeout> | null;
  pingTimer: ReturnType<typeof setInterval> | null;
  presence: Record<string, string | number | boolean> | null;
  presenceSentAt: number;
  presenceTimer: ReturnType<typeof setTimeout> | null;
};

const connections = new Map<string, Connection>();

function emitStatus(conn: Connection, status: string) {
  for (const l of conn.listeners) l.onStatus?.(status);
}

type TicketResult = { ticket: string } | { retry: boolean };

async function fetchTicket(path: string, room: string): Promise<TicketResult> {
  try {
    const {
      data: { session },
    } = await supabaseClient.auth.getSession();
    const headers = new Headers({ accept: 'application/json' });
    if (session?.access_token) {
      headers.set('Authorization', `Bearer ${session.access_token}`);
    }
    const res = await fetch(`${path}?room=${encodeURIComponent(room)}`, {
      headers,
      credentials: 'same-origin',
      cache: 'no-store',
    });
    if (!res.ok) return { retry: res.status >= 500 || res.status === 429 };
    const body = (await res.json()) as { ticket?: unknown };
    return typeof body.ticket === 'string'
      ? { ticket: body.ticket }
      : { retry: false };
  } catch {
    return { retry: true };
  }
}

function scheduleRetry(conn: Connection) {
  if (conn.closed || conn.retryTimer) return;
  const base = RETRY_MS[Math.min(conn.attempt, RETRY_MS.length - 1)];
  conn.attempt++;
  conn.retryTimer = setTimeout(
    () => {
      conn.retryTimer = null;
      void connect(conn);
    },
    base + Math.floor(Math.random() * 500)
  );
}

function sendPresence(conn: Connection) {
  const ws = conn.ws;
  if (!conn.presence || !ws || ws.readyState !== WebSocket.OPEN) return;
  if (conn.presenceTimer) return;
  const wait = conn.presenceSentAt + PRESENCE_MIN_MS - Date.now();
  if (wait > 0) {
    conn.presenceTimer = setTimeout(() => {
      conn.presenceTimer = null;
      sendPresence(conn);
    }, wait);
    return;
  }
  conn.presenceSentAt = Date.now();
  ws.send(JSON.stringify({ type: 'presence', state: conn.presence }));
}

async function connect(conn: Connection) {
  if (conn.closed) return;
  let url = `${REALTIME_URL.replace(/^http/, 'ws')}/rooms/${encodeURIComponent(conn.room)}`;
  const path = ticketPathFor(conn.room);
  if (path) {
    const result = await fetchTicket(path, conn.room);
    if (conn.closed) return;
    if (!('ticket' in result)) {
      emitStatus(conn, 'CHANNEL_ERROR');
      if (result.retry) scheduleRetry(conn);
      return;
    }
    url += `?ticket=${encodeURIComponent(result.ticket)}`;
  }

  const ws = new WebSocket(url);
  conn.ws = ws;
  ws.addEventListener('open', () => {
    if (conn.ws !== ws) return;
    conn.attempt = 0;
    conn.presenceSentAt = 0;
    conn.pingTimer = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) ws.send('ping');
    }, PING_MS);
    emitStatus(conn, 'SUBSCRIBED');
    sendPresence(conn);
  });
  ws.addEventListener('message', (e) => {
    const message = parseRoomMessage(e.data);
    if (!message) return;
    for (const l of conn.listeners) l.onMessage(message);
  });
  ws.addEventListener('close', () => {
    if (conn.ws !== ws) return;
    conn.ws = null;
    if (conn.pingTimer) clearInterval(conn.pingTimer);
    conn.pingTimer = null;
    if (conn.closed) return;
    emitStatus(conn, 'CLOSED');
    scheduleRetry(conn);
  });
  ws.addEventListener('error', () => {
    if (conn.ws === ws) emitStatus(conn, 'CHANNEL_ERROR');
  });
}

/** Rejoint un salon ; renvoie la fonction qui le quitte. */
export function joinRoom(room: string, listener: RoomListener): () => void {
  let conn = connections.get(room);
  if (!conn) {
    conn = {
      room,
      listeners: new Set(),
      ws: null,
      attempt: 0,
      closed: false,
      retryTimer: null,
      pingTimer: null,
      presence: null,
      presenceSentAt: 0,
      presenceTimer: null,
    };
    connections.set(room, conn);
    conn.listeners.add(listener);
    void connect(conn);
  } else {
    conn.listeners.add(listener);
    if (conn.ws?.readyState === WebSocket.OPEN)
      listener.onStatus?.('SUBSCRIBED');
  }

  const joined = conn;
  return () => {
    if (!joined.listeners.delete(listener)) return;
    listener.onStatus?.('CLOSED');
    if (joined.listeners.size > 0) return;
    joined.closed = true;
    connections.delete(room);
    if (joined.retryTimer) clearTimeout(joined.retryTimer);
    if (joined.pingTimer) clearInterval(joined.pingTimer);
    if (joined.presenceTimer) clearTimeout(joined.presenceTimer);
    const ws = joined.ws;
    joined.ws = null;
    if (ws && ws.readyState <= WebSocket.OPEN) ws.close(1000);
  };
}

/** Publie (ou met à jour) la présence de l'écran dans un salon rejoint. */
export function setRoomPresence(
  room: string,
  state: Record<string, string | number | boolean>
) {
  const conn = connections.get(room);
  if (!conn) return;
  conn.presence = state;
  sendPresence(conn);
}
