// Women's Library, lot 5 — le réducteur des AUTRES avatars d'une salle
// (features/player/library/realtime/roomState.ts). Pur : aucune horloge,
// aucun réseau. Ce qu'il garantit :
//   * la PRÉSENCE fait foi : un `move`, une emote ou une phrase d'une
//     personne absente de la présence est jeté ;
//   * jamais soi, jamais une personne masquée (blocage) ni écartée (expulsée,
//     bannie) — même si elle continue d'émettre ;
//   * un `move` périmé (`at`) ou trop rapproché (réception) est jeté ;
//   * une case hors de la salle est jetée ;
//   * `tick` efface les bulles échues et oublie les expulsions échues ;
//   * démasquée, une personne réapparaît à la synchronisation suivante.

import { describe, expect, it } from 'vitest';
import {
  initialRoomState,
  isShown,
  MIN_PEER_MOVE_MS,
  type RoomSocialAction,
  type RoomSocialState,
  roomSocialReducer,
  visibleAvatars,
} from '../../features/player/library/realtime/roomState';
import { LIBRARY_BUBBLE_MS } from '../../features/player/library/realtime/social';

const SELF = '00000000-0000-4000-8000-000000000001';
const IRIS = '00000000-0000-4000-8000-000000000011';
const NOVA = '00000000-0000-4000-8000-000000000012';

const base = (hiddenUserIds: string[] = []) =>
  initialRoomState({
    selfId: SELF,
    room: { width: 10, depth: 8 },
    hiddenUserIds,
  });

const entry = (userId: string, gx = 1, gy = 1, nickname = 'Iris') => ({
  userId,
  nickname,
  avatarId: 'a05',
  gx,
  gy,
  dir: 4,
});

const presence = (
  entries: ReturnType<typeof entry>[],
  now = 0
): RoomSocialAction => ({ type: 'presence', entries, now });

const move = (
  userId: string,
  gx: number,
  gy: number,
  at: number,
  now: number
): RoomSocialAction => ({ type: 'move', payload: { userId, gx, gy, at }, now });

const reduce = (state: RoomSocialState, ...actions: RoomSocialAction[]) =>
  actions.reduce(roomSocialReducer, state);

describe('roomState — la présence fait foi', () => {
  it('un move, une emote, une phrase d’une absente sont jetés (même objet rendu)', () => {
    const s = base();
    expect(roomSocialReducer(s, move(IRIS, 2, 2, 1, 0))).toBe(s);
    expect(
      roomSocialReducer(s, {
        type: 'emote',
        payload: { userId: IRIS, emote: 'wave' },
        now: 0,
      })
    ).toBe(s);
    expect(
      roomSocialReducer(s, {
        type: 'phrase',
        payload: { userId: IRIS, phraseId: 'gg' },
        now: 0,
      })
    ).toBe(s);
    expect(visibleAvatars(s)).toEqual([]);
  });

  it('présente, son move donne une case visée ; la case connue reste celle de la présence', () => {
    const s = reduce(base(), presence([entry(IRIS)]), move(IRIS, 4, 5, 10, 0));
    expect(s.avatars[IRIS]).toMatchObject({
      gx: 1,
      gy: 1,
      target: { gx: 4, gy: 5, receivedAt: 0 },
    });
  });

  it('une synchronisation retire celles qui sont parties et garde ce que les broadcasts ont appris', () => {
    const s = reduce(
      base(),
      presence([entry(IRIS), entry(NOVA, 2, 2, 'Nova')]),
      move(IRIS, 4, 5, 10, 0),
      { type: 'emote', payload: { userId: IRIS, emote: 'heart' }, now: 0 },
      presence([entry(IRIS, 4, 5)], 50)
    );
    expect(Object.keys(s.avatars)).toEqual([IRIS]);
    expect(s.avatars[IRIS]).toMatchObject({
      gx: 4,
      gy: 5,
      target: { gx: 4, gy: 5 },
      emote: { id: 'heart' },
    });
  });

  it('jamais soi, même annoncée dans la présence', () => {
    const s = reduce(base(), presence([entry(SELF), entry(IRIS)]));
    expect(Object.keys(s.avatars)).toEqual([IRIS]);
    expect(roomSocialReducer(s, { type: 'hide', userId: SELF })).toBe(s);
    expect(
      roomSocialReducer(s, { type: 'revoke', userId: SELF, until: null })
    ).toBe(s);
  });

  it('visibleAvatars : un ordre stable (par userId)', () => {
    const s = reduce(
      base(),
      presence([entry(NOVA, 2, 2, 'Nova'), entry(IRIS)])
    );
    expect(visibleAvatars(s).map((a) => a.userId)).toEqual([IRIS, NOVA]);
  });
});

