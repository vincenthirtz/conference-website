// features/player/library/dev/fakeRealtime.ts — un Realtime EN MÉMOIRE pour la
// page de développement `/dev/library-room` et les tests du lot 5 : il
// implémente `LibraryRealtimeClient` (`../realtime/connection.ts`) sans
// réseau, avec la sémantique de Supabase qui compte ici :
//   - la présence est rangée par sujet puis par clé ; tout changement émet un
//     `sync` sur chaque canal abonné au sujet ;
//   - un broadcast n'est pas renvoyé à son émetteur (`broadcast.self` faux) ;
//   - `removeChannel` retire la présence de ce canal.
// Les commandes `peer*` et `server` simulent les autres joueuses et l'API
// (expulsion, bannissement, blocage) : aucune policy n'est simulée, la page
// de démonstration n'éprouve que le client.

import { LIBRARY_CHAT_CLOSED } from '../chat/responses';
import type {
  LibraryEnterResponse,
  LibraryPresenceGrant,
  LibraryRoomKind,
} from '../socialResponses';
import {
  DEFAULT_APARTMENT_DECOR,
  LIBRARY_APARTMENT_SIZE,
} from '../../../../config/library/decor';
import type {
  LibraryChannel,
  LibraryChannelMessage,
  LibraryChannelOptions,
  LibraryRealtimeClient,
} from '../realtime/connection';

type Handler = {
  type: 'presence' | 'broadcast';
  event: string;
  callback: (message: LibraryChannelMessage) => void;
};

type Meta = Record<string, unknown>;

class FakeChannel implements LibraryChannel {
  readonly handlers: Handler[] = [];
  constructor(
    private readonly bus: FakeRealtime,
    readonly topic: string,
    private readonly presenceKey: string | null,
    private readonly self: boolean
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
    this.bus.attach(this);
    queueMicrotask(() => {
      if (!this.bus.isAttached(this)) return;
      callback?.('SUBSCRIBED');
      this.deliver('presence', 'sync', undefined);
    });
    return this;
  }

  presenceState(): Record<string, Meta[]> {
    return this.bus.presenceState(this.topic);
  }

  async track(payload: Meta): Promise<unknown> {
    if (!this.presenceKey) return 'error';
    this.bus.setPresence(this.topic, this.presenceKey, payload);
    return 'ok';
  }

  async untrack(): Promise<unknown> {
    if (this.presenceKey) this.bus.removePresence(this.topic, this.presenceKey);
    return 'ok';
  }

  async send(message: {
    type: 'broadcast';
    event: string;
    payload: Record<string, unknown>;
  }): Promise<unknown> {
    this.bus.broadcast(this.topic, message.event, message.payload, this);
    return 'ok';
  }

  deliver(type: Handler['type'], event: string, payload: unknown) {
    for (const h of this.handlers) {
      if (h.type === type && h.event === event) h.callback({ payload });
    }
  }

  get echoesSelf() {
    return this.self;
  }

  get key() {
    return this.presenceKey;
  }
}

export class FakeRealtime {
  private readonly channels = new Set<FakeChannel>();
  private readonly presence = new Map<string, Map<string, Meta>>();
  /** Chaque broadcast émis par le client local (sujet, événement, payload). */
  readonly sent: Array<{ topic: string; event: string; payload: unknown }> = [];

  readonly client: LibraryRealtimeClient = {
    channel: (topic: string, options: LibraryChannelOptions) =>
      new FakeChannel(
        this,
        topic,
        options.config.presence?.key ?? null,
        options.config.broadcast?.self ?? false
      ),
    removeChannel: (channel: LibraryChannel) => {
      const ch = channel as FakeChannel;
      this.channels.delete(ch);
      if (ch.key) this.removePresence(ch.topic, ch.key);
      return 'ok';
    },
    setAuth: async () => undefined,
  };

  attach(channel: FakeChannel) {
    this.channels.add(channel);
  }

  isAttached(channel: FakeChannel) {
    return this.channels.has(channel);
  }

  /** Les sujets auxquels un canal local est abonné. */
  topics(): string[] {
    return [...new Set([...this.channels].map((c) => c.topic))].sort();
  }

  presenceState(topic: string): Record<string, Meta[]> {
    const byKey = this.presence.get(topic);
    const out: Record<string, Meta[]> = {};
    for (const [key, meta] of byKey ?? []) {
      out[key] = [{ ...meta, presence_ref: `fake-${key}` }];
    }
    return out;
  }

