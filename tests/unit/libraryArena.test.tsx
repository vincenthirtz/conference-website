// @vitest-environment happy-dom
//
// L'arène de la Women's Library (lot 12 de docs/PLAN-tcg-2.md) — CÔTÉ ÉCRAN,
// contre des réponses FIGÉES de l'API (les routes sont testées dans
// conference-api, libraryArenaApi.test.ts ; les valeurs partagées sont gelées
// par le même littéral des deux côtés : la carte signature des Remparts,
// 2000 / 3000, la semaine `2026-W43`, les récompenses `granted` /
// `week_already`, les codes `not_owned`, `stale_state`…) :
//   * le modèle pur : faces (une joueuse retirée reste anonyme), deck
//     (exemplaires libres, meilleurs d'abord, cartes écartées), gestes
//     proposés, récit de chaque événement, semaine ;
//   * `?place=arena`, la porte du hall et la navigation des lieux ;
//   * la porte de la Library d'abord ; le salon (paquet de la semaine « à
//     gagner » / « déjà gagné », défis désactivés sans deck complet,
//     historique privé) ; le deck (ajouter, retirer, enregistrer, refus
//     `not_owned`) ; un duel joué au clavier (invoquer, finir son tour, le
//     journal `role="log"`), la fin et sa récompense.

import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

const push = vi.hoisted(() => vi.fn(async () => true));
vi.mock('next/router', () => ({
  default: { asPath: '/player/library?place=arena', push },
  useRouter: () => ({
    asPath: '/player/library?place=arena',
    query: { place: 'arena' },
    isReady: true,
    push,
  }),
}));
vi.mock('@/utils/supabaseBrowser', () => ({
  supabaseClient: {
    auth: {
      getSession: async () => ({ data: { session: { access_token: 't' } } }),
    },
  },
}));

import type { ArenaClient } from '../../features/player/library/arena/client';
import { ArenaClientProvider } from '../../features/player/library/arena/clientContext';
import type {
  ArenaCollectionEntry,
  ArenaDeckResponse,
  ArenaDuelResponse,
  ArenaLobbyResponse,
} from '../../features/player/library/arena/responses';
import type {
  ArenaBoardView,
  ArenaCard,
  ArenaEvent,
  ArenaStep,
} from '../../features/player/library/arena/rules';
import {
  addToDeck,
  availableCopies,
  capitalizeLead,
  type EventWords,
  faceName,
  faceSubject,
  filterCollection,
  narrate,
  nextCopy,
  optionsFor,
  previewDeck,
  removeFromDeck,
  weekText,
} from '../../features/player/library/arena/viewModel';
import {
  type LibraryClient,
  LibraryClientProvider,
} from '../../features/player/library/clientContext';
import { HALL_DOOR_LIST } from '../../features/player/library/ui/hall/HallDoors';
import {
  libraryViewOf,
  placeHref,
} from '../../features/player/library/roomStageModel';
import { roomHotspotsOf } from '../../features/player/library/ui/places/useRoomHotspots';
import PlaceScreen from '../../features/player/library/ui/places/PlaceScreen';
import nsArena from '../../lib/i18n/locales/fr/playerLibraryArena';
import { format } from '../../lib/i18n/useT';
import { PlayerHttpError } from '../../utils/player/playerHttp';
import { formatSiteDate } from '../../utils/timezone';
import { renderPlayer } from './__helpers__/playerHarness';

const t = nsArena.fr;

