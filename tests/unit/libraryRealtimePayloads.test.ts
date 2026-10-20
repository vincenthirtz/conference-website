// Women's Library, lot 5 — ce qui circule ENTRE NAVIGATEURS sur
// `library:room:<id>` (features/player/library/realtime/payloads.ts), la
// lecture de la présence (`readPresence`, connection.ts) et les cadences
// d'envoi (throttle.ts).
//   * tout payload reçu est suspect : trop gros, inconnu ou mal formé, il est
//     JETÉ (`null`), sans lever ;
//   * la présence : une entrée par clé, cohérente avec son `userId` ;
//   * une porte de cadence s'ouvre au plus toutes les `minIntervalMs`.

import { describe, expect, it } from 'vitest';
import {
  isOversized,
  LIBRARY_PAYLOAD_MAX_CHARS,
  LibraryEmotePayload,
  LibraryMovePayload,
  LibraryPhrasePayload,
  LibraryPresencePayload,
  parsePeerPayload,
} from '../../features/player/library/realtime/payloads';
import {
  PRESENCE_MAX_ENTRIES,
  readPresence,
} from '../../features/player/library/realtime/connection';
import {
  createGate,
  MOVE_MIN_INTERVAL_MS,
  SOCIAL_MIN_INTERVAL_MS,
} from '../../features/player/library/realtime/throttle';

const IRIS = '00000000-0000-4000-8000-000000000011';
const NOVA = '00000000-0000-4000-8000-000000000012';

const presence = {
  userId: IRIS,
  nickname: 'Iris',
  avatarId: 'a05',
  gx: 3,
  gy: 4,
  dir: 2,
};

describe('payloads — les payloads valides passent', () => {
  it('présence, move, emote, phrase', () => {
    expect(parsePeerPayload(LibraryPresencePayload, presence)).toEqual(
      presence
    );
    expect(
      parsePeerPayload(LibraryMovePayload, {
        userId: IRIS,
        gx: 0,
        gy: 0,
        at: 1,
      })
    ).toEqual({ userId: IRIS, gx: 0, gy: 0, at: 1 });
    expect(
      parsePeerPayload(LibraryEmotePayload, { userId: IRIS, emote: 'wave' })
    ).toEqual({ userId: IRIS, emote: 'wave' });
    expect(
      parsePeerPayload(LibraryPhrasePayload, { userId: IRIS, phraseId: 'gg' })
    ).toEqual({ userId: IRIS, phraseId: 'gg' });
  });

  it('un champ en trop (sous le plafond) est retiré, pas transmis', () => {
    expect(
      parsePeerPayload(LibraryPresencePayload, { ...presence, admin: true })
    ).toEqual(presence);
  });
});

describe('payloads — trop gros, inconnus, mal formés : jetés', () => {
  it('au-delà de LIBRARY_PAYLOAD_MAX_CHARS, le payload n’est même pas validé', () => {
    const big = { ...presence, pad: 'x'.repeat(LIBRARY_PAYLOAD_MAX_CHARS) };
    expect(isOversized(big)).toBe(true);
    expect(parsePeerPayload(LibraryPresencePayload, big)).toBeNull();
    expect(isOversized(presence)).toBe(false);
  });

  it('pas du JSON (cycle, BigInt, undefined) : jeté sans lever', () => {
    const cyclic: Record<string, unknown> = { ...presence };
    cyclic.self = cyclic;
    expect(parsePeerPayload(LibraryPresencePayload, cyclic)).toBeNull();
    expect(
      parsePeerPayload(LibraryMovePayload, {
        userId: IRIS,
        gx: 1,
        gy: 1,
        at: 1n,
      })
    ).toBeNull();
    expect(parsePeerPayload(LibraryMovePayload, undefined)).toBeNull();
  });

  it('une emote ou une phrase inconnue est jetée', () => {
    expect(
      parsePeerPayload(LibraryEmotePayload, { userId: IRIS, emote: 'kiss' })
    ).toBeNull();
    expect(
      parsePeerPayload(LibraryPhrasePayload, {
        userId: IRIS,
        phraseId: 'Rejoins mon Discord',
      })
    ).toBeNull();
    // Un texte libre à la place d'un identifiant : jamais affiché.
    expect(
      parsePeerPayload(LibraryEmotePayload, { userId: IRIS, emote: 42 })
    ).toBeNull();
  });

  it.each([
    ['userId non UUID', { ...presence, userId: 'iris' }],
    ['case négative', { ...presence, gx: -1 }],
    ['case non entière', { ...presence, gy: 1.5 }],
    ['case hors borne', { ...presence, gx: 401 }],
    ['direction 8', { ...presence, dir: 8 }],
    ['pseudo vide', { ...presence, nickname: '' }],
    ['pseudo trop long', { ...presence, nickname: 'x'.repeat(21) }],
    ['avatar hors gabarit', { ...presence, avatarId: 'A05<script>' }],
    [
      'champ manquant',
      { userId: IRIS, nickname: 'Iris', gx: 1, gy: 1, dir: 0 },
    ],
    ['null', null],
    ['chaîne', 'move'],
    ['tableau', [presence]],
  ])('présence : %s', (_label, payload) => {
    expect(parsePeerPayload(LibraryPresencePayload, payload)).toBeNull();
  });

  it('move : `at` négatif ou non entier, case en texte', () => {
    for (const bad of [
      { userId: IRIS, gx: 1, gy: 1, at: -1 },
      { userId: IRIS, gx: 1, gy: 1, at: 1.5 },
      { userId: IRIS, gx: '1', gy: 1, at: 1 },
    ]) {
      expect(parsePeerPayload(LibraryMovePayload, bad)).toBeNull();
    }
  });
});

