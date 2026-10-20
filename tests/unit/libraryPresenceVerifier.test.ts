// Women's Library, lot 14a — « une identité fiable dans les salles » : la
// vérification des JETONS DE PRÉSENCE côté navigateur
// (features/player/library/realtime/presenceVerifier.ts), avec le vrai
// WebCrypto et un signataire de test qui joue la clé de l'API.
//   * un jeton signé par la clé rendue à l'entrée, pour CETTE salle, est
//     accepté ; retouché, signé par une autre clé, d'une autre salle : refusé ;
//   * il est jugé une fois (cache), de façon asynchrone ;
//   * sans WebCrypto ou avec une clé illisible : PERSONNE n'est montré ;
//   * dans une salle : une présence forgée, retouchée, échue, d'une autre
//     salle ou posée sous la clé d'une autre n'apparaît pas, ses
//     déplacements, emotes et phrases sont ignorés ; le pseudo et le look
//     montrés sont CEUX DU JETON ; un jeton qui échoit fait disparaître
//     l'avatar.

import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  createFakeRealtime,
  FAKE_ROOM_ID,
  FAKE_SELF_ID,
  fakeEnterResponse,
  unsignedPresence,
} from '../../features/player/library/dev/fakeRealtime';
import {
  createDevPresenceSigner,
  type DevPresenceSigner,
  signedPeerMeta,
} from '../../features/player/library/dev/presenceSigner';
import {
  base64UrlToBytes,
  bytesToBase64Url,
} from '../../features/player/library/presenceTicket';
import {
  createLibraryRoomConnection,
  type LibraryRoomConnection,
} from '../../features/player/library/realtime/connection';
import { createPresenceVerifier } from '../../features/player/library/realtime/presenceVerifier';
import type { LibraryPresenceGrant } from '../../features/player/library/socialResponses';

const IRIS = '00000000-0000-4000-8000-000000000011';
const NOVA = '00000000-0000-4000-8000-000000000012';
const OTHER_ROOM = '00000000-0000-4000-8000-0000000000c2';
const LOOK = '1130641';

let signer: DevPresenceSigner;
let attacker: DevPresenceSigner;
let selfGrant: LibraryPresenceGrant;
beforeAll(async () => {
  signer = await createDevPresenceSigner();
  attacker = await createDevPresenceSigner();
  selfGrant = await signer.grant({
    roomId: FAKE_ROOM_ID,
    userId: FAKE_SELF_ID,
    nickname: 'Lune',
    avatarId: 'a03',
  });
});

const iris = (over: Record<string, unknown> = {}) => ({
  roomId: FAKE_ROOM_ID,
  userId: IRIS,
  nickname: 'Iris',
  avatarId: 'a05',
  look: LOOK,
  ...over,
});

/** Retouche la charge d'un jeton (le pseudo), en gardant sa signature. */
function tamper(ticket: string, nickname: string): string {
  const [payload, sig] = ticket.split('.');
  const json = JSON.parse(
    new TextDecoder().decode(base64UrlToBytes(payload) ?? new Uint8Array())
  );
  const forged = bytesToBase64Url(
    new TextEncoder().encode(JSON.stringify({ ...json, nickname }))
  );
  return `${forged}.${sig}`;
}

describe('createPresenceVerifier — WebCrypto réel', () => {
  async function judge(ticket: string, roomId = FAKE_ROOM_ID) {
    const verifier = createPresenceVerifier({
      key: signer.key,
      roomId,
      onSettled: () => undefined,
    });
    expect(verifier.check(ticket)).toBeUndefined();
    await verifier.idle();
    return verifier.check(ticket);
  }

  it('accepte un jeton de la clé, pour cette salle', async () => {
    const claims = await judge(await signer.sign(iris()));
    expect(claims).toMatchObject({
      userId: IRIS,
      nickname: 'Iris',
      avatarId: 'a05',
      look: LOOK,
      roomId: FAKE_ROOM_ID,
    });
  });

  it('refuse : charge retouchée, autre clé, autre salle, charabia', async () => {
    const valid = await signer.sign(iris());
    expect(await judge(tamper(valid, 'Usurpée'))).toBeNull();
    expect(await judge(await attacker.sign(iris()))).toBeNull();
    expect(await judge(valid, OTHER_ROOM)).toBeNull();
    expect(await judge('pas.un-jeton')).toBeNull();
  });

  it('un jeton est jugé UNE fois (cache) ; `onSettled` prévient à l’issue', async () => {
    const subtle = globalThis.crypto.subtle;
    const verify = vi.spyOn(subtle, 'verify');
    const onSettled = vi.fn();
    const verifier = createPresenceVerifier({
      key: signer.key,
      roomId: FAKE_ROOM_ID,
      onSettled,
      subtle,
    });
    const ticket = await signer.sign(iris());
    verifier.check(ticket);
    verifier.check(ticket);
    await verifier.idle();
    expect(verifier.check(ticket)).not.toBeNull();
    expect(verify).toHaveBeenCalledTimes(1);
    expect(onSettled).toHaveBeenCalledTimes(1);
    verify.mockRestore();
  });

  it('sans WebCrypto, ou avec une clé illisible : rien n’est accepté (un avertissement)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const ticket = await signer.sign(iris());
    const without = createPresenceVerifier({
      key: signer.key,
      roomId: FAKE_ROOM_ID,
      onSettled: () => undefined,
      subtle: null,
    });
    without.check(ticket);
    await without.idle();
    expect(without.check(ticket)).toBeNull();
    const badKey = createPresenceVerifier({
      key: unsignedPresence().key,
      roomId: FAKE_ROOM_ID,
      onSettled: () => undefined,
    });
    badKey.check(ticket);
    await badKey.idle();
    expect(badKey.check(ticket)).toBeNull();
    expect(warn.mock.calls.length).toBeLessThanOrEqual(1);
    warn.mockRestore();
  });
});

