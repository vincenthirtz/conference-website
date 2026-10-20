// @vitest-environment happy-dom
//
// Women's Library, lot 14d — le mot d'accueil du KIT DE BIENVENUE dans l'écran
// « Mon appartement », contre des RÉPONSES fixes de l'API (le don lui-même est
// testé dans conference-api : libraryStarterKitApi.test.ts). Ce que ces cas
// protègent :
//   * le mot dit les meubles offerts (noms traduits), et où ils sont : posés
//     dans l'appartement, ou rangés dans « Mes meubles » ;
//   * il ne se dit qu'UNE fois : fermé, il ne revient pas, même en revenant
//     sur la page (le cache est nettoyé) ; une relecture de l'appartement
//     avant la fermeture ne l'efface pas ;
//   * `me` est relu : l'inventaire, lu avant le don, contient alors le kit ;
//   * sans `starterKit` dans la réponse, aucun mot.
// Le moteur (canvas) est remplacé par un témoin : il a ses propres tests.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';

vi.mock('@/utils/supabaseBrowser', () => ({
  supabaseClient: {
    auth: {
      getSession: async () => ({ data: { session: { access_token: 't' } } }),
    },
  },
}));
const replace = vi.hoisted(() => vi.fn(async () => true));
vi.mock('next/router', () => ({
  default: { asPath: '/player/library', replace },
  useRouter: () => ({ asPath: '/player/library', query: {}, replace }),
}));
vi.mock('next/dynamic', async () => {
  const React = await import('react');
  return {
    default: () =>
      function ViewStub(props: {
        room?: { version: number };
        items?: unknown[];
      }) {
        return React.createElement('div', {
          'data-testid': props.room ? 'apartment-view' : 'look-preview',
          'data-items': props.items?.length ?? 0,
        });
      },
  };
});

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ApartmentScreen from '../../features/player/library/ui/apartment/ApartmentScreen';
import { PlayerQueryProvider } from '../../features/player/_shared/query';
import nsPlayerLibrary from '../../lib/i18n/locales/fr/playerLibrary';
import { format } from '../../lib/i18n/useT';
import { renderPlayer } from './__helpers__/playerHarness';

const t = nsPlayerLibrary.fr;

type Reply = { status: number; body: unknown };
let replies: Record<string, Reply | Reply[]>;
let calls: Array<{ method: string; path: string }> = [];

const KIT = ['bed_iron', 'chair', 'rug_round'];

const meWith = (inventory: Array<{ id: string; key: string }>): Reply => ({
  status: 200,
  body: {
    attested: true,
    attestedAt: '2026-10-01T08:00:00.000Z',
    avatar: { nickname: 'Lune', avatarId: 'a03', look: {} },
    inventory: inventory.map((i) => ({
      ...i,
      acquiredAt: '2026-10-20T00:00:00.000Z',
    })),
    inventoryTruncated: false,
    balance: 40,
  },
});
const ME_BEFORE = meWith([]);
const ME_AFTER = meWith(KIT.map((key) => ({ id: `inv-${key}`, key })));

const CATALOG_OK: Reply = {
  status: 200,
  body: {
    tileSizeM: 0.5,
    rotations: 4,
    furniture: [
      ['bed_iron', 'bed', 2, 4, 500],
      ['chair', 'seating', 1, 1, 80],
      ['rug_round', 'rug', 4, 4, 300],
    ].map(([key, category, w, d, price]) => ({
      key,
      category,
      footprint: { w, d },
      heightM: 1,
      price,
      sittable: false,
      stackable: false,
      layer: category === 'rug' ? 'floor' : 'object',
    })),
    avatars: ['a03'],
  },
};

const ROOM = {
  id: 'room-1',
  name: null,
  access: 'private',
  listed: false,
  width: 14,
  depth: 12,
  decor: { floor: 'parquet', wall: 'plain' },
  version: 1,
};
const PLACED = [
  { inventoryId: 'inv-bed_iron', key: 'bed_iron', gx: 10, gy: 0, rotation: 0 },
  { inventoryId: 'inv-chair', key: 'chair', gx: 0, gy: 2, rotation: 1 },
  { inventoryId: 'inv-rug_round', key: 'rug_round', gx: 5, gy: 4, rotation: 0 },
];
const apartmentReply = (
  starterKit?: { placed: boolean },
  items = PLACED
): Reply => ({
  status: 200,
  body: {
    room: ROOM,
    items,
    ...(starterKit
      ? {
          starterKit: {
            granted: true,
            version: 'v1',
            keys: KIT,
            placed: starterKit.placed,
          },
        }
      : {}),
  },
});

function route(method: string, path: string): Reply {
  const r = replies[`${method} ${path}`];
  if (Array.isArray(r)) return r.length > 1 ? (r.shift() as Reply) : r[0];
  return r ?? { status: 404, body: { error: 'not found' } };
}

