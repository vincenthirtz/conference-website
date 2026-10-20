// Women's Library, lot 6 — le chat côté joueuse, sans écran :
//   * le fil (realtime/chatState.ts) : pas de doublon, ordre d'envoi, jamais
//     une personne masquée (bloquer masque aussi ses messages, y compris
//     ceux déjà affichés), un message masqué perd son texte AUSSITÔT ;
//   * la connexion (realtime/connection.ts + chatEvents.ts) : seuls les
//     canaux SERVEUR parlent — un `message` forgé sur `library:room:` est
//     ignoré ; payloads validés et bornés ; MA sourdine d'une autre salle
//     ignorée ;
//   * le relais (realtime/chatBus.ts) rejoue le contexte à un abonné tardif ;
//   * le modèle (ui/chat/chatModel.ts) : refus traduits, bulles posées sur
//     les avatars quand le message est plus récent que le signe ;
//   * le moteur dessine une bulle de chat plus large (engine/avatarOverlays).

import { afterEach, describe, expect, it } from 'vitest';
import { createLibraryRoomConnection } from '../../features/player/library/realtime/connection';
import type { LibraryChatEvent } from '../../features/player/library/realtime/chatEvents';
import {
  isChatPayloadOversized,
  parseChatMessage,
} from '../../features/player/library/realtime/chatEvents';
import {
  chatFeedReducer,
  CHAT_FEED_MAX,
  initialChatFeed,
  isMutedAt,
} from '../../features/player/library/realtime/chatState';
import {
  clearLibraryChat,
  publishLibraryChatContext,
  publishLibraryChatEvent,
  subscribeLibraryChat,
  type LibraryChatBusEvent,
} from '../../features/player/library/realtime/chatBus';
import {
  createFakeRealtime,
  FAKE_ROOM_ID,
  FAKE_SELF_ID,
  fakeEnterResponse,
} from '../../features/player/library/dev/fakeRealtime';
import {
  chatBubbleOf,
  chatErrorOf,
  retrySeconds,
  withChatBubbles,
} from '../../features/player/library/ui/chat/chatModel';
import { actionsFor } from '../../features/player/library/ui/chat/ChatFeed';
import { avatarOverlays } from '../../features/player/library/engine/avatarOverlays';
import { LibraryWorld } from '../../features/player/library/engine/world';
import { PlayerHttpError } from '../../utils/player/playerHttp';
import type { LibraryChatMessage } from '../../features/player/library/chat/responses';
import type { RemoteAvatarInput } from '../../features/player/library/engine/remotes';

const IRIS = '00000000-0000-4000-8000-000000000011';
const NOVA = '00000000-0000-4000-8000-000000000012';
const OTHER_ROOM = '00000000-0000-4000-8000-0000000000c2';

let seq = 0;
function msg(
  userId: string,
  body: string,
  createdAt = `2026-10-20T12:00:${String(seq).padStart(2, '0')}.000Z`
): LibraryChatMessage {
  seq += 1;
  return {
    id: `00000000-0000-4000-8000-${String(1000 + seq).padStart(12, '0')}`,
    userId,
    nickname: userId === IRIS ? 'Iris' : 'Nova',
    body,
    createdAt,
  };
}

/* ------------------------------------------------------------- le fil --- */