// Animation réduite : les étapes s'affichent sans délai (même règle que pour
// une joueuse qui la demande au système).
beforeAll(() => {
  window.matchMedia = ((query: string) => ({
    matches: query.includes('prefers-reduced-motion'),
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
});

afterEach(() => {
  cleanup();
  push.mockClear();
});

/* --------------------------------------------------------------- fixtures -- */

/** La carte signature des Remparts — même littéral que libraryArenaApi.test.ts. */
const REINHARDT = {
  key: 'hero:reinhardt',
  rarity: 'legendary',
  foil: false,
  level: 8,
  attack: 2000,
  defense: 3000,
  profile: 'bulwark',
} as const;

const RULES = {
  rulesVersion: 1,
  deckSize: 20,
  minDeckAtStart: 10,
  handSize: 5,
  startingLp: 4000,
  zones: 3,
  turnLimit: 30,
};

function lobby(over: Partial<ArenaLobbyResponse> = {}): ArenaLobbyResponse {
  return {
    opponents: [
      {
        id: 'remparts',
        profile: 'bulwark',
        signature: REINHARDT,
        cardCount: 20,
      },
      {
        id: 'assaut',
        profile: 'assault',
        signature: {
          ...REINHARDT,
          key: 'hero:tracer',
          attack: 3000,
          defense: 2000,
          profile: 'assault',
        },
        cardCount: 20,
      },
      {
        id: 'harmonie',
        profile: 'balanced',
        signature: {
          ...REINHARDT,
          key: 'hero:mercy',
          attack: 2500,
          defense: 2500,
          profile: 'balanced',
        },
        cardCount: 20,
      },
    ],
    weekly: { week: '2026-W43', claimed: false },
    active: null,
    deckReady: true,
    deckCount: 20,
    history: [],
    faces: {
      'hero:reinhardt': {
        kind: 'hero',
        slug: 'reinhardt',
        name: 'Reinhardt',
        role: 'Tank',
      },
      'hero:tracer': {
        kind: 'hero',
        slug: 'tracer',
        name: 'Tracer',
        role: 'Damage',
      },
      'hero:mercy': {
        kind: 'hero',
        slug: 'mercy',
        name: 'Mercy',
        role: 'Support',
      },
    },
    rules: RULES,
    ...over,
  };
}

const copy = (
  key: string,
  rarity: ArenaCard['rarity'],
  attack = 1200,
  defense = 1200
) => ({
  key,
  rarity,
  foil: false,
  level: rarity === 'epic' ? 6 : rarity === 'rare' ? 4 : 3,
  attack,
  defense,
  profile: 'balanced' as const,
});

const WITHDRAWN = 'aaaaaaaa-0000-4000-8000-000000000002';

const COLLECTION: ArenaCollectionEntry[] = [
  {
    key: 'hero:tracer',
    kind: 'hero',
    copies: [
      copy('hero:tracer', 'epic', 2400, 1600),
      copy('hero:tracer', 'common', 1400, 1000),
    ],
  },
  {
    key: 'map:ilios',
    kind: 'map',
    copies: [copy('map:ilios', 'common', 1000, 1400)],
  },
  {
    key: `player:${WITHDRAWN}`,
    kind: 'player',
    copies: [copy(`player:${WITHDRAWN}`, 'rare', 1500, 1500)],
  },
];

function deckResponse(cards: string[]): ArenaDeckResponse {
  return {
    deck: { cards, updatedAt: '2026-10-21T18:00:00.000Z' },
    resolved: [],
    dropped: [],
    collection: COLLECTION,
    faces: {
      'hero:tracer': {
        kind: 'hero',
        slug: 'tracer',
        name: 'Tracer',
        role: 'Damage',
      },
      'map:ilios': {
        kind: 'map',
        slug: 'ilios',
        name: 'Ilios',
        imageUrl: null,
      },
      // Retirée du TCG : le lecteur de faces a DÉJÀ vidé nom, image, figurine.
      [`player:${WITHDRAWN}`]: {
        kind: 'player',
        userId: WITHDRAWN,
        displayName: null,
        imageUrl: null,
        figure: null,
      },
    },
    rules: RULES,
  };
}

const ME_OK = {
  attested: true,
  attestedAt: '2026-10-01T08:00:00.000Z',
  avatar: { nickname: 'Lune', avatarId: 'a03', look: {} },
  inventory: [],
  inventoryTruncated: false,
  balance: 0,
};

/** La porte (`me`) ; le catalogue et l'appartement, lus par la porte des lieux, ne répondent pas. */
function libraryClient(me: () => Promise<unknown>): LibraryClient {
  const pending = () => new Promise<never>(() => {});
  return {
    me,
    catalog: pending,
    apartment: pending,
  } as unknown as LibraryClient;
}

function arenaStub(over: Partial<ArenaClient> = {}): ArenaClient {
  const fail = () => Promise.reject(new Error('non attendu'));
  return {
    lobby: async () => lobby(),
    deck: async () => deckResponse([]),
    saveDeck: fail,
    start: fail,
    duel: fail,
    act: fail,
    abandon: fail,
    ...over,
  };
}

function renderArena(
  arena: ArenaClient,
  me: () => Promise<unknown> = async () => ME_OK
) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const wrap = (ui: ReactNode) => (
    <QueryClientProvider client={qc}>
      <LibraryClientProvider client={libraryClient(me)}>
        <ArenaClientProvider client={arena}>{ui}</ArenaClientProvider>
      </LibraryClientProvider>
    </QueryClientProvider>
  );
  return renderPlayer(wrap(<PlaceScreen place="arena" />));
}

/* ------------------------------------------------------------ le modèle -- */

describe('le modèle de l’arène', () => {
  it('une joueuse retirée reste anonyme ; une face absente ne casse rien', () => {
    const face = deckResponse([]).faces[`player:${WITHDRAWN}`];
    expect(faceName(face, `player:${WITHDRAWN}`, 'Une joueuse')).toBe(
      'Une joueuse'
    );
    expect(faceSubject(face, `player:${WITHDRAWN}`)).toMatchObject({
      kind: 'player',
      displayName: null,
      imageUrl: null,
    });
    expect(faceSubject(undefined, 'hero:ana')).toEqual({
      kind: 'hero',
      slug: 'ana',
      name: null,
      role: null,
    });
    expect(faceName(undefined, 'map:kings-row', 'x')).toBe('kings row');
  });

  it('le deck : exemplaires libres, meilleur d’abord, plein à 20, carte écartée', () => {
    const tracer = COLLECTION[0];
    expect(availableCopies(tracer, [])).toBe(2);
    expect(nextCopy(tracer, [])?.rarity).toBe('epic');
    expect(nextCopy(tracer, ['hero:tracer'])?.rarity).toBe('common');
    const two = addToDeck(addToDeck([], tracer, 20), tracer, 20);
    expect(two).toEqual(['hero:tracer', 'hero:tracer']);
    // Plus d'exemplaire libre : rien n'est ajouté.
    expect(addToDeck(two, tracer, 20)).toEqual(two);
    // Deck plein : rien n'est ajouté.
    expect(addToDeck(Array(20).fill('map:ilios'), tracer, 20)).toHaveLength(20);
    expect(removeFromDeck(['a', 'b', 'c'], 1)).toEqual(['a', 'c']);
    expect(
      previewDeck(
        ['hero:tracer', 'hero:tracer', 'hero:tracer', 'team:x'],
        COLLECTION
      ).map((c) => c?.rarity ?? null)
    ).toEqual(['epic', 'common', null, null]);
    expect(
      filterCollection(COLLECTION, { rarity: 'epic', profile: 'all' }).map(
        (e) => e.key
      )
    ).toEqual(['hero:tracer']);
    expect(
      filterCollection(COLLECTION, { rarity: 'all', profile: 'assault' })
    ).toEqual([]);
  });

  it('la semaine : « semaine 43 »', () => {
    expect(weekText('2026-W43', t.weekLabel)).toBe('semaine 43');
    expect(weekText('2027-W01', 'week {n}')).toBe('week 1');
  });
});

/* -------------------------------------------- gestes proposés et récit -- */

const card = (uid: string, over: Partial<ArenaCard> = {}): ArenaCard => ({
  uid,
  key: `hero:${uid}`,
  rarity: 'rare',
  foil: false,
  level: 4,
  attack: 1800,
  defense: 1200,
  profile: 'assault',
  ...over,
});

function board(over: Partial<ArenaBoardView> = {}): ArenaBoardView {
  return {
    rulesVersion: 1,
    turn: 3,
    turnLimit: 30,
    active: 'player',
    first: 'player',
    summoned: false,
    status: 'active',
    endReason: null,
    seq: 2,
    player: {
      lp: 4000,
      deckCount: 10,
      hand: [],
      field: [null, null, null],
      graveyard: [],
    },
    npc: {
      lp: 4000,
      deckCount: 10,
      handCount: 4,
      field: [null, null, null],
      graveyard: [],
    },
    ...over,
  };
}

const WORDS: EventWords = {
  ...t.events,
  positions: { attack: 'attaque', defense: 'défense' },
  anonymous: t.anonymous,
};

describe('gestes proposés (moteur synchronisé) et récit', () => {
  it('une carte de niveau 6 propose ses sacrifices ; un monstre ses cibles', () => {
    const b = board({
      player: {
        lp: 4000,
        deckCount: 10,
        hand: [card('p6', { level: 6, attack: 2400 })],
        field: [
          {
            card: card('p1'),
            position: 'attack',
            summonedTurn: 1,
            positionChangedTurn: null,
            attackedTurn: null,
          },
          null,
          null,
        ],
        graveyard: [],
      },
      npc: {
        lp: 4000,
        deckCount: 10,
        handCount: 4,
        field: [
          null,
          {
            card: card('n1', { defense: 1000 }),
            position: 'defense',
            summonedTurn: 2,
            positionChangedTurn: null,
            attackedTurn: null,
          },
          null,
        ],
        graveyard: [],
      },
    });
    const hand = optionsFor(b, { kind: 'hand', uid: 'p6' });
    expect(hand.summon.map((s) => s.position)).toEqual(['attack', 'defense']);
    expect(hand.summon[0].tributeSets).toEqual([['p1']]);
    const monster = optionsFor(b, { kind: 'monster', uid: 'p1' });
    expect(monster.targets).toEqual(['n1']);
    expect(monster.canChangePosition).toBe(true);
    // Premier tour : aucune attaque.
    expect(
      optionsFor({ ...b, turn: 1 }, { kind: 'monster', uid: 'p1' }).targets
    ).toEqual([]);
  });

  it('chaque événement a sa phrase ; la main de la gardienne n’est jamais nommée', () => {
    const after = board({
      player: {
        lp: 3600,
        deckCount: 10,
        hand: [card('p2', { key: 'hero:ana' })],
        field: [null, null, null],
        graveyard: [card('p1', { key: 'hero:tracer' })],
      },
      npc: {
        lp: 4000,
        deckCount: 10,
        handCount: 4,
        field: [
          {
            card: card('n1', { key: 'map:ilios' }),
            position: 'attack',
            summonedTurn: 2,
            positionChangedTurn: null,
            attackedTurn: null,
          },
          null,
          null,
        ],
        graveyard: [],
      },
    });
    const faces = {
      'hero:tracer': {
        kind: 'hero' as const,
        slug: 'tracer',
        name: 'Tracer',
        role: null,
      },
      'hero:ana': {
        kind: 'hero' as const,
        slug: 'ana',
        name: 'Ana',
        role: null,
      },
      'map:ilios': {
        kind: 'map' as const,
        slug: 'ilios',
        name: 'Ilios',
        imageUrl: null,
      },
    };
    const say = (e: ArenaEvent) => narrate(e, after, faces, WORDS);
    expect(say({ type: 'draw', side: 'npc', card: null })).toBe(
      'La gardienne pioche une carte.'
    );
    expect(say({ type: 'draw', side: 'player', card: 'p2' })).toBe(
      'Tu pioches Ana.'
    );
    expect(
      say({
        type: 'summon',
        side: 'npc',
        card: 'n1',
        zone: 0,
        position: 'attack',
        tributes: [],
      })
    ).toBe('La gardienne invoque Ilios en attaque.');
    expect(
      say({
        type: 'attack',
        side: 'player',
        combat: {
          attacker: 'p1',
          target: 'n1',
          attackerAtk: 1400,
          targetPosition: 'attack',
          targetValue: 1800,
          destroyed: ['p1'],
          damage: { side: 'player', amount: 400 },
        },
        lp: { player: 3600, npc: 4000 },
      })
    ).toBe(
      'Tracer (1400) est détruite par Ilios (1800). Tu perds 400 points de vie.'
    );
    expect(
      say({
        type: 'attack',
        side: 'npc',
        combat: {
          attacker: 'n1',
          target: null,
          attackerAtk: 1800,
          targetPosition: null,
          targetValue: null,
          destroyed: [],
          damage: { side: 'player', amount: 1800 },
        },
        lp: { player: 2200, npc: 4000 },
      })
    ).toBe('Ilios t’attaque directement : tu perds 1800 points de vie.');
    expect(say({ type: 'duel_end', status: 'won', reason: 'lp' })).toBe(
      t.events.end.won
    );
    expect(say({ type: 'turn_end', side: 'player', turn: 3 })).toBeNull();
  });

  it('« une joueuse » garde sa minuscule en milieu de phrase, la majuscule en tête', () => {
    const anon = `player:${WITHDRAWN}`;
    const after = board({
      player: {
        lp: 4000,
        deckCount: 10,
        hand: [card('p3', { key: anon })],
        field: [null, null, null],
        graveyard: [],
      },
      npc: {
        lp: 3000,
        deckCount: 10,
        handCount: 4,
        field: [null, null, null],
        graveyard: [card('n1', { key: 'map:ilios' })],
      },
    });
    const faces = deckResponse([]).faces;
    const say = (e: ArenaEvent) => narrate(e, after, faces, WORDS);
    expect(say({ type: 'draw', side: 'player', card: 'p3' })).toBe(
      'Tu pioches une joueuse.'
    );
    expect(
      say({
        type: 'attack',
        side: 'player',
        combat: {
          attacker: 'p3',
          target: 'n1',
          attackerAtk: 1500,
          targetPosition: 'attack',
          targetValue: 1200,
          destroyed: ['n1'],
          damage: { side: 'npc', amount: 300 },
        },
        lp: { player: 4000, npc: 3000 },
      })
    ).toMatch(/^Une joueuse \(1500\) détruit/);
    // Seul le nom anonyme est touché : un pseudo en minuscules reste le sien.
    expect(capitalizeLead('lili (1500) détruit Ana.', 'une joueuse')).toBe(
      'lili (1500) détruit Ana.'
    );
    expect(capitalizeLead('une joueuse', 'une joueuse')).toBe('Une joueuse');
  });
});

/* ------------------------------------------------- lieu, porte et nav -- */

describe('l’arène est un lieu de la Library', () => {
  it('`?place=arena`, la porte du hall, la zone de la vue', () => {
    expect(libraryViewOf({ place: 'arena' })).toEqual({ kind: 'arena' });
    // `?room=` l'emporte toujours.
    expect(
      libraryViewOf({
        place: 'arena',
        room: '11111111-1111-4111-8111-111111111111',
      }).kind
    ).toBe('room');
    expect(placeHref('arena')).toBe('/player/library?place=arena');
    expect(HALL_DOOR_LIST.find((d) => d.id === 'arena')?.action).toEqual({
      kind: 'place',
      place: 'arena',
    });
    const navigate = vi.fn();
    const spots = roomHotspotsOf('hall', {}, navigate);
    expect(spots.hotspots.map((h) => h.id)).toContain('arena');
    spots.onHotspotTap({ id: 'arena', anchor: { x: 0, y: 0 } } as never);
    expect(navigate).toHaveBeenCalledWith('/player/library?place=arena');
  });
});

/* -------------------------------------------------------------- l'écran -- */

describe('l’écran de l’arène', () => {
  it('la porte de la Library d’abord : sans attestation, rien de l’arène n’est lu', async () => {
    const lobbySpy = vi.fn(async () => lobby());
    renderArena(arenaStub({ lobby: lobbySpy }), async () => {
      throw new PlayerHttpError('refus', 403, {
        code: 'LIBRARY_ADULT_REQUIRED',
      });
    });
    await waitFor(() => expect(screen.getByRole('checkbox')).toBeTruthy());
    expect(lobbySpy).not.toHaveBeenCalled();
  });

  it('le salon : paquet à gagner, défis, historique privé', async () => {
    renderArena(arenaStub());
    await screen.findByText(t.lobby.guardianTitle);
    expect(
      screen.getByText(format(t.lobby.weeklyOpen, { week: 'semaine 43' }))
    ).toBeTruthy();
    const challenge = screen.getByRole('button', {
      name: format(t.lobby.challengeAria, {
        name: t.lobby.challenges.remparts.name,
      }),
    });
    expect((challenge as HTMLButtonElement).disabled).toBe(false);
    expect(screen.getByText(t.lobby.historyPrivate)).toBeTruthy();
    // « Lieux » : l'arène est le lieu courant.
    const nav = screen.getByRole('navigation', { name: 'Lieux' });
    expect(
      within(nav)
        .getByRole('link', { name: 'L’arène' })
        .getAttribute('aria-current')
    ).toBe('page');
  });

  it('un duel en cours dit son échéance : 48 h sans coup = abandon', async () => {
    renderArena(
      arenaStub({
        lobby: async () =>
          lobby({
            active: {
              id: '00000000-0000-4000-9000-000000000009',
              opponent: 'assaut',
              startedAt: '2026-10-22T09:00:00.000Z',
              // 48 h après un dernier coup à 09:00 UTC le 22 — 11:00 à Paris.
              expiresAt: '2026-10-24T09:00:00.000Z',
            },
          }),
      })
    );
    await screen.findByText(t.lobby.activeTitle);
    expect(
      screen.getByText(
        format(t.lobby.activeExpires, {
          date: formatSiteDate('2026-10-24T09:00:00.000Z', 'fr', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
            hour: '2-digit',
            minute: '2-digit',
          }),
        })
      )
    ).toBeTruthy();
    expect(
      screen.getByText(/samedi 24 octobre à 11:00|samedi 24 octobre 11:00/)
    ).toBeTruthy();
  });

  it('paquet déjà gagné cette semaine ; sans deck complet, pas de défi', async () => {
    renderArena(
      arenaStub({
        lobby: async () =>
          lobby({
            weekly: { week: '2026-W43', claimed: true },
            deckReady: false,
            deckCount: 12,
            history: [
              {
                id: 'h1',
                opponent: 'assaut',
                status: 'won',
                endReason: 'lp',
                finalTurn: 12,
                playerLp: 1800,
                npcLp: 0,
                reward: 'granted',
                startedAt: '2026-10-21T10:00:00.000Z',
                endedAt: '2026-10-21T10:20:00.000Z',
              },
            ],
          }),
      })
    );
    await screen.findByText(
      format(t.lobby.weeklyClaimed, { week: 'semaine 43' })
    );
    expect(
      screen.getByText(format(t.lobby.deckIncomplete, { count: 12, size: 20 }))
    ).toBeTruthy();
    const challenge = screen.getByRole('button', {
      name: format(t.lobby.challengeAria, {
        name: t.lobby.challenges.assaut.name,
      }),
    });
    expect((challenge as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(t.lobby.rewardGranted)).toBeTruthy();
  });

  it('le deck : ajouter, retirer, enregistrer ; refus `not_owned` dit', async () => {
    const saveDeck = vi
      .fn<ArenaClient['saveDeck']>()
      .mockRejectedValueOnce(
        new PlayerHttpError('refus', 409, {
          code: 'not_owned',
          keys: ['hero:tracer'],
        })
      )
      .mockImplementation(async (cards) => deckResponse(cards));
    renderArena(arenaStub({ saveDeck }));
    fireEvent.click(await screen.findByRole('button', { name: t.tabs.deck }));
    const add = await screen.findByRole('button', {
      name: format(t.deck.addAria, { name: 'Tracer' }),
    });
    fireEvent.click(add);
    fireEvent.click(add);
    // Deux Tracer : plus d'exemplaire libre.
    expect((add as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(
      screen.getByRole('button', {
        name: format(t.deck.addAria, { name: t.anonymous }),
      })
    );
    expect(
      screen.getByText(format(t.deck.deckTitle, { count: 3, size: 20 }))
    ).toBeTruthy();
    fireEvent.click(
      screen.getAllByRole('button', {
        name: format(t.deck.removeAria, { name: 'Tracer' }),
      })[1]
    );
    expect(
      screen.getByText(format(t.deck.deckTitle, { count: 2, size: 20 }))
    ).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: t.deck.save }));
    await screen.findByText(t.deck.notOwned);
    fireEvent.click(screen.getByRole('button', { name: t.deck.save }));
    await screen.findByText(t.deck.saved);
    expect(saveDeck).toHaveBeenLastCalledWith([
      'hero:tracer',
      `player:${WITHDRAWN}`,
    ]);
  });

  /* ------------------------------------------------- duels (réponses figées) */

  const DUEL_ID = '00000000-0000-4000-9000-000000000001';
  const DUEL_FACES = {
    'hero:tracer': {
      kind: 'hero' as const,
      slug: 'tracer',
      name: 'Tracer',
      role: 'Damage' as const,
    },
    'hero:ana': {
      kind: 'hero' as const,
      slug: 'ana',
      name: 'Ana',
      role: 'Support' as const,
    },
    'map:ilios': {
      kind: 'map' as const,
      slug: 'ilios',
      name: 'Ilios',
      imageUrl: null,
    },
  };
  const TRACER = card('p1', { key: 'hero:tracer' });
  const ANA = card('p2', {
    key: 'hero:ana',
    attack: 1500,
    defense: 1500,
    profile: 'balanced',
  });
  const ILIOS = card('n1', {
    key: 'map:ilios',
    attack: 1200,
    defense: 1800,
    profile: 'bulwark',
  });
  const mon = (
    c: ArenaCard,
    position: 'attack' | 'defense',
    summonedTurn: number
  ) => ({
    card: c,
    position,
    summonedTurn,
    positionChangedTurn: null,
    attackedTurn: null,
  });
  function duelRes(
    b: ArenaBoardView,
    steps: ArenaStep[] = [],
    reward: ArenaDuelResponse['duel']['reward'] = null
  ): ArenaDuelResponse {
    return {
      duel: {
        id: DUEL_ID,
        opponent: 'assaut',
        startedAt: '2026-10-22T09:00:00.000Z',
        endedAt: b.status === 'active' ? null : '2026-10-22T09:20:00.000Z',
        board: b,
        reward,
        weekly: { week: '2026-W43', claimed: false },
      },
      faces: DUEL_FACES,
      steps,
    };
  }
  const startDuel = async () =>
    fireEvent.click(
      await screen.findByRole('button', {
        name: format(t.lobby.challengeAria, {
          name: t.lobby.challenges.assaut.name,
        }),
      })
    );

  it('un duel au clavier : invoquer, finir son tour, le tour de la gardienne pas à pas', async () => {
    const b0 = board({
      seq: 4,
      player: {
        lp: 4000,
        deckCount: 10,
        hand: [TRACER],
        field: [null, null, null],
        graveyard: [],
      },
    });
    const b1 = board({
      seq: 5,
      summoned: true,
      player: {
        lp: 4000,
        deckCount: 10,
        hand: [],
        field: [mon(TRACER, 'attack', 3), null, null],
        graveyard: [],
      },
    });
    const npcSide = {
      lp: 4000,
      deckCount: 9,
      handCount: 4,
      field: [mon(ILIOS, 'defense', 4), null, null],
      graveyard: [],
    };
    const b2 = board({
      seq: 6,
      turn: 5,
      player: {
        lp: 4000,
        deckCount: 9,
        hand: [ANA],
        field: [mon(TRACER, 'attack', 3), null, null],
        graveyard: [],
      },
      npc: npcSide,
    });
    const npcTurn = board({ seq: 6, turn: 4, active: 'npc', npc: npcSide });
    const act = vi
      .fn<ArenaClient['act']>()
      .mockResolvedValueOnce(
        duelRes(b1, [
          {
            event: {
              type: 'summon',
              side: 'player',
              card: 'p1',
              zone: 0,
              position: 'attack',
              tributes: [],
            },
            board: b1,
          },
        ])
      )
      .mockResolvedValueOnce(
        duelRes(b2, [
          { event: { type: 'turn_end', side: 'player', turn: 3 }, board: b1 },
          {
            event: { type: 'turn_start', side: 'npc', turn: 4 },
            board: npcTurn,
          },
          { event: { type: 'draw', side: 'npc', card: null }, board: npcTurn },
          {
            event: {
              type: 'summon',
              side: 'npc',
              card: 'n1',
              zone: 0,
              position: 'defense',
              tributes: [],
            },
            board: npcTurn,
          },
          { event: { type: 'turn_end', side: 'npc', turn: 4 }, board: npcTurn },
          {
            event: { type: 'turn_start', side: 'player', turn: 5 },
            board: b2,
          },
          { event: { type: 'draw', side: 'player', card: 'p2' }, board: b2 },
        ])
      );
    renderArena(arenaStub({ start: async () => duelRes(b0), act }));
    await startDuel();
    const hand = await screen.findByRole('region', { name: t.duel.hand });
    const log = screen.getByRole('log');
    const tracer = within(hand).getByRole('button', {
      name: format(t.duel.cardAria, {
        name: 'Tracer',
        level: 4,
        attack: 1800,
        defense: 1200,
      }),
    });
    fireEvent.click(tracer);
    expect(tracer.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(
      screen.getByRole('button', { name: 'Invoquer en attaque' })
    );
    await waitFor(() => expect(act).toHaveBeenCalledTimes(1));
    expect(act).toHaveBeenNthCalledWith(1, DUEL_ID, 4, {
      type: 'summon',
      card: 'p1',
      position: 'attack',
      tributes: [],
    });
    await within(log).findByText('Tu invoques Tracer en attaque.');
    // Le monstre posé dit sa position par écrit, pas par la couleur seule.
    const field = screen.getByRole('region', { name: t.duel.field });
    expect(within(field).getByText(t.duel.positions.attack)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: t.duel.endTurn }));
    await waitFor(() => expect(act).toHaveBeenCalledTimes(2));
    expect(act).toHaveBeenNthCalledWith(2, DUEL_ID, 5, { type: 'end_turn' });
    await within(log).findByText('Tu pioches Ana.');
    expect(
      within(log).getByText('La gardienne pioche une carte.')
    ).toBeTruthy();
    expect(
      within(log).getByText('La gardienne invoque Ilios en défense.')
    ).toBeTruthy();
    // La main de la gardienne n'est qu'un nombre.
    expect(screen.getByText(/Main : 4/)).toBeTruthy();
  });

  it('la fin : victoire et paquet de la semaine ; puis « déjà gagné »', async () => {
    const ready = board({
      seq: 7,
      turn: 9,
      summoned: true,
      player: {
        lp: 2600,
        deckCount: 8,
        hand: [],
        field: [mon(TRACER, 'attack', 7), null, null],
        graveyard: [],
      },
      npc: {
        lp: 900,
        deckCount: 9,
        handCount: 4,
        field: [null, null, null],
        graveyard: [],
      },
    });
    const won = board({
      ...ready,
      seq: 8,
      status: 'won',
      endReason: 'lp',
      npc: { ...ready.npc, lp: 0 },
    });
    const steps: ArenaStep[] = [
      {
        event: {
          type: 'attack',
          side: 'player',
          combat: {
            attacker: 'p1',
            target: null,
            attackerAtk: 1800,
            targetPosition: null,
            targetValue: null,
            destroyed: [],
            damage: { side: 'npc', amount: 1800 },
          },
          lp: { player: 2600, npc: 0 },
        },
        board: won,
      },
      { event: { type: 'duel_end', status: 'won', reason: 'lp' }, board: won },
    ];
    const act = vi
      .fn<ArenaClient['act']>()
      // Mêmes littéraux que libraryArenaApi.test.ts.
      .mockResolvedValueOnce(
        duelRes(won, steps, {
          status: 'granted',
          week: '2026-W43',
          packId: null,
        })
      )
      .mockResolvedValueOnce(
        duelRes(won, steps, { status: 'week_already', week: '2026-W43' })
      );
    const start = vi.fn(async () => duelRes(ready));
    renderArena(arenaStub({ start, act }));
    await startDuel();
    const field = await screen.findByRole('region', { name: t.duel.field });
    fireEvent.click(within(field).getAllByRole('button')[0]);
    fireEvent.click(screen.getByRole('button', { name: t.duel.directAttack }));
    expect(act).toHaveBeenCalledWith(DUEL_ID, 7, {
      type: 'attack',
      attacker: 'p1',
      target: null,
    });
    const result = await screen.findByRole('heading', {
      name: t.result.title.won,
    });
    // La fin prend le focus : le lecteur d'écran l'annonce.
    expect(document.activeElement).toBe(result);
    expect(screen.getByText(t.result.rewardGranted)).toBeTruthy();
    expect(
      screen
        .getByRole('link', { name: t.result.rewardOpen })
        .getAttribute('href')
    ).toBe('/player/tcg');

    // Rejouer : la seconde victoire de la semaine ne rapporte plus de paquet.
    fireEvent.click(screen.getByRole('button', { name: t.result.again }));
    await waitFor(() => expect(start).toHaveBeenCalledTimes(2));
    await screen.findByText(t.duel.yourTurn, { exact: false });
    const field2 = screen.getByRole('region', { name: t.duel.field });
    fireEvent.click(within(field2).getAllByRole('button')[0]);
    fireEvent.click(screen.getByRole('button', { name: t.duel.directAttack }));
    await screen.findByText(
      format(t.result.rewardWeekAlready, { week: 'semaine 43' })
    );
  });

  it('un geste périmé (`stale_state`) recharge le duel et le dit', async () => {
    const b0 = board({ seq: 4 });
    const duel = vi.fn(async () => duelRes(b0));
    const act = vi
      .fn<ArenaClient['act']>()
      .mockRejectedValueOnce(
        new PlayerHttpError('refus', 409, { code: 'stale_state', seq: 6 })
      );
    renderArena(arenaStub({ start: async () => duelRes(b0), act, duel }));
    await startDuel();
    fireEvent.click(
      await screen.findByRole('button', { name: t.duel.endTurn })
    );
    await screen.findByText(t.duel.stale);
    await waitFor(() => expect(duel).toHaveBeenCalledWith(DUEL_ID));
  });
});