describe('dans une salle — seules les identités vérifiées sont montrées', () => {
  let open: LibraryRoomConnection[] = [];
  afterEach(async () => {
    for (const c of open) await c.close();
    open = [];
  });

  async function room(grant: LibraryPresenceGrant = selfGrant) {
    const bus = createFakeRealtime();
    const enter = fakeEnterResponse('hall', { presence: grant });
    let clock = 0;
    const conn = createLibraryRoomConnection({
      client: bus.client,
      enter,
      position: { gx: 2, gy: 2, dir: 4 },
      onState: () => undefined,
      onEvicted: () => undefined,
      now: () => clock,
    });
    open.push(conn);
    await new Promise((r) => setTimeout(r, 0));
    const topic = enter.topics.room;
    const settle = async () => {
      await conn.presenceSettled();
      await new Promise((r) => setTimeout(r, 0));
    };
    const avatars = () => conn.getState().avatars;
    return {
      bus,
      topic,
      conn,
      settle,
      avatars,
      advance: (ms: number) => {
        clock += ms;
      },
    };
  }

  const at = { gx: 1, gy: 1, dir: 4 };

  it('forgée, retouchée, d’une autre salle, échue, sous la clé d’une autre, sans jeton : personne', async () => {
    const { bus, topic, settle, avatars } = await room();
    const valid = await signer.sign(iris());
    const metas = [
      { userId: IRIS, ...at, ticket: await attacker.sign(iris()) },
      { userId: IRIS, ...at, ticket: tamper(valid, 'Usurpée') },
      {
        userId: IRIS,
        ...at,
        ticket: await signer.sign(iris({ roomId: OTHER_ROOM })),
      },
      {
        userId: IRIS,
        ...at,
        ticket: await signer.sign(iris(), { iat: 1_000, exp: 2_000 }),
      },
      // Le jeton VALIDE d'Iris, sous la clé de Nova.
      { userId: NOVA, ...at, ticket: valid },
      // L'ancienne présence : identité déclarée, aucun jeton.
      { userId: IRIS, nickname: 'Iris', avatarId: 'a05', ...at },
    ];
    for (const meta of metas) {
      bus.peerJoin(topic, meta);
      await settle();
      expect(avatars()).toEqual({});
      // Ses gestes ne valent rien : pas d'avatar fantôme.
      bus.peerSend(topic, 'move', { userId: meta.userId, gx: 3, gy: 3, at: 9 });
      bus.peerSend(topic, 'emote', { userId: meta.userId, emote: 'wave' });
      bus.peerSend(topic, 'phrase', { userId: meta.userId, phraseId: 'gg' });
      expect(avatars()).toEqual({});
      bus.peerLeave(topic, meta.userId);
    }
  });

  it('le pseudo, l’avatar et le look montrés sont ceux du JETON', async () => {
    const { bus, topic, settle, avatars } = await room();
    const meta = await signedPeerMeta(signer, FAKE_ROOM_ID, {
      userId: IRIS,
      nickname: 'Iris',
      avatarId: 'a05',
      look: LOOK,
      ...at,
    });
    bus.peerJoin(topic, {
      ...meta,
      nickname: 'Admin',
      avatarId: 'a01',
      look: '1000000',
    });
    await settle();
    expect(avatars()[IRIS]).toMatchObject({
      nickname: 'Iris',
      avatarId: 'a05',
      look: LOOK,
      ticket: meta.ticket,
    });
  });

  it('une copie forgée sous la clé d’une présente ne remplace pas son identité', async () => {
    const { bus, topic, settle, avatars } = await room();
    const valid = await signer.sign(iris());
    bus.peerJoin(topic, { userId: IRIS, ...at, ticket: valid });
    await settle();
    // Le faux canal range une méta par clé : la copie forgée la remplace,
    // et Iris disparaît plutôt que d'apparaître sous un faux pseudo.
    bus.peerJoin(topic, {
      userId: IRIS,
      ...at,
      ticket: tamper(valid, 'Usurpée'),
    });
    await settle();
    expect(avatars()[IRIS]?.nickname ?? null).not.toBe('Usurpée');
  });

  it('un jeton qui échoit fait disparaître l’avatar au tick suivant', async () => {
    const { bus, topic, conn, settle, avatars, advance } = await room();
    const now = Math.floor(Date.now() / 1000);
    bus.peerJoin(topic, {
      userId: IRIS,
      ...at,
      ticket: await signer.sign(iris(), { iat: now - 10, exp: now + 60 }),
    });
    await settle();
    expect(Object.keys(avatars())).toEqual([IRIS]);
    advance(59_000);
    conn.tick();
    expect(Object.keys(avatars())).toEqual([IRIS]);
    advance(2_000);
    conn.tick();
    expect(avatars()).toEqual({});
  });

  it('une nouvelle clé (renouvellement après rotation) relit la présence', async () => {
    const { bus, topic, conn, settle, avatars } = await room();
    bus.peerJoin(topic, {
      userId: IRIS,
      ...at,
      ticket: await attacker.sign(iris()),
    });
    await settle();
    expect(avatars()).toEqual({});
    // La « nouvelle » clé de l'API est celle qui a signé ce jeton.
    conn.renewPresence(
      await attacker.grant({
        roomId: FAKE_ROOM_ID,
        userId: FAKE_SELF_ID,
        nickname: 'Lune',
        avatarId: 'a03',
      })
    );
    await settle();
    expect(Object.keys(avatars())).toEqual([IRIS]);
  });
});
