// Women's Library, lot 5 — ce qui circule ENTRE NAVIGATEURS sur
// `library:room:<id>` (features/player/library/realtime/payloads.ts), la
// lecture de la présence (`readVerifiedPresence`, presenceVerifier.ts) et les
// cadences d'envoi (throttle.ts).
//   * tout payload reçu est suspect : trop gros, inconnu ou mal formé, il est
//     JETÉ (`null`), sans lever ;
//   * la présence (lot 14a) : sa case et son JETON ; une entrée par clé,
//     cohérente avec son `userId` ET avec le jeton jugé valable — ici un
//     vérificateur simulé (la signature est éprouvée par
//     libraryPresenceVerifier.test.ts) ; pseudo, avatar et look sont CEUX DU
//     JETON ;
//   * une porte de cadence s'ouvre au plus toutes les `minIntervalMs`.

import { describe, expect, it } from 'vitest';
import {
  isOversized,
  LIBRARY_PAYLOAD_MAX_CHARS,
  LIBRARY_PRESENCE_MAX_CHARS,
  LibraryEmotePayload,
  LibraryMovePayload,
  LibraryPhrasePayload,
  LibraryPresencePayload,
  parsePeerPayload,
} from '../../features/player/library/realtime/payloads';
import {
  PRESENCE_MAX_ENTRIES,
  type PresenceVerifier,
  readVerifiedPresence,
} from '../../features/player/library/realtime/presenceVerifier';
import type { LibraryPresenceClaims } from '../../features/player/library/presenceTicket';
import {
  createGate,
  MOVE_MIN_INTERVAL_MS,
  SOCIAL_MIN_INTERVAL_MS,
} from '../../features/player/library/realtime/throttle';

const IRIS = '00000000-0000-4000-8000-000000000011';
const NOVA = '00000000-0000-4000-8000-000000000012';

const presence = {
  userId: IRIS,
  gx: 3,
  gy: 4,
  dir: 2,
  ticket: 'ticket-iris',
};

/** Un jeton « jugé » : ses revendications, telles que l'API les signerait. */
const claimsOf = (
  userId: string,
  over: Partial<LibraryPresenceClaims> = {}
): LibraryPresenceClaims => ({
  v: 1,
  roomId: 'room',
  userId,
  nickname: userId === IRIS ? 'Iris' : 'Nova',
  avatarId: 'a05',
  look: null,
  iat: 1_000,
  exp: 9_000,
  ...over,
});

type Judged = Record<string, LibraryPresenceClaims | null | undefined>;

/** Un vérificateur simulé : un jeton → ses revendications (ou refusé). */
function stubVerifier(judged: Judged): PresenceVerifier {
  return {
    check: (ticket) => (ticket in judged ? judged[ticket] : null),
    idle: async () => undefined,
  };
}

const CLOCK = { now: 2_000_000, skewMs: 0 };
const read = (
  raw: Record<string, Array<Record<string, unknown>>>,
  judged: Judged = { 'ticket-iris': claimsOf(IRIS) }
) => readVerifiedPresence(raw, stubVerifier(judged), CLOCK);

