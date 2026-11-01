// tests/unit/realtimeLibraryProtocol.test.ts
//
// Règles des salons de la Women's Library sur le Worker temps réel
// (realtime/protocol.ts, docs/AUTH-BETTER-AUTH.md, lot 3). Le comportement du
// Worker lui-même est contrôlé par scripts/realtime-check.mjs.

import { describe, expect, it } from 'vitest';
import {
  hmacHex,
  isLibraryPeerRoom,
  isLibraryRoom,
  isPublicRoom,
  isValidRoom,
  MAX_CLIENT_MESSAGE_BYTES,
  MAX_PUBLISH_MESSAGES,
  parseLibraryClientMessage,
  parsePublishBody,
  signTicket,
  ticketRoom,
  verifyNotify,
  verifyPublish,
  verifyTicket,
} from '../../realtime/protocol';

const UUID = '11111111-1111-4111-8111-111111111111';
const SECRET = 'y'.repeat(40);
const NOW = 1_700_000_000_000;

describe('salons de la Library', () => {
  it.each(['room', 'chat', 'tenant', 'user'])('library:%s:<uuid>', (family) => {
    const room = `library:${family}:${UUID}`;
    expect(isLibraryRoom(room)).toBe(true);
    expect(isValidRoom(room)).toBe(true);
    // Jamais public : le ticket est exigé.
    expect(isPublicRoom(room)).toBe(false);
  });

  it('refuse les autres noms', () => {
    for (const room of [
      'library:room',
      `library:other:${UUID}`,
      `library:room:${UUID}:x`,
      `demandes:team:${UUID}`,
      'test:ci',
    ]) {
      expect(isLibraryRoom(room)).toBe(false);
    }
  });

  it('seul `library:room:` s’écrit depuis un écran', () => {
    expect(isLibraryPeerRoom(`library:room:${UUID}`)).toBe(true);
    for (const family of ['chat', 'tenant', 'user']) {
      expect(isLibraryPeerRoom(`library:${family}:${UUID}`)).toBe(false);
    }
  });
});

describe('ticketRoom', () => {
  it('lit le salon, que verifyTicket confirme ensuite', async () => {
    const room = `library:user:${UUID}`;
    const ticket = await signTicket({
      secret: SECRET,
      room,
      exp: NOW / 1000 + 300,
    });
    expect(ticketRoom(ticket)).toBe(room);
    expect(
      await verifyTicket({ secret: SECRET, ticket, room, now: NOW })
    ).toEqual({ ok: true, user: null });
  });

  it('ne vérifie rien : un ticket forgé garde son salon, et verifyTicket le refuse', async () => {
    const room = `library:room:${UUID}`;
    const ticket = await signTicket({
      secret: 'autre'.repeat(10),
      room,
      exp: NOW / 1000 + 300,
    });
    expect(ticketRoom(ticket)).toBe(room);
    expect(
      await verifyTicket({ secret: SECRET, ticket, room, now: NOW })
    ).toEqual({ ok: false });
  });

  it.each(['', 'sans-point', '.', '%%%.abc', 'x'.repeat(2000)])(
    'illisible : null (%s)',
    (ticket) => {
      expect(ticketRoom(ticket)).toBeNull();
    }
  );
});

describe('verifyPublish', () => {
  const body =
    '{"messages":[{"room":"library:chat:ci","event":"kicked","payload":{"userId":"u"}}]}';
  const timestamp = '1700000000000';
  // Le même vecteur est figé côté API (libraryRealtimeBroadcast.test.ts).
  const signature =
    '37d30c4895c03f2ef479d97355e012afa4fc2bc3490b7291cf1efbad221244b6';

  it('accepte le vecteur signé par l’API', async () => {
    expect(
      await verifyPublish({
        secret: SECRET,
        body,
        timestamp,
        signature,
        now: NOW,
      })
    ).toBe(true);
  });

  it('refuse un corps modifié, un secret différent, un horodatage trop vieux', async () => {
    expect(
      await verifyPublish({
        secret: SECRET,
        body: `${body} `,
        timestamp,
        signature,
        now: NOW,
      })
    ).toBe(false);
    expect(
      await verifyPublish({
        secret: 'autre'.repeat(10),
        body,
        timestamp,
        signature,
        now: NOW,
      })
    ).toBe(false);
    expect(
      await verifyPublish({
        secret: SECRET,
        body,
        timestamp,
        signature,
        now: NOW + 6 * 60_000,
      })
    ).toBe(false);
  });

  it('une signature de notification ne vaut pas publication, et inversement', async () => {
    const notifySignature = await hmacHex(SECRET, `${timestamp}.${body}`);
    expect(
      await verifyPublish({
        secret: SECRET,
        body,
        timestamp,
        signature: notifySignature,
        now: NOW,
      })
    ).toBe(false);
    expect(
      await verifyNotify({
        secret: SECRET,
        body,
        timestamp,
        signature,
        now: NOW,
      })
    ).toBe(false);
  });
});

