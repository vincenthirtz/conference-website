// Women's Library, lot 13 — le look COMPOSÉ dans la présence temps réel :
//   * la présence porte un `look` FACULTATIF, sous forme compacte, validé par
//     les listes fermées (config/library/avatarLook.ts) ; hors liste, trop
//     long ou d'un autre type, il est IGNORÉ — la présence, elle, reste lue, et
//     l'avatar retombe sur son `avatarId` ;
//   * il suit la présence jusqu'au moteur (RemoteAvatar → RemoteAvatarInput) ;
//   * ma présence l'annonce s'il est valide, et le renvoie quand il change.

import { afterEach, describe, expect, it } from 'vitest';
import {
  encodeLibraryLook,
  LIBRARY_AVATAR_PRESETS,
} from '../../config/library/avatarLook';
import {
  createFakeRealtime,
  FAKE_SELF_ID,
  fakeEnterResponse,
} from '../../features/player/library/dev/fakeRealtime';
import {
  createLibraryRoomConnection,
  type LibraryRoomConnection,
  readPresence,
} from '../../features/player/library/realtime/connection';
import {
  LibraryPresencePayload,
  parsePeerPayload,
} from '../../features/player/library/realtime/payloads';
import {
  initialRoomState,
  roomSocialReducer,
  visibleAvatars,
} from '../../features/player/library/realtime/roomState';
import { toRemoteInputs } from '../../features/player/library/roomStageModel';

const IRIS = '00000000-0000-4000-8000-000000000011';
const CODE = encodeLibraryLook(LIBRARY_AVATAR_PRESETS.a07);

const presence = (extra: Record<string, unknown> = {}) => ({
  userId: IRIS,
  nickname: 'Iris',
  avatarId: 'a05',
  gx: 1,
  gy: 2,
  dir: 4,
  ...extra,
});

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('payload de présence', () => {
  it('garde un look valide', () => {
    expect(
      parsePeerPayload(LibraryPresencePayload, presence({ look: CODE }))
    ).toMatchObject({ avatarId: 'a05', look: CODE });
  });

  it('sans look : la présence telle quelle', () => {
    const p = parsePeerPayload(LibraryPresencePayload, presence());
    expect(p).not.toBeNull();
    expect(p?.look).toBeUndefined();
  });

  it.each([
    ['hors liste (coiffure z)', '10z0000'],
    ['autre version', '2000000'],
    ['trop long', `1${'0'.repeat(30)}`],
    ['majuscules', '1A00000'],
    ['nombre', 1000000],
    ['objet', { v: 1, skin: 's1' }],
  ])('look %s : ignoré, la présence reste (repli avatarId)', (_l, look) => {
    const p = parsePeerPayload(LibraryPresencePayload, presence({ look }));
    expect(p).toMatchObject({ userId: IRIS, avatarId: 'a05' });
    expect(p?.look).toBeUndefined();
  });

  it('borne de taille : une présence géante n’est pas lue du tout', () => {
    expect(
      parsePeerPayload(
        LibraryPresencePayload,
        presence({ look: CODE, junk: 'x'.repeat(600) })
      )
    ).toBeNull();
  });
});

describe('du canal au moteur', () => {
  it('le look suit la présence, null sans look', () => {
    let state = initialRoomState({
      selfId: FAKE_SELF_ID,
      room: { width: 10, depth: 10 },
    });
    const entries = readPresence({
      [IRIS]: [presence({ look: CODE, presence_ref: 'r1' })],
    });
    state = roomSocialReducer(state, { type: 'presence', entries, now: 0 });
    expect(visibleAvatars(state)[0].look).toBe(CODE);
    const words = { emotes: {}, phrases: {}, glyphs: {} } as never;
    expect(toRemoteInputs(visibleAvatars(state), words)[0].look).toBe(CODE);

    state = roomSocialReducer(state, {
      type: 'presence',
      entries: readPresence({ [IRIS]: [presence({ look: 'pas-un-look' })] }),
      now: 1,
    });
    expect(visibleAvatars(state)[0].look).toBeNull();
    expect(toRemoteInputs(visibleAvatars(state), words)[0]).toMatchObject({
      avatarId: 'a05',
      look: null,
    });
  });
});

describe('ma présence', () => {
  let open: LibraryRoomConnection[] = [];
  afterEach(async () => {
    for (const c of open) await c.close();
    open = [];
  });

  function connect(look: () => string | null) {
    const bus = createFakeRealtime();
    const enter = fakeEnterResponse('hall');
    let clock = 0;
    const conn = createLibraryRoomConnection({
      client: bus.client,
      enter,
      position: { gx: 2, gy: 2, dir: 4 },
      look,
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
    const mine = () => bus.presenceState(enter.topics.room)[FAKE_SELF_ID]?.[0];
    return { conn, mine, tick: (ms: number) => (clock += ms) };
  }

  it('annonce mon look valide, et le nouveau au renvoi suivant', async () => {
    let look: string | null = CODE;
    const { conn, mine, tick } = connect(() => look);
    await flush();
    expect(mine()).toMatchObject({ avatarId: 'a03', look: CODE });
    look = encodeLibraryLook(LIBRARY_AVATAR_PRESETS.a02);
    tick(5_000);
    conn.updatePosition({ gx: 2, gy: 2, dir: 4 });
    await flush();
    expect(mine()?.look).toBe(look);
  });

  it('un look invalide ou absent ne part pas : avatarId seul', async () => {
    const invalid = connect(() => 'nimporte');
    await flush();
    expect(invalid.mine()).toMatchObject({ avatarId: 'a03' });
    expect(invalid.mine()).not.toHaveProperty('look');
    const none = connect(() => null);
    await flush();
    expect(none.mine()).not.toHaveProperty('look');
  });
});