describe('roomState — masquées et écartées', () => {
  it('une personne masquée à l’entrée (blocage) n’apparaît pas, même si elle émet', () => {
    const s = reduce(
      base([IRIS]),
      presence([entry(IRIS)]),
      move(IRIS, 3, 3, 1, 0),
      { type: 'emote', payload: { userId: IRIS, emote: 'wave' }, now: 0 }
    );
    expect(s.avatars).toEqual({});
    expect(isShown(s, IRIS, 0)).toBe(false);
  });

  it('`hide` la retire tout de suite ; elle ne revient pas tant qu’elle reste masquée', () => {
    let s = reduce(base(), presence([entry(IRIS)]));
    s = roomSocialReducer(s, { type: 'hide', userId: IRIS });
    expect(s.avatars).toEqual({});
    expect(s.hidden).toEqual([IRIS]);
    s = reduce(s, presence([entry(IRIS)], 10), move(IRIS, 5, 5, 99, 500));
    expect(s.avatars).toEqual({});
  });

  it('démasquée, elle réapparaît à la synchronisation de présence SUIVANTE', () => {
    let s = reduce(base(), presence([entry(IRIS)]), {
      type: 'hide',
      userId: IRIS,
    });
    s = roomSocialReducer(s, { type: 'unhide', userId: IRIS });
    expect(s.hidden).toEqual([]);
    expect(s.avatars).toEqual({});
    s = roomSocialReducer(s, presence([entry(IRIS)], 20));
    expect(Object.keys(s.avatars)).toEqual([IRIS]);
  });

  it('`unhide` d’une personne non masquée ne change rien', () => {
    const s = base();
    expect(roomSocialReducer(s, { type: 'unhide', userId: IRIS })).toBe(s);
  });

  it('écartée sans fin (bannie) : retirée, et elle le reste malgré ses présences et ses moves', () => {
    let s = reduce(base(), presence([entry(IRIS)]), {
      type: 'revoke',
      userId: IRIS,
      until: null,
    });
    expect(s.avatars).toEqual({});
    s = reduce(
      s,
      presence([entry(IRIS)], 1_000_000),
      move(IRIS, 2, 2, 5, 1_000_000),
      { type: 'tick', now: 9_999_999 },
      presence([entry(IRIS)], 9_999_999)
    );
    expect(s.avatars).toEqual({});
  });

  it('écartée jusqu’à une date : `tick` l’oublie à l’échéance, puis la présence la remontre', () => {
    let s = reduce(base(), presence([entry(IRIS)]), {
      type: 'revoke',
      userId: IRIS,
      until: 5_000,
    });
    s = roomSocialReducer(s, presence([entry(IRIS)], 4_000));
    expect(s.avatars).toEqual({});
    s = roomSocialReducer(s, { type: 'tick', now: 5_000 });
    expect(s.revoked).toEqual({});
    s = roomSocialReducer(s, presence([entry(IRIS)], 5_001));
    expect(Object.keys(s.avatars)).toEqual([IRIS]);
  });
});

describe('roomState — moves périmés, trop rapprochés, hors salle', () => {
  it('un `at` plus ancien (ou égal) que le dernier accepté est jeté', () => {
    let s = reduce(base(), presence([entry(IRIS)]), move(IRIS, 2, 2, 100, 0));
    const stale = roomSocialReducer(s, move(IRIS, 3, 3, 90, 500));
    expect(stale).toBe(s);
    expect(roomSocialReducer(s, move(IRIS, 3, 3, 100, 500))).toBe(s);
    s = roomSocialReducer(s, move(IRIS, 3, 3, 101, 500));
    expect(s.avatars[IRIS].target).toMatchObject({ gx: 3, gy: 3 });
  });

  it(`deux moves reçus à moins de ${MIN_PEER_MOVE_MS} ms : le second est jeté`, () => {
    let s = reduce(base(), presence([entry(IRIS)]), move(IRIS, 2, 2, 1, 1_000));
    const flood = roomSocialReducer(
      s,
      move(IRIS, 3, 3, 2, 1_000 + MIN_PEER_MOVE_MS - 1)
    );
    expect(flood).toBe(s);
    s = roomSocialReducer(s, move(IRIS, 3, 3, 2, 1_000 + MIN_PEER_MOVE_MS));
    expect(s.avatars[IRIS].target).toMatchObject({ gx: 3, gy: 3 });
  });

  it('une case hors de la salle est jetée (présence comme move)', () => {
    const s = reduce(
      base(),
      presence([entry(IRIS, 10, 0), entry(NOVA, 0, 8, 'Nova')])
    );
    expect(s.avatars).toEqual({});
    const t = reduce(base(), presence([entry(IRIS)]));
    expect(roomSocialReducer(t, move(IRIS, 10, 0, 1, 0))).toBe(t);
    expect(roomSocialReducer(t, move(IRIS, 0, 8, 1, 0))).toBe(t);
    const inside = roomSocialReducer(t, move(IRIS, 9, 7, 1, 0));
    expect(inside.avatars[IRIS].target).toMatchObject({ gx: 9, gy: 7 });
  });
});

describe('roomState — tick et reset', () => {
  it('les bulles s’effacent à LIBRARY_BUBBLE_MS, pas avant', () => {
    let s = reduce(
      base(),
      presence([entry(IRIS)]),
      { type: 'emote', payload: { userId: IRIS, emote: 'wave' }, now: 0 },
      {
        type: 'phrase',
        payload: { userId: IRIS, phraseId: 'hello' },
        now: 1_000,
      }
    );
    const early = roomSocialReducer(s, {
      type: 'tick',
      now: LIBRARY_BUBBLE_MS - 1,
    });
    expect(early).toBe(s);
    s = roomSocialReducer(s, { type: 'tick', now: LIBRARY_BUBBLE_MS });
    expect(s.avatars[IRIS].emote).toBeNull();
    expect(s.avatars[IRIS].phrase).toMatchObject({ id: 'hello' });
    s = roomSocialReducer(s, { type: 'tick', now: 1_000 + LIBRARY_BUBBLE_MS });
    expect(s.avatars[IRIS].phrase).toBeNull();
  });

  it('un tick sans rien d’échu rend le même objet (pas de rendu inutile)', () => {
    const s = reduce(base(), presence([entry(IRIS)]));
    expect(roomSocialReducer(s, { type: 'tick', now: 123 })).toBe(s);
  });

  it('`reset` vide les avatars et l’ordre des moves, garde les masquées', () => {
    const s = reduce(
      base([NOVA]),
      presence([entry(IRIS)]),
      move(IRIS, 2, 2, 1, 0),
      { type: 'reset' }
    );
    expect(s.avatars).toEqual({});
    expect(s.lastMoveAt).toEqual({});
    expect(s.hidden).toEqual([NOVA]);
  });
});
