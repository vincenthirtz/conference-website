// Women's Library, lot 15 — la posture (assise, allongée, en train de se
// servir d'un meuble) entre navigateurs, cosmétique comme les déplacements :
//   * les PAYLOADS : `seat { item, spot }` / `use { item }` facultatifs dans la
//     présence et dans `move` ; un ancien payload reste valide ; un identifiant
//     de meuble hors gabarit, une place hors bornes, les deux à la fois ou un
//     payload trop gros sont JETÉS ; une cliente qui ne les connaît pas les
//     retire (zod) et voit l'avatar debout ;
//   * le RÉDUCTEUR les garde (présence : la posture ; `move` : ce qu'elle
//     fera en arrivant) ;
//   * le MODÈLE de l'écran les traduit pour le moteur, et dans l'autre sens.

import { describe, expect, it } from 'vitest';
import * as z from 'zod';
import {
  LIBRARY_PAYLOAD_MAX_CHARS,
  LIBRARY_PRESENCE_MAX_CHARS,
  LibraryMovePayload,
  LibraryPresencePayload,
  parsePeerPayload,
} from '../../features/player/library/realtime/payloads';
import {
  initialRoomState,
  roomSocialReducer,
} from '../../features/player/library/realtime/roomState';
import {
  restIntentOf,
  restWireOf,
  toRemoteInputs,
} from '../../features/player/library/roomStageModel';

const IRIS = '00000000-0000-4000-8000-000000000011';
const TICKET = 'x'.repeat(360);

const presence = (extra: Record<string, unknown> = {}) => ({
  userId: IRIS,
  gx: 2,
  gy: 4,
  dir: 5,
  ticket: TICKET,
  ...extra,
});
const move = (extra: Record<string, unknown> = {}) => ({
  userId: IRIS,
  gx: 2,
  gy: 4,
  at: 1_000,
  ...extra,
});
const readPresence = (p: unknown) =>
  parsePeerPayload(LibraryPresencePayload, p, LIBRARY_PRESENCE_MAX_CHARS);
const readMove = (p: unknown) => parsePeerPayload(LibraryMovePayload, p);

describe('payloads — seat / use', () => {
  it('les anciens payloads restent valides (sans posture)', () => {
    expect(readPresence(presence())).toEqual(presence());
    expect(readMove(move())).toEqual(move());
  });

  it('une place ou un usage passent, dans la présence et dans `move`', () => {
    const seat = { seat: { item: 'inv-02', spot: 1 } };
    const use = { use: { item: 'b1a2c3d4-0000-4000-8000-00000000abcd' } };
    expect(readPresence(presence(seat))).toEqual(presence(seat));
    expect(readPresence(presence(use))).toEqual(presence(use));
    expect(readMove(move(seat))).toEqual(move(seat));
    expect(readMove(move(use))).toEqual(move(use));
  });

  it('mal formés, hors bornes, les deux à la fois : jetés', () => {
    const bad = [
      { seat: { item: '', spot: 0 } },
      { seat: { item: 'a b', spot: 0 } },
      { seat: { item: '<script>', spot: 0 } },
      { seat: { item: 'x'.repeat(65), spot: 0 } },
      { seat: { item: 'sofa', spot: -1 } },
      { seat: { item: 'sofa', spot: 16 } },
      { seat: { item: 'sofa', spot: 1.5 } },
      { seat: { item: 'sofa' } },
      { seat: 'sofa' },
      { use: { item: 42 } },
      { seat: { item: 'sofa', spot: 0 }, use: { item: 'sofa' } },
    ];
    for (const extra of bad) {
      expect(readPresence(presence(extra))).toBeNull();
      expect(readMove(move(extra))).toBeNull();
    }
    // 64 caractères : la borne passe.
    expect(
      readMove(move({ seat: { item: 'x'.repeat(64), spot: 15 } }))
    ).not.toBeNull();
  });

  it('un champ en trop dans la posture est retiré ; un payload trop gros n’est pas lu', () => {
    expect(
      readMove(move({ seat: { item: 'sofa', spot: 0, admin: true } }))
    ).toEqual(move({ seat: { item: 'sofa', spot: 0 } }));
    const huge = move({
      seat: { item: 'sofa', spot: 0 },
      pad: 'p'.repeat(600),
    });
    expect(JSON.stringify(huge).length).toBeGreaterThan(
      LIBRARY_PAYLOAD_MAX_CHARS
    );
    expect(readMove(huge)).toBeNull();
  });

  it('une cliente d’avant le lot 15 retire la posture et garde la case (debout à côté)', () => {
    const OldMove = z.object({
      userId: z.string(),
      gx: z.number(),
      gy: z.number(),
      at: z.number(),
    });
    expect(OldMove.parse(move({ seat: { item: 'sofa', spot: 0 } }))).toEqual(
      move()
    );
  });
});

