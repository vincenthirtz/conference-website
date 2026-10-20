// Women's Library, lot 13 — le look COMPOSÉ dans la présence temps réel,
// depuis le lot 14a porté par le JETON DE PRÉSENCE signé :
//   * l'avatar d'une autre prend le look DE SON JETON (lu en base par l'API,
//     forme compacte des listes fermées) ; un `look` posé à côté dans le
//     payload est IGNORÉ ; sans look, il retombe sur son `avatarId` ;
//   * il suit la présence jusqu'au moteur (RemoteAvatar → RemoteAvatarInput) ;
//   * ma présence ne porte que ma case et MON jeton (ni pseudo ni look
//     déclarés) ; un jeton renouvelé (nouveau look) repart avec elle.

import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import {
  encodeLibraryLook,
  LIBRARY_AVATAR_PRESETS,
} from '../../config/library/avatarLook';
import {
  createFakeRealtime,
  FAKE_ROOM_ID,
  FAKE_SELF_ID,
  fakeEnterResponse,
} from '../../features/player/library/dev/fakeRealtime';
import {
  createDevPresenceSigner,
  type DevPresenceSigner,
  signedEnter,
  signedPeerMeta,
} from '../../features/player/library/dev/presenceSigner';
import {
  createLibraryRoomConnection,
  type LibraryRoomConnection,
} from '../../features/player/library/realtime/connection';
import {
  LibraryPresencePayload,
  LIBRARY_PRESENCE_MAX_CHARS,
  parsePeerPayload,
} from '../../features/player/library/realtime/payloads';
import { visibleAvatars } from '../../features/player/library/realtime/roomState';
import { toRemoteInputs } from '../../features/player/library/roomStageModel';

const IRIS = '00000000-0000-4000-8000-000000000011';
const CODE = encodeLibraryLook(LIBRARY_AVATAR_PRESETS.a07);
const OTHER_CODE = encodeLibraryLook(LIBRARY_AVATAR_PRESETS.a02);
const words = { emotes: {}, phrases: {}, glyphs: {} } as never;

const flush = () => new Promise((r) => setTimeout(r, 0));

let signer: DevPresenceSigner;
beforeAll(async () => {
  signer = await createDevPresenceSigner();
});

let open: LibraryRoomConnection[] = [];
afterEach(async () => {
  for (const c of open) await c.close();
  open = [];
});

async function connect() {
  const bus = createFakeRealtime();
  const enter = await signedEnter(fakeEnterResponse('hall'), signer);
  let clock = 0;
  const conn = createLibraryRoomConnection({
    client: bus.client,
    enter,
    position: { gx: 2, gy: 2, dir: 4 },
    onState: () => undefined,
    onEvicted: () => undefined,
    now: () => clock,
    setTimer: (fn) => {
      clock += 2_000;
      fn();
      return 0;
    },
    clearTimer: () => undefined,
  });
  open.push(conn);
  await flush();
  const mine = () => bus.presenceState(enter.topics.room)[FAKE_SELF_ID]?.[0];
  /** Iris entre, avec SON jeton (look `look`) et ce que le payload ajoute. */
  const irisJoins = async (
    look: string | null,
    extra: Record<string, unknown> = {}
  ) => {
    const meta = await signedPeerMeta(signer, FAKE_ROOM_ID, {
      userId: IRIS,
      nickname: 'Iris',
      avatarId: 'a05',
      look,
      gx: 1,
      gy: 2,
      dir: 4,
    });
    bus.peerJoin(enter.topics.room, { ...meta, ...extra });
    await conn.presenceSettled();
    await flush();
  };
  const avatars = () => visibleAvatars(conn.getState());
  return { bus, enter, conn, mine, irisJoins, avatars };
}

describe('payload de présence', () => {
  it('le look, le pseudo, l’avatar déclarés à côté du jeton ne sont pas transmis', () => {
    const p = parsePeerPayload(
      LibraryPresencePayload,
      {
        userId: IRIS,
        gx: 1,
        gy: 2,
        dir: 4,
        ticket: 'x.y',
        look: CODE,
        nickname: 'Iris',
        avatarId: 'a05',
      },
      LIBRARY_PRESENCE_MAX_CHARS
    );
    expect(p).toEqual({ userId: IRIS, gx: 1, gy: 2, dir: 4, ticket: 'x.y' });
  });
});

describe('du canal au moteur : le look DU JETON', () => {
  it('le look du jeton suit la présence ; celui du payload est ignoré', async () => {
    const { irisJoins, avatars } = await connect();
    await irisJoins(CODE, { look: OTHER_CODE, avatarId: 'a01' });
    expect(avatars()).toHaveLength(1);
    expect(avatars()[0]).toMatchObject({ avatarId: 'a05', look: CODE });
    expect(toRemoteInputs(avatars(), words)[0].look).toBe(CODE);
  });

  it('un jeton sans look : null, repli `avatarId` — même si le payload en déclare un', async () => {
    const { irisJoins, avatars } = await connect();
    await irisJoins(null, { look: CODE });
    expect(avatars()[0].look).toBeNull();
    expect(toRemoteInputs(avatars(), words)[0]).toMatchObject({
      avatarId: 'a05',
      look: null,
    });
  });
});

describe('ma présence', () => {
  it('ne porte que ma case et mon jeton : ni pseudo, ni avatar, ni look déclarés', async () => {
    const { enter, mine } = await connect();
    expect(mine()).toMatchObject({
      userId: FAKE_SELF_ID,
      gx: 2,
      gy: 2,
      dir: 4,
      ticket: enter.presence.ticket,
    });
    for (const key of ['nickname', 'avatarId', 'look'])
      expect(mine()).not.toHaveProperty(key);
  });

  it('un jeton renouvelé (nouveau look) repart avec ma présence', async () => {
    const { conn, mine } = await connect();
    const renewed = await signer.grant({
      roomId: FAKE_ROOM_ID,
      userId: FAKE_SELF_ID,
      nickname: 'Lune',
      avatarId: 'a03',
      look: OTHER_CODE,
    });
    conn.renewPresence(renewed);
    await flush();
    expect(mine()?.ticket).toBe(renewed.ticket);
  });
});