describe('chatFeedReducer', () => {
  it('fusionne sans doublon, dans l’ordre d’envoi', () => {
    const a = msg(IRIS, 'a', '2026-10-20T12:00:01.000Z');
    const b = msg(NOVA, 'b', '2026-10-20T12:00:02.000Z');
    let s = chatFeedReducer(initialChatFeed(), { type: 'message', message: b });
    s = chatFeedReducer(s, { type: 'history', messages: [a, b] });
    s = chatFeedReducer(s, { type: 'message', message: b });
    expect(s.messages.map((m) => m.body)).toEqual(['a', 'b']);
    expect(s.loaded).toBe(true);
  });

  it('un message déjà connu ne change pas l’état (même référence)', () => {
    const a = msg(IRIS, 'a');
    const s = chatFeedReducer(initialChatFeed(), {
      type: 'message',
      message: a,
    });
    expect(chatFeedReducer(s, { type: 'message', message: a })).toBe(s);
  });

  it('bloquer masque ses messages, y compris ceux déjà affichés', () => {
    let s = chatFeedReducer(initialChatFeed(), {
      type: 'history',
      messages: [msg(IRIS, 'bonjour'), msg(NOVA, 'salut')],
    });
    s = chatFeedReducer(s, { type: 'hiddenUsers', userIds: [IRIS] });
    expect(s.messages.map((m) => m.userId)).toEqual([NOVA]);
    s = chatFeedReducer(s, { type: 'message', message: msg(IRIS, 'encore') });
    expect(s.messages.map((m) => m.userId)).toEqual([NOVA]);
  });

  it('masqué par la modération : texte effacé, et une arrivée tardive aussi', () => {
    const a = msg(IRIS, 'propos limite');
    let s = chatFeedReducer(initialChatFeed(), { type: 'message', message: a });
    s = chatFeedReducer(s, { type: 'hidden', id: a.id });
    expect(s.messages[0]).toMatchObject({ id: a.id, body: '', hidden: true });
    const late = msg(NOVA, 'en retard');
    s = chatFeedReducer(s, { type: 'hidden', id: late.id });
    s = chatFeedReducer(s, { type: 'history', messages: [late] });
    expect(s.messages.find((m) => m.id === late.id)).toMatchObject({
      body: '',
      hidden: true,
    });
  });

  it(`garde au plus ${CHAT_FEED_MAX} messages (les plus récents)`, () => {
    const many = Array.from({ length: CHAT_FEED_MAX + 5 }, (_, i) =>
      msg(
        IRIS,
        `m${i}`,
        new Date(Date.UTC(2026, 9, 20, 12, 0, i)).toISOString()
      )
    );
    const s = chatFeedReducer(initialChatFeed(), {
      type: 'history',
      messages: many,
    });
    expect(s.messages).toHaveLength(CHAT_FEED_MAX);
    expect(s.messages[0].body).toBe('m5');
  });

  it('sourdine : la plus lointaine gagne ; levée efface', () => {
    let s = chatFeedReducer(initialChatFeed(), {
      type: 'muted',
      until: '2026-10-20T13:00:00.000Z',
    });
    s = chatFeedReducer(s, {
      type: 'muted',
      until: '2026-10-20T12:30:00.000Z',
    });
    expect(s.mutedUntil).toBe('2026-10-20T13:00:00.000Z');
    expect(
      isMutedAt(s.mutedUntil, Date.parse('2026-10-20T12:59:00.000Z'))
    ).toBe(true);
    expect(
      isMutedAt(s.mutedUntil, Date.parse('2026-10-20T13:00:01.000Z'))
    ).toBe(false);
    s = chatFeedReducer(s, { type: 'unmuted' });
    expect(s.mutedUntil).toBeNull();
  });
});

/* ------------------------------------------------- la connexion, le canal --- */

const flush = () => new Promise((resolve) => setTimeout(resolve, 0));

