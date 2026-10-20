// Women's Library, lot 5 phase B — les fonctions pures de l'écran d'une salle
// (features/player/library/roomStageModel.ts) :
//   * `?room=` de /player/library : un UUID, sinon l'appartement ;
//   * le lien à partager ;
//   * le menu d'un avatar gardé dans le cadre ;
//   * l'état temps réel → les autres joueuses du moteur (bulle la plus
//     récente, textes traduits, direction bornée) ;
//   * ma case de départ, hors des meubles.

import { describe, expect, it } from 'vitest';
import {
  AVATAR_MENU_SIZE,
  bubbleContentOf,
  clampMenuAnchor,
  parseRoomParam,
  remoteBubbleOf,
  roomShareUrl,
  roomStartPosition,
  type SignWords,
  toRemoteInputs,
} from '../../features/player/library/roomStageModel';
import type { RemoteAvatar } from '../../features/player/library/realtime/roomState';
import nsSocial from '../../lib/i18n/locales/fr/playerLibrarySocial';
import { LIBRARY_EMOTE_GLYPHS } from '../../features/player/library/ui/social/emoteGlyphs';

const ROOM_ID = '7f1c2a9e-4b3d-4e8f-9a01-23456789abcd';
const IRIS = '00000000-0000-4000-8000-000000000011';
const WORDS: SignWords = {
  emotes: nsSocial.fr.emotes,
  phrases: nsSocial.fr.phrases,
  glyphs: LIBRARY_EMOTE_GLYPHS,
};

describe('parseRoomParam — /player/library?room=', () => {
  it('un UUID (en minuscules) ouvre la salle', () => {
    expect(parseRoomParam(ROOM_ID)).toBe(ROOM_ID);
    expect(parseRoomParam(` ${ROOM_ID.toUpperCase()} `)).toBe(ROOM_ID);
  });

  it('rien, plusieurs valeurs ou autre chose : l’appartement', () => {
    for (const v of [
      undefined,
      '',
      'dev-room',
      `${ROOM_ID}x`,
      '../admin',
      `${ROOM_ID}&as=1`,
      [ROOM_ID, ROOM_ID],
      42,
    ])
      expect(parseRoomParam(v)).toBeNull();
  });
});

describe('roomShareUrl', () => {
  it('pointe vers /player/library?room=<id>', () => {
    expect(roomShareUrl('https://owwomenscup.fr/', ROOM_ID)).toBe(
      `https://owwomenscup.fr/player/library?room=${ROOM_ID}`
    );
  });
});

describe('clampMenuAnchor — le menu reste dans le cadre', () => {
  const frame = { width: 900, height: 560 };

  it('à droite de la tête quand il y a la place', () => {
    expect(clampMenuAnchor({ x: 200, y: 120 }, frame)).toEqual({
      x: 212,
      y: 120,
    });
  });

  it('rabattu à gauche au bord droit, remonté au bord bas', () => {
    const a = clampMenuAnchor({ x: 850, y: 540 }, frame);
    expect(a.x + AVATAR_MENU_SIZE.width).toBeLessThanOrEqual(frame.width - 8);
    expect(a.x).toBe(850 - 12 - AVATAR_MENU_SIZE.width);
    expect(a.y).toBe(frame.height - 8 - AVATAR_MENU_SIZE.height);
  });

  it('une tête hors du cadre (vue déplacée) ou un cadre minuscule : collé à la marge', () => {
    expect(clampMenuAnchor({ x: -400, y: -50 }, frame)).toEqual({ x: 8, y: 8 });
    expect(clampMenuAnchor({ x: 50, y: 50 }, { width: 0, height: 0 })).toEqual({
      x: 8,
      y: 8,
    });
  });
});

describe('l’état temps réel → le moteur', () => {
  const iris: RemoteAvatar = {
    userId: IRIS,
    nickname: 'Iris',
    avatarId: 'a05',
    look: null,
    ticket: 'ticket-iris',
    expiresAt: 9_999_999,
    gx: 3,
    gy: 4,
    dir: 9,
    target: { gx: 6, gy: 7, receivedAt: 1500 },
    emote: { id: 'wave', receivedAt: 1000 },
    phrase: { id: 'gg', receivedAt: 2000 },
  };

  it('case de présence, case visée datée, direction bornée', () => {
    const [r] = toRemoteInputs([iris], WORDS);
    expect(r).toMatchObject({
      id: IRIS,
      nickname: 'Iris',
      avatarId: 'a05',
      tile: { i: 3, j: 4 },
      dir: 7,
      target: { tile: { i: 6, j: 7 }, receivedAt: 1500 },
    });
  });

  it('la bulle montre le signe le PLUS RÉCENT, traduit', () => {
    expect(remoteBubbleOf(iris, WORDS)).toEqual({
      key: `${IRIS}:phrase:2000`,
      glyph: null,
      text: nsSocial.fr.phrases.gg,
      shownAt: 2000,
    });
    expect(remoteBubbleOf({ ...iris, phrase: null }, WORDS)).toMatchObject({
      glyph: LIBRARY_EMOTE_GLYPHS.wave,
      text: nsSocial.fr.emotes.wave,
      shownAt: 1000,
    });
    expect(
      remoteBubbleOf({ ...iris, emote: null, phrase: null }, WORDS)
    ).toBeNull();
  });

  it('ma bulle : pictogramme + mot pour une emote, mot seul pour une phrase', () => {
    expect(
      bubbleContentOf({ type: 'emote', id: 'heart' }, WORDS, 'me:1')
    ).toEqual({
      key: 'me:1',
      glyph: LIBRARY_EMOTE_GLYPHS.heart,
      text: nsSocial.fr.emotes.heart,
    });
    expect(
      bubbleContentOf({ type: 'phrase', id: 'hello' }, WORDS, 'me:2')
    ).toEqual({
      key: 'me:2',
      glyph: null,
      text: nsSocial.fr.phrases.hello,
    });
  });
});

describe('roomStartPosition', () => {
  it('la case libre la plus proche du centre, face à la caméra', () => {
    const specs = new Map([
      ['table', { footprint: { w: 2, d: 2 }, layer: 'object' as const }],
    ]);
    const room = {
      room: {
        width: 14,
        depth: 12,
        decor: { floor: 'parquet' as const, wall: 'plain' as const },
      },
      items: [{ inventoryId: 't', key: 'table', gx: 6, gy: 5, rotation: 0 }],
    };
    const p = roomStartPosition(room, specs);
    expect(p.dir).toBe(4);
    // Le centre (7, 6) est sous la table : une case voisine, libre.
    expect([p.gx, p.gy]).not.toEqual([7, 6]);
    expect(Math.abs(p.gx - 7) + Math.abs(p.gy - 6)).toBeLessThanOrEqual(2);
    expect(roomStartPosition({ ...room, items: [] }, specs)).toEqual({
      gx: 7,
      gy: 6,
      dir: 4,
    });
  });
});
