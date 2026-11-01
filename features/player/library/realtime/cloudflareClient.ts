// features/player/library/realtime/cloudflareClient.ts — les canaux de la
// Women's Library sur les salons du Worker temps réel (realtime/worker.mjs,
// docs/AUTH-BETTER-AUTH.md, lot 3), à la place de Supabase Realtime. Implémente
// `LibraryRealtimeClient` (./connection.ts) : rien d'autre ne change.
//
// - Une WebSocket par canal, ouverte sur `/library?ticket=…` : le salon est dans
//   le ticket, jamais dans l'adresse (aucune trace de qui fréquente la Grande
//   salle de lecture, realtime/protocol.ts).
// - Les quatre tickets arrivent ensemble d'une seule route, qui applique les
//   mêmes refus que l'entrée dans la salle. Refus 4xx = abandon, pas de boucle.
// - Reconnexion seule, avec un délai croissant : `SUBSCRIBED` à chaque retour,
//   et ./connection.ts renvoie alors ma présence.
// - `ping` toutes les 30 s (le salon répond sans se réveiller) ; ticket
//   renouvelé toutes les 45 min, sinon le salon coupe la connexion à l'heure.

import { PlayerHttpError } from '@/utils/player/playerHttp';
import { pickRealtimeBackend } from '@/utils/realtime/rooms';
import type { LibraryRealtimeTicketsResponse } from '../socialResponses';
import type {
  LibraryChannel,
  LibraryChannelMessage,
  LibraryChannelOptions,
  LibraryRealtimeClient,
} from './connection';

/**
 * Transport de la Library : `?realtime=cloudflare|supabase` dans l'adresse de
 * la page (essai à deux navigateurs), sinon celui-ci. Lu une fois au chargement.
 */
export const LIBRARY_REALTIME_BACKEND = pickRealtimeBackend(
  'cloudflare',
  typeof window !== 'undefined' ? window.location.search : undefined
);

const REALTIME_URL =
  process.env.NEXT_PUBLIC_REALTIME_URL || 'https://realtime.owwomenscup.fr';

const PING_MS = 30_000;
const RENEW_MS = 45 * 60_000;
const RETRY_MS = [1000, 2000, 5000, 10_000, 30_000];
/** Marge sous laquelle un ticket encore valide n'ouvre plus de connexion. */
const TICKET_MARGIN_MS = 30_000;

type Family = keyof LibraryRealtimeTicketsResponse['tickets'];

function familyOf(topic: string): Family | null {
  const family = topic.split(':')[1];
  return family === 'room' ||
    family === 'chat' ||
    family === 'tenant' ||
    family === 'user'
    ? family
    : null;
}

/** Un refus définitif (droits, salle) : inutile de réessayer. */
function isRefusal(err: unknown): boolean {
  return (
    err instanceof PlayerHttpError && err.status < 500 && err.status !== 429
  );
}

type Handler = {
  type: 'presence' | 'broadcast';
  event: string;
  callback: (message: LibraryChannelMessage) => void;
};

type Entry = { key: string; state: Record<string, unknown> };

class CloudflareChannel implements LibraryChannel {
  private readonly handlers: Handler[] = [];
  private readonly entries = new Map<string, Entry>();
  private status: ((status: string, err?: Error) => void) | undefined;
  private ws: WebSocket | null = null;
  private attempt = 0;
  private stopped = false;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;

  constructor(
    private readonly topic: string,
    private readonly presenceKey: string | null,
    private readonly tickets: (
      fresh?: boolean
    ) => Promise<LibraryRealtimeTicketsResponse>,
    private readonly url: string
  ) {}

  on(
    type: 'presence' | 'broadcast',
    filter: { event: string },
    callback: (message: LibraryChannelMessage) => void
  ): LibraryChannel {
    this.handlers.push({ type, event: filter.event, callback });
    return this;
  }

  subscribe(callback?: (status: string, err?: Error) => void): unknown {
    this.status = callback;
    void this.connect();
    return this;
  }

  presenceState(): Record<string, Array<Record<string, unknown>>> {
    const out: Record<string, Array<Record<string, unknown>>> = {};
    for (const { key, state } of this.entries.values()) {
      (out[key] ??= []).push(state);
    }
    return out;
  }

  track(payload: Record<string, unknown>): Promise<unknown> {
    if (!this.presenceKey) return Promise.resolve('error');
    return this.write({ type: 'track', key: this.presenceKey, state: payload });
  }

  untrack(): Promise<unknown> {
    return this.write({ type: 'untrack' });
  }

  send(message: {
    type: 'broadcast';
    event: string;
    payload: Record<string, unknown>;
  }): Promise<unknown> {
    return this.write({
      type: 'broadcast',
      event: message.event,
      payload: message.payload,
    });
  }

  /** Renouvelle le droit de rester connectée (voir l'en-tête). */
  renew(response: LibraryRealtimeTicketsResponse) {
    const family = familyOf(this.topic);
    if (family) {
      void this.write({ type: 'renew', ticket: response.tickets[family] });
    }
  }

  stop() {
    this.stopped = true;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.retryTimer = null;
    this.pingTimer = null;
    const ws = this.ws;
    this.ws = null;
    if (ws && ws.readyState <= WebSocket.OPEN) ws.close(1000);
  }