  setPresence(topic: string, key: string, meta: Meta) {
    let byKey = this.presence.get(topic);
    if (!byKey) {
      byKey = new Map();
      this.presence.set(topic, byKey);
    }
    byKey.set(key, { ...meta });
    this.sync(topic);
  }

  removePresence(topic: string, key: string) {
    if (this.presence.get(topic)?.delete(key)) this.sync(topic);
  }

  broadcast(
    topic: string,
    event: string,
    payload: unknown,
    from: FakeChannel | null
  ) {
    if (from) this.sent.push({ topic, event, payload });
    for (const ch of this.channels) {
      if (ch.topic !== topic) continue;
      if (ch === from && !ch.echoesSelf) continue;
      ch.deliver('broadcast', event, payload);
    }
  }

  private sync(topic: string) {
    for (const ch of this.channels) {
      if (ch.topic === topic) ch.deliver('presence', 'sync', undefined);
    }
  }

  /* ------------------------------------------- les autres, simulées --- */

  /** Une autre joueuse entre (ou met à jour sa présence). */
  peerJoin(topic: string, meta: Meta & { userId: string }) {
    this.setPresence(topic, meta.userId, meta);
  }

  peerLeave(topic: string, userId: string) {
    this.removePresence(topic, userId);
  }

  /** Un broadcast d'une autre joueuse (ou d'une cliente malveillante). */
  peerSend(topic: string, event: string, payload: unknown) {
    this.broadcast(topic, event, payload, null);
  }

  /** Un événement de l'API (clé service role) : `kicked`, `banned`, `hide`… */
  server(topic: string, event: string, payload: unknown) {
    this.broadcast(topic, event, payload, null);
  }
}

export function createFakeRealtime(): FakeRealtime {
  return new FakeRealtime();
}

/* --------------------------------------------- une entrée de démonstration --- */

export const FAKE_TENANT_ID = '00000000-0000-4000-8000-0000000000aa';
export const FAKE_SELF_ID = '00000000-0000-4000-8000-000000000001';
export const FAKE_ROOM_ID = '00000000-0000-4000-8000-0000000000b1';

/**
 * Un jeton NON signé (lot 14a) : ma présence part sans identité vérifiable, et
 * la clé ne vérifie rien — personne n'est montré. Pour voir des joueuses,
 * signer l'entrée (`./presenceSigner.ts`, `signedEnter`).
 */
export function unsignedPresence(): LibraryPresenceGrant {
  const now = Date.now();
  return {
    ticket: '',
    issuedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + 2 * 60 * 60_000).toISOString(),
    key: { kty: 'EC', crv: 'P-256', x: 'A'.repeat(43), y: 'A'.repeat(43) },
  };
}

/** Ce que `POST rooms/:id/enter` rendrait, pour une salle du type voulu. */
export function fakeEnterResponse(
  kind: LibraryRoomKind = 'hall',
  overrides: Partial<LibraryEnterResponse> = {}
): LibraryEnterResponse {
  const roomId = overrides.room?.id ?? FAKE_ROOM_ID;
  const selfId = overrides.me?.userId ?? FAKE_SELF_ID;
  return {
    room: {
      id: roomId,
      kind,
      name: null,
      access: kind === 'apartment' ? 'open' : 'private',
      width: LIBRARY_APARTMENT_SIZE.width,
      depth: LIBRARY_APARTMENT_SIZE.depth,
      decor: DEFAULT_APARTMENT_DECOR,
      version: 1,
      isOwner: kind === 'apartment',
      tenantId: FAKE_TENANT_ID,
    },
    items: [],
    canBeVisible: true,
    discreetByDefault: kind === 'reading_room',
    hiddenUserIds: [],
    topics: {
      room: `library:room:${roomId}`,
      chat: `library:chat:${roomId}`,
      tenant: `library:tenant:${FAKE_TENANT_ID}`,
      user: `library:user:${selfId}`,
    },
    me: { userId: selfId, nickname: 'Lune', avatarId: 'a03' },
    // Lot 6 : le chat, fermé comme en production tant qu'on ne l'ouvre pas.
    chat: { ...LIBRARY_CHAT_CLOSED },
    presence: unsignedPresence(),
    ...overrides,
  };
}