/** Ce que la lecture rend pour la présence d'Iris : l'identité DU JETON. */
const irisEntry = {
  userId: IRIS,
  nickname: 'Iris',
  avatarId: 'a05',
  look: null,
  gx: 3,
  gy: 4,
  dir: 2,
  ticket: 'ticket-iris',
  expiresAt: 9_000_000,
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
    // La présence (jeton compris) a sa propre borne, plus large.
    expect(
      parsePeerPayload(LibraryPresencePayload, big, LIBRARY_PRESENCE_MAX_CHARS)
    ).toEqual(presence);
    const huge = { ...presence, pad: 'x'.repeat(LIBRARY_PRESENCE_MAX_CHARS) };
    expect(
      parsePeerPayload(LibraryPresencePayload, huge, LIBRARY_PRESENCE_MAX_CHARS)
    ).toBeNull();
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
    ['jeton vide', { ...presence, ticket: '' }],
    ['jeton trop long', { ...presence, ticket: 'x'.repeat(1025) }],
    ['jeton non textuel', { ...presence, ticket: 42 }],
    [
      // L'ancienne présence : pseudo et avatar déclarés, aucun jeton.
      'sans jeton',
      { userId: IRIS, nickname: 'Iris', avatarId: 'a05', gx: 1, gy: 1, dir: 0 },
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

describe('readVerifiedPresence — la présence brute d’un canal', () => {
  it('une entrée par clé ; `presence_ref` retiré ; une clé incohérente avec son userId est jetée', () => {
    const out = read({
      [IRIS]: [{ ...presence, presence_ref: 'r1' }],
      // Une cliente annonce le userId d'une autre sous sa propre clé.
      [NOVA]: [{ ...presence, presence_ref: 'r2' }],
    });
    expect(out).toEqual([irisEntry]);
  });

  it('le pseudo, l’avatar et le look viennent du JETON, jamais du payload', () => {
    const out = read(
      {
        [IRIS]: [
          {
            ...presence,
            nickname: 'Usurpée',
            avatarId: 'a01',
            look: '1000000',
          },
        ],
      },
      { 'ticket-iris': claimsOf(IRIS, { avatarId: 'a09', look: '1130641' }) }
    );
    expect(out).toEqual([{ ...irisEntry, avatarId: 'a09', look: '1130641' }]);
  });

  it('jeton refusé, en cours de vérification, d’une autre joueuse ou échu : pas montrée', () => {
    const raw = { [IRIS]: [presence] };
    expect(read(raw, { 'ticket-iris': null })).toEqual([]);
    expect(read(raw, { 'ticket-iris': undefined })).toEqual([]);
    // Le jeton VALIDE de Nova, posé sous la clé d'Iris.
    expect(read(raw, { 'ticket-iris': claimsOf(NOVA) })).toEqual([]);
    // Échu à l'heure du serveur (2 000 s).
    expect(
      read(raw, { 'ticket-iris': claimsOf(IRIS, { exp: 2_000 }) })
    ).toEqual([]);
  });

  it('l’échéance suit l’horloge du serveur (écart estimé)', () => {
    const raw = { [IRIS]: [presence] };
    const verifier = stubVerifier({ 'ticket-iris': claimsOf(IRIS) });
    // Le serveur est en avance de 10 s : l'échéance locale recule d'autant.
    expect(
      readVerifiedPresence(raw, verifier, { now: 2_000_000, skewMs: 10_000 })[0]
        ?.expiresAt
    ).toBe(9_000_000 - 10_000);
    // Le serveur est déjà à 9 000 s : échu.
    expect(
      readVerifiedPresence(raw, verifier, { now: 0, skewMs: 9_000_000 })
    ).toEqual([]);
  });

  it('plusieurs métas : la dernière dont le jeton est VÉRIFIÉ l’emporte', () => {
    const out = read(
      {
        [IRIS]: [
          { ...presence, gx: 1 },
          { ...presence, gx: 2 },
          // Une copie posée par une autre, au jeton forgé : ignorée.
          { ...presence, gx: 6, ticket: 'forged' },
          { ...presence, gx: -5 },
        ],
      },
      { 'ticket-iris': claimsOf(IRIS), forged: null }
    );
    expect(out).toEqual([{ ...irisEntry, gx: 2 }]);
  });

  it('des entrées illisibles ne lèvent pas', () => {
    expect(
      read({
        [IRIS]: 'nope' as unknown as Array<Record<string, unknown>>,
        [NOVA]: [null as unknown as Record<string, unknown>],
      })
    ).toEqual([]);
  });

  it(`au plus ${PRESENCE_MAX_ENTRIES} entrées montrées`, () => {
    const raw: Record<string, Array<Record<string, unknown>>> = {};
    const judged: Judged = {};
    for (let i = 0; i < PRESENCE_MAX_ENTRIES + 20; i += 1) {
      const id = `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
      raw[id] = [{ ...presence, userId: id, ticket: `t${i}` }];
      judged[`t${i}`] = claimsOf(id);
    }
    expect(read(raw, judged)).toHaveLength(PRESENCE_MAX_ENTRIES);
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