  private write(message: Record<string, unknown>): Promise<unknown> {
    const ws = this.ws;
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      return Promise.resolve('error');
    }
    ws.send(JSON.stringify(message));
    return Promise.resolve('ok');
  }

  private deliver(type: Handler['type'], event: string, payload: unknown) {
    for (const h of this.handlers) {
      if (h.type === type && h.event === event) h.callback({ payload });
    }
  }

  private scheduleRetry() {
    if (this.stopped || this.retryTimer) return;
    const base = RETRY_MS[Math.min(this.attempt, RETRY_MS.length - 1)];
    this.attempt++;
    this.retryTimer = setTimeout(
      () => {
        this.retryTimer = null;
        void this.connect();
      },
      base + Math.floor(Math.random() * 500)
    );
  }

  private async connect() {
    if (this.stopped) return;
    const family = familyOf(this.topic);
    if (!family) {
      this.status?.('CHANNEL_ERROR');
      return;
    }
    let ticket: string;
    try {
      ticket = (await this.tickets()).tickets[family];
    } catch (err) {
      if (this.stopped) return;
      this.status?.('CHANNEL_ERROR');
      if (!isRefusal(err)) this.scheduleRetry();
      return;
    }
    if (this.stopped) return;

    const base = this.url.replace(/^http/, 'ws').replace(/\/+$/, '');
    const ws = new WebSocket(
      `${base}/library?ticket=${encodeURIComponent(ticket)}`
    );
    this.ws = ws;
    ws.addEventListener('open', () => {
      if (this.ws !== ws) return;
      this.attempt = 0;
      this.pingTimer = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send('ping');
      }, PING_MS);
      this.status?.('SUBSCRIBED');
    });
    ws.addEventListener('message', (e) => {
      if (this.ws === ws) this.receive(e.data);
    });
    ws.addEventListener('close', () => {
      if (this.ws !== ws) return;
      this.ws = null;
      if (this.pingTimer) clearInterval(this.pingTimer);
      this.pingTimer = null;
      if (this.stopped) return;
      this.status?.('CLOSED');
      if (this.entries.size > 0) {
        this.entries.clear();
        this.deliver('presence', 'sync', undefined);
      }
      this.scheduleRetry();
    });
    ws.addEventListener('error', () => {
      if (this.ws === ws) this.status?.('CHANNEL_ERROR');
    });
  }

  private receive(raw: unknown) {
    if (typeof raw !== 'string' || raw === 'pong') return;
    let m: Record<string, unknown>;
    try {
      m = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return;
    }
    if (!m || typeof m !== 'object') return;
    if (m.type === 'broadcast' && typeof m.event === 'string') {
      this.deliver('broadcast', m.event, m.payload);
      return;
    }
    if (m.type === 'presence_state' && Array.isArray(m.entries)) {
      this.entries.clear();
      for (const e of m.entries as Array<Record<string, unknown>>) {
        this.remember(e);
      }
      this.deliver('presence', 'sync', undefined);
      return;
    }
    if (m.type === 'presence_join') {
      this.remember(m);
      this.deliver('presence', 'sync', undefined);
    }
  }

  private remember(entry: Record<string, unknown>) {
    const { conn, key, state } = entry ?? {};
    if (typeof conn !== 'string' || typeof key !== 'string') return;
    if (!state || typeof state !== 'object') return;
    this.entries.set(conn, { key, state: state as Record<string, unknown> });
  }
}

export function createCloudflareLibraryRealtime(options: {
  fetchTickets: () => Promise<LibraryRealtimeTicketsResponse>;
  url?: string;
  now?: () => number;
}): LibraryRealtimeClient {
  const url = options.url ?? REALTIME_URL;
  const now = options.now ?? (() => Date.now());
  const channels = new Set<CloudflareChannel>();
  let cached: LibraryRealtimeTicketsResponse | null = null;
  let inflight: Promise<LibraryRealtimeTicketsResponse> | null = null;
  let renewTimer: ReturnType<typeof setInterval> | null = null;

  /** Une seule demande pour les quatre canaux, tant que les tickets sont bons. */
  const tickets = (fresh = false) => {
    if (
      !fresh &&
      cached &&
      cached.expiresAt * 1000 - now() > TICKET_MARGIN_MS
    ) {
      return Promise.resolve(cached);
    }
    inflight ??= options
      .fetchTickets()
      .then((response) => {
        cached = response;
        return response;
      })
      .finally(() => {
        inflight = null;
      });
    return inflight;
  };

  return {
    channel(topic: string, channelOptions: LibraryChannelOptions) {
      const channel = new CloudflareChannel(
        topic,
        channelOptions.config.presence?.key ?? null,
        tickets,
        url
      );
      channels.add(channel);
      renewTimer ??= setInterval(() => {
        // Un refus ne coupe rien ici : le salon le fera à l'heure, et la
        // reconnexion sera refusée à son tour.
        tickets(true)
          .then((response) => {
            for (const c of channels) c.renew(response);
          })
          .catch(() => undefined);
      }, RENEW_MS);
      return channel;
    },
    removeChannel(channel: LibraryChannel) {
      const c = channel as CloudflareChannel;
      c.stop();
      channels.delete(c);
      if (channels.size === 0 && renewTimer) {
        clearInterval(renewTimer);
        renewTimer = null;
      }
      return 'ok';
    },
  };
}