describe('readPresence — la présence brute d’un canal', () => {
  it('une entrée par clé ; `presence_ref` retiré ; une clé incohérente avec son userId est jetée', () => {
    const out = readPresence({
      [IRIS]: [{ ...presence, presence_ref: 'r1' }],
      // Une cliente annonce le userId d'une autre sous sa propre clé.
      [NOVA]: [{ ...presence, presence_ref: 'r2' }],
    });
    expect(out).toEqual([presence]);
  });

  it('plusieurs onglets : la dernière entrée VALABLE l’emporte', () => {
    const out = readPresence({
      [IRIS]: [
        { ...presence, gx: 1 },
        { ...presence, gx: 2 },
        { ...presence, gx: -5 },
      ],
    });
    expect(out).toEqual([{ ...presence, gx: 2 }]);
  });

  it('des entrées illisibles ne lèvent pas', () => {
    expect(
      readPresence({
        [IRIS]: 'nope' as unknown as Array<Record<string, unknown>>,
        [NOVA]: [null as unknown as Record<string, unknown>],
      })
    ).toEqual([]);
  });

  it(`au plus ${PRESENCE_MAX_ENTRIES} entrées lues`, () => {
    const raw: Record<string, Array<Record<string, unknown>>> = {};
    for (let i = 0; i < PRESENCE_MAX_ENTRIES + 20; i += 1) {
      const id = `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
      raw[id] = [{ ...presence, userId: id }];
    }
    expect(readPresence(raw)).toHaveLength(PRESENCE_MAX_ENTRIES);
  });
});

describe('throttle — createGate', () => {
  it('le premier passage passe, puis la porte se referme pour l’intervalle', () => {
    const gate = createGate(MOVE_MIN_INTERVAL_MS);
    expect(gate.waitFor(0)).toBe(0);
    expect(gate.tryPass(0)).toBe(true);
    expect(gate.tryPass(MOVE_MIN_INTERVAL_MS - 1)).toBe(false);
    expect(gate.waitFor(100)).toBe(MOVE_MIN_INTERVAL_MS - 100);
    expect(gate.tryPass(MOVE_MIN_INTERVAL_MS)).toBe(true);
    expect(gate.waitFor(MOVE_MIN_INTERVAL_MS)).toBe(MOVE_MIN_INTERVAL_MS);
  });

  it('un refus ne repousse pas la porte (pas d’inondation qui bloque tout)', () => {
    const gate = createGate(SOCIAL_MIN_INTERVAL_MS);
    expect(gate.tryPass(0)).toBe(true);
    expect(gate.tryPass(500)).toBe(false);
    expect(gate.tryPass(999)).toBe(false);
    expect(gate.tryPass(SOCIAL_MIN_INTERVAL_MS)).toBe(true);
  });

  it('reset rouvre la porte', () => {
    const gate = createGate(SOCIAL_MIN_INTERVAL_MS);
    gate.tryPass(0);
    gate.reset();
    expect(gate.tryPass(1)).toBe(true);
  });
});