describe('la connexion n’écoute le chat que sur les canaux SERVEUR', () => {
  const closers: Array<() => Promise<void>> = [];
  afterEach(async () => {
    for (const close of closers) await close();
    closers.length = 0;
  });

  async function setup() {
    const bus = createFakeRealtime();
    const enter = fakeEnterResponse('hall');
    const events: LibraryChatEvent[] = [];
    const conn = createLibraryRoomConnection({
      client: bus.client,
      enter,
      position: { gx: 2, gy: 2, dir: 4 },
      onState: () => {},
      onEvicted: () => {},
      onChat: (e) => events.push(e),
    });
    closers.push(() => conn.close());
    await flush();
    return { bus, enter, events };
  }

  it('`message` et `message_hidden` sur library:chat:<salle>', async () => {
    const { bus, enter, events } = await setup();
    const m = msg(IRIS, 'bonsoir');
    bus.server(enter.topics.chat, 'message', m);
    bus.server(enter.topics.chat, 'message_hidden', { id: m.id });
    expect(events).toEqual([
      { type: 'message', message: m },
      { type: 'hidden', id: m.id },
    ]);
  });

  it('un `message` forgé sur library:room: est ignoré', async () => {
    const { bus, enter, events } = await setup();
    bus.peerSend(enter.topics.room, 'message', msg(IRIS, 'je me fais passer'));
    expect(events).toEqual([]);
  });

  it('payload mal formé, trop long ou trop gros : jeté', async () => {
    const { bus, enter, events } = await setup();
    bus.server(enter.topics.chat, 'message', {
      ...msg(IRIS, 'x'),
      userId: 'pas-un-uuid',
    });
    bus.server(enter.topics.chat, 'message', msg(IRIS, 'y'.repeat(201)));
    bus.server(enter.topics.chat, 'message', {
      ...msg(IRIS, 'z'),
      pad: 'p'.repeat(3000),
    });
    expect(events).toEqual([]);
    expect(isChatPayloadOversized({ pad: 'p'.repeat(3000) })).toBe(true);
    expect(parseChatMessage(msg(IRIS, '💜'.repeat(200)))).not.toBeNull();
  });

  it('MA sourdine : ici ou partout ; celle d’une autre salle ou d’une autre est ignorée', async () => {
    const { bus, enter, events } = await setup();
    const until = '2026-10-20T13:00:00.000Z';
    bus.server(enter.topics.user, 'muted', {
      userId: FAKE_SELF_ID,
      roomId: OTHER_ROOM,
      until,
    });
    bus.server(enter.topics.user, 'muted', {
      userId: IRIS,
      roomId: null,
      until,
    });
    bus.server(enter.topics.user, 'muted', {
      userId: FAKE_SELF_ID,
      roomId: FAKE_ROOM_ID,
      until,
    });
    bus.server(enter.topics.user, 'muted', {
      userId: FAKE_SELF_ID,
      roomId: null,
      until,
    });
    bus.server(enter.topics.user, 'unmuted', {
      userId: FAKE_SELF_ID,
      roomId: null,
    });
    expect(events).toEqual([
      { type: 'muted', roomId: FAKE_ROOM_ID, until },
      { type: 'muted', roomId: null, until },
      { type: 'unmuted', roomId: null },
    ]);
  });
});

/* ----------------------------------------------------------- le relais --- */

describe('chatBus', () => {
  it('rejoue le dernier contexte à un abonné tardif ; isole les salles', () => {
    const room = '00000000-0000-4000-8000-0000000000d1';
    publishLibraryChatContext(room, { selfId: IRIS, hiddenUserIds: [NOVA] });
    const got: LibraryChatBusEvent[] = [];
    const off = subscribeLibraryChat(room, (e) => got.push(e));
    const other: LibraryChatBusEvent[] = [];
    const offOther = subscribeLibraryChat(OTHER_ROOM, (e) => other.push(e));
    publishLibraryChatEvent(room, { type: 'hidden', id: 'x' });
    // Le même contexte n'est pas rediffusé.
    publishLibraryChatContext(room, { selfId: IRIS, hiddenUserIds: [NOVA] });
    expect(got).toEqual([
      { type: 'context', context: { selfId: IRIS, hiddenUserIds: [NOVA] } },
      { type: 'hidden', id: 'x' },
    ]);
    expect(other).toEqual([]);
    off();
    offOther();
    clearLibraryChat(room);
    const late: LibraryChatBusEvent[] = [];
    subscribeLibraryChat(room, (e) => late.push(e))();
    expect(late).toEqual([]);
  });
});

/* ----------------------------------------------------------- le modèle --- */