describe('parsePublishBody', () => {
  const message = {
    room: `library:chat:${UUID}`,
    event: 'message_hidden',
    payload: { id: 'm1' },
  };

  it('accepte des événements de la Library', () => {
    expect(parsePublishBody(JSON.stringify({ messages: [message] }))).toEqual({
      ok: true,
      messages: [message],
    });
  });

  it('refuse le reste', () => {
    const cases: Array<[unknown, string]> = [
      [{ messages: [] }, 'messages'],
      [{}, 'messages'],
      [{ messages: Array(MAX_PUBLISH_MESSAGES + 1).fill(message) }, 'messages'],
      [{ messages: [{ ...message, room: 'demandes:team:x' }] }, 'room'],
      [{ messages: [{ ...message, event: 'A B' }] }, 'event'],
      [{ messages: [{ ...message, payload: [] }] }, 'payload'],
    ];
    for (const [value, error] of cases) {
      expect(parsePublishBody(JSON.stringify(value))).toEqual({
        ok: false,
        error,
      });
    }
    expect(parsePublishBody('pas du json')).toEqual({
      ok: false,
      error: 'json',
    });
  });
});

describe('parseLibraryClientMessage', () => {
  const parse = (v: unknown) => parseLibraryClientMessage(JSON.stringify(v));

  it('les quatre messages d’un écran', () => {
    expect(
      parse({ type: 'broadcast', event: 'move', payload: { gx: 1 } })
    ).toEqual({ type: 'broadcast', event: 'move', payload: { gx: 1 } });
    expect(
      parse({ type: 'track', key: UUID, state: { gx: 1 }, extra: true })
    ).toEqual({ type: 'track', key: UUID, state: { gx: 1 } });
    expect(parse({ type: 'untrack' })).toEqual({ type: 'untrack' });
    expect(parse({ type: 'renew', ticket: 'abc.def' })).toEqual({
      type: 'renew',
      ticket: 'abc.def',
    });
  });

  it('une présence réelle (jeton compris) tient dans la limite', () => {
    const state = {
      userId: UUID,
      gx: 12,
      gy: 8,
      dir: 4,
      ticket: 't'.repeat(1024),
      seat: { item: UUID, spot: 1 },
    };
    const raw = JSON.stringify({ type: 'track', key: UUID, state });
    expect(raw.length).toBeLessThan(MAX_CLIENT_MESSAGE_BYTES);
    expect(parseLibraryClientMessage(raw)?.type).toBe('track');
  });

  it('refuse le reste', () => {
    for (const v of [
      { type: 'broadcast', event: 'A B', payload: {} },
      { type: 'broadcast', event: 'move', payload: 'x' },
      { type: 'track', key: 'a b', state: {} },
      { type: 'track', key: UUID, state: [] },
      { type: 'renew', ticket: 't'.repeat(1025) },
      { type: 'presence', state: {} },
      [],
    ]) {
      expect(parse(v)).toBeNull();
    }
    expect(parseLibraryClientMessage('ping')).toBeNull();
    expect(parseLibraryClientMessage(42)).toBeNull();
    expect(
      parseLibraryClientMessage(
        JSON.stringify({ type: 'untrack', pad: 'x'.repeat(3000) })
      )
    ).toBeNull();
  });
});