describe('roomState — la posture des autres', () => {
  const state = initialRoomState({
    selfId: '00000000-0000-4000-8000-000000000001',
    room: { width: 10, depth: 8 },
  });
  const entry = (extra: Record<string, unknown> = {}) => ({
    userId: IRIS,
    nickname: 'Iris',
    avatarId: 'a05',
    look: null,
    gx: 2,
    gy: 4,
    dir: 5,
    ticket: TICKET,
    expiresAt: 1e9,
    ...extra,
  });

  it('la présence porte la posture ; sans elle, aucune clé (forme d’avant)', () => {
    const seated = roomSocialReducer(state, {
      type: 'presence',
      entries: [entry({ seat: { item: 'sofa', spot: 1 } })],
      now: 0,
    });
    expect(seated.avatars[IRIS].seat).toEqual({ item: 'sofa', spot: 1 });
    expect(seated.avatars[IRIS].use).toBeUndefined();
    const standing = roomSocialReducer(seated, {
      type: 'presence',
      entries: [entry()],
      now: 0,
    });
    expect('seat' in standing.avatars[IRIS]).toBe(false);
  });

  it('un `move` garde ce qu’elle fera en arrivant', () => {
    const s = roomSocialReducer(
      roomSocialReducer(state, {
        type: 'presence',
        entries: [entry()],
        now: 0,
      }),
      {
        type: 'move',
        payload: { userId: IRIS, gx: 5, gy: 5, at: 10, use: { item: 'shelf' } },
        now: 500,
      }
    );
    expect(s.avatars[IRIS].target).toEqual({
      gx: 5,
      gy: 5,
      receivedAt: 500,
      use: { item: 'shelf' },
    });
  });
});

describe('roomStageModel — réseau ↔ moteur', () => {
  it('restIntentOf / restWireOf, aller-retour', () => {
    expect(restIntentOf({})).toBeNull();
    expect(restIntentOf({ seat: { item: 'sofa', spot: 1 } })).toEqual({
      kind: 'seat',
      itemId: 'sofa',
      spot: 1,
    });
    expect(restIntentOf({ use: { item: 'shelf' } })).toEqual({
      kind: 'use',
      itemId: 'shelf',
    });
    expect(restWireOf(null)).toEqual({});
    expect(restWireOf(undefined)).toEqual({});
    expect(
      restWireOf({ kind: 'seat', itemId: 'sofa', spot: 1, pose: 'lie' })
    ).toEqual({ seat: { item: 'sofa', spot: 1 } });
    expect(restWireOf({ kind: 'use', itemId: 'shelf' })).toEqual({
      use: { item: 'shelf' },
    });
  });

  it('toRemoteInputs : la posture de la présence et celle de la case visée', () => {
    const words = {
      emotes: {} as never,
      phrases: {} as never,
      glyphs: {} as never,
    };
    const [input] = toRemoteInputs(
      [
        {
          userId: IRIS,
          nickname: 'Iris',
          avatarId: 'a05',
          look: null,
          ticket: TICKET,
          expiresAt: 1e9,
          gx: 2,
          gy: 4,
          dir: 5,
          seat: { item: 'sofa', spot: 0 },
          target: { gx: 6, gy: 1, receivedAt: 9, use: { item: 'shelf' } },
          emote: null,
          phrase: null,
        },
      ],
      words
    );
    expect(input.rest).toEqual({ kind: 'seat', itemId: 'sofa', spot: 0 });
    expect(input.target).toEqual({
      tile: { i: 6, j: 1 },
      receivedAt: 9,
      rest: { kind: 'use', itemId: 'shelf' },
    });
    // Debout, sans case visée : aucune clé `rest` (forme d'avant).
    const [plain] = toRemoteInputs(
      [
        {
          userId: IRIS,
          nickname: 'Iris',
          avatarId: 'a05',
          look: null,
          ticket: TICKET,
          expiresAt: 1e9,
          gx: 2,
          gy: 4,
          dir: 5,
          target: null,
          emote: null,
          phrase: null,
        },
      ],
      words
    );
    expect('rest' in plain).toBe(false);
  });
});