describe('chatModel', () => {
  const httpError = (status: number, payload: Record<string, unknown>) =>
    new PlayerHttpError('refus', status, payload);

  it('traduit les refus et garde leurs détails', () => {
    expect(
      chatErrorOf(httpError(403, { code: 'chat_muted', until: 'U' }))
    ).toEqual({
      key: 'chat_muted',
      until: 'U',
    });
    expect(
      chatErrorOf(httpError(429, { code: 'chat_too_fast', retryAfterMs: 3200 }))
    ).toEqual({ key: 'chat_too_fast', retryAfterMs: 3200 });
    expect(chatErrorOf(httpError(422, { code: 'chat_filtered' })).key).toBe(
      'chat_filtered'
    );
    expect(chatErrorOf(httpError(403, { code: 'room_forbidden' })).key).toBe(
      'room_closed'
    );
    expect(chatErrorOf(httpError(403, { code: 'LIBRARY_BANNED' })).key).toBe(
      'library_banned'
    );
    expect(chatErrorOf(httpError(429, {})).key).toBe('rate_limited');
    expect(chatErrorOf(new Error('réseau')).key).toBe('generic');
    expect(retrySeconds(3200)).toBe(4);
    expect(retrySeconds(undefined)).toBe(1);
  });

  it('les gestes possibles sur un message', () => {
    const theirs = { ...msg(IRIS, 'x') };
    const mine = { ...msg(NOVA, 'y') };
    const ctx = { selfId: NOVA, canHide: false, canMute: false };
    expect(actionsFor(theirs, ctx)).toEqual(['report']);
    expect(actionsFor(mine, ctx)).toEqual([]);
    expect(
      actionsFor(theirs, { ...ctx, canHide: true, canMute: true })
    ).toEqual(['report', 'hide', 'mute']);
    expect(
      actionsFor({ ...theirs, hidden: true }, { ...ctx, canHide: true })
    ).toEqual([]);
  });

  it('la bulle la plus récente gagne (signe ou message)', () => {
    const remote: RemoteAvatarInput[] = [
      {
        id: IRIS,
        nickname: 'Iris',
        avatarId: 'a01',
        tile: { i: 1, j: 1 },
        dir: 4,
        target: null,
        bubble: { key: 'sign', glyph: '👋', text: 'Saluer', shownAt: 100 },
      },
      {
        id: NOVA,
        nickname: 'Nova',
        avatarId: 'a02',
        tile: { i: 2, j: 2 },
        dir: 4,
        target: null,
        bubble: { key: 'sign', glyph: '👋', text: 'Saluer', shownAt: 500 },
      },
    ];
    const bubbles = new Map([
      [IRIS, chatBubbleOf({ id: 'm1', body: 'bonsoir' }, 200)],
      [NOVA, chatBubbleOf({ id: 'm2', body: 'trop tôt' }, 300)],
    ]);
    const out = withChatBubbles(remote, bubbles);
    expect(out[0].bubble).toEqual({
      key: 'chat:m1',
      glyph: null,
      text: 'bonsoir',
      shownAt: 200,
    });
    expect(out[1]).toBe(remote[1]);
    expect(withChatBubbles(remote, new Map())).toBe(remote);
  });
});

/* ------------------------------------------------------------ le moteur --- */

describe('avatarOverlays : une bulle de chat est marquée `chat`', () => {
  it('par sa clé `chat:` ; une bulle de signe ne l’est pas', () => {
    const w = new LibraryWorld(
      { w: 14, d: 12, wallHeight: 2.6, items: [] },
      {}
    );
    const base = { avatarId: null, dir: 4 as const, target: null };
    w.syncRemoteAvatars(
      [
        {
          ...base,
          id: IRIS,
          nickname: 'Iris',
          tile: { i: 2, j: 2 },
          bubble: { key: 'chat:m1', glyph: null, text: 'bonsoir', shownAt: 0 },
        },
        {
          ...base,
          id: NOVA,
          nickname: 'Nova',
          tile: { i: 6, j: 6 },
          bubble: { key: 'k', glyph: '👋', text: 'Saluer', shownAt: 0 },
        },
      ],
      0
    );
    const list = avatarOverlays(w, { x: 300, y: 80, zoom: 1 });
    const byId = new Map(list.map((o) => [o.id, o]));
    expect(byId.get(IRIS)?.bubble).toEqual({
      glyph: null,
      text: 'bonsoir',
      chat: true,
    });
    expect(byId.get(NOVA)?.bubble).toEqual({ glyph: '👋', text: 'Saluer' });
  });
});