beforeEach(() => {
  calls = [];
  replies = {
    'GET /api/player/library/me': [ME_BEFORE, ME_AFTER],
    'GET /api/player/library/catalog': CATALOG_OK,
    'GET /api/player/library/apartment': [
      apartmentReply({ placed: true }),
      apartmentReply(),
    ],
  };
  vi.clearAllMocks();
  globalThis.fetch = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    const path = String(url).split('?')[0];
    calls.push({ method, path });
    const r = route(method, path);
    return new Response(JSON.stringify(r.body), { status: r.status });
  }) as unknown as typeof fetch;
});
afterEach(cleanup);

const newClient = () =>
  new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

function renderScreen(client = newClient()) {
  const view = renderPlayer(
    <QueryClientProvider client={client}>
      <PlayerQueryProvider>
        <ApartmentScreen />
      </PlayerQueryProvider>
    </QueryClientProvider>
  );
  return { client, ...view };
}

const reads = (path: string) =>
  calls.filter((c) => c.method === 'GET' && c.path === path);
const itemNames = KIT.map((k) => (t.furniture as Record<string, string>)[k]);

describe('le mot d’accueil du kit de bienvenue', () => {
  it('dit les meubles offerts, posés chez elle, et relit l’inventaire', async () => {
    renderScreen();
    const notice = await screen.findByTestId('library-starter-kit');

    expect(notice.getAttribute('role')).toBe('status');
    expect(
      within(notice).getByRole('heading', { name: t.starterKitTitle })
    ).toBeTruthy();
    expect(
      within(notice).getByText(
        format(t.starterKitItems, { items: itemNames.join(', ') })
      )
    ).toBeTruthy();
    expect(within(notice).getByText(t.starterKitPlaced)).toBeTruthy();

    // L'inventaire lu avant le don est relu : le kit y apparaît.
    await waitFor(() =>
      expect(reads('/api/player/library/me')).toHaveLength(2)
    );
    fireEvent.click(screen.getByRole('tab', { name: t.tabInventory }));
    expect(
      await screen.findByTestId('library-inventory-bed_iron')
    ).toBeTruthy();
  });

  it('kit rangé (appartement déjà meublé) : le mot dit où le trouver', async () => {
    replies['GET /api/player/library/apartment'] = [
      apartmentReply({ placed: false }, []),
      apartmentReply(undefined, []),
    ];
    renderScreen();
    const notice = await screen.findByTestId('library-starter-kit');
    expect(within(notice).getByText(t.starterKitStored)).toBeTruthy();
    expect(within(notice).queryByText(t.starterKitPlaced)).toBeNull();
  });

  it('une seule fois : fermé, il ne revient pas, même en revenant sur la page', async () => {
    const { client, unmount } = renderScreen();
    await screen.findByTestId('library-starter-kit');

    // Une relecture de l'appartement (sans `starterKit`) ne l'efface pas.
    await act(() =>
      client.invalidateQueries({ queryKey: ['player'], refetchType: 'all' })
    );
    await waitFor(() =>
      expect(reads('/api/player/library/apartment').length).toBeGreaterThan(1)
    );
    expect(screen.getByTestId('library-starter-kit')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: t.starterKitDismiss }));
    expect(screen.queryByTestId('library-starter-kit')).toBeNull();

    // Revenir sur la page, même cache : rien à redire.
    unmount();
    renderScreen(client);
    await screen.findByTestId('apartment-view');
    expect(screen.queryByTestId('library-starter-kit')).toBeNull();
  });

  it('revenir sur la page sans l’avoir fermé ne le redit pas (cache nettoyé)', async () => {
    const { client, unmount } = renderScreen();
    await screen.findByTestId('library-starter-kit');
    const cachedApartment = () =>
      client
        .getQueryCache()
        .findAll({ queryKey: ['player'] })
        .find((q) => q.queryKey.at(-1) === 'apartment')?.state.data as
        | Record<string, unknown>
        | undefined;
    await waitFor(() => {
      expect(cachedApartment()?.room).toBeTruthy();
      expect(cachedApartment()).not.toHaveProperty('starterKit');
    });
    unmount();
    renderScreen(client);
    await screen.findByTestId('apartment-view');
    expect(screen.queryByTestId('library-starter-kit')).toBeNull();
  });

  it('sans `starterKit` dans la réponse : aucun mot', async () => {
    replies['GET /api/player/library/apartment'] = apartmentReply();
    replies['GET /api/player/library/me'] = ME_AFTER;
    renderScreen();
    await screen.findByTestId('apartment-view');
    expect(screen.queryByTestId('library-starter-kit')).toBeNull();
    expect(reads('/api/player/library/me')).toHaveLength(1);
  });
});
