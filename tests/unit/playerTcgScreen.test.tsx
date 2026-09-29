// @vitest-environment happy-dom
//
// Écran « Ma collection » (lot P14) : module features/player/tcg, rendu dans
// le harnais joueuse + cache. Garde les promesses d'avant la migration :
//   * UNE LECTURE RATÉE N'EST NI UNE COLLECTION VIDE NI UN SOLDE À 0 ;
//   * un refus d'achat est traduit par son `code` (prix compris) ET l'état
//     réel est RELU (le cas qui coûtait de l'argent : réponse perdue après
//     débit) ;
//   * le recyclage passe par sa confirmation, porte une `Idempotency-Key`
//     (qui S'AJOUTE à la protection en base) et relit la collection.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';

vi.mock('@/utils/supabaseBrowser', () => ({
  supabaseClient: {
    auth: {
      getSession: async () => ({ data: { session: { access_token: 't' } } }),
    },
  },
}));
const replace = vi.hoisted(() => vi.fn(async () => true));
vi.mock('next/router', () => ({
  default: { asPath: '/player/tcg', replace },
  useRouter: () => ({ asPath: '/player/tcg', query: {}, replace }),
}));
// Panneaux autonomes (leurs propres lectures, testés ailleurs) : hors sujet.
vi.mock('@/features/player/tcg/ui/lazyPanels', () => {
  const Null = () => null;
  return {
    FanartSubmitPanel: Null,
    TcgShowcaseEditor: Null,
    TcgForgePanel: Null,
    TcgCosmeticsPanel: Null,
    TcgPhotoInvite: Null,
    TcgPackReveal: Null,
    loadPackReveal: async () => ({}),
  };
});
vi.mock('@/components/player/TwitchLinkCard', () => ({ default: () => null }));
vi.mock('@/components/tcg/TcgSetsPanel', () => ({ default: () => null }));

import TcgCollectionScreen from '../../features/player/tcg/ui/TcgCollectionScreen';
import { PlayerQueryProvider } from '../../features/player/_shared/query';
import { renderPlayer } from './__helpers__/playerHarness';

const PLAYER = '4f1c2a7e-0b6d-4e3a-9c1f-2a3b4c5d6e7f';
const PACK = '8a1c2a7e-0b6d-4e3a-9c1f-2a3b4c5d6e70';

type Call = { url: string; method: string; body: unknown; headers: Headers };
let calls: Call[] = [];
type Reply = { status: number; body: unknown };
let replies: Record<string, Reply>;

const PACKS_OK: Reply = {
  status: 200,
  body: {
    packs: [],
    unopened: 0,
    balance: 120,
    boosterPrice: 100,
    recycleRefund: 30,
    nextCursor: null,
  },
};
const COLLECTION_OK: Reply = {
  status: 200,
  body: {
    cards: [
      {
        kind: 'player',
        userId: PLAYER,
        displayName: 'Nova',
        imageUrl: null,
        rarity: 'rare',
        isFoil: false,
        count: 2,
        recyclable: { packId: PACK, position: 1 },
        engagedCopies: 0,
        recyclableEngaged: false,
      },
    ],
    distinct: 1,
    total: 2,
    pool: { distinct: 10 },
    nextCursor: null,
  },
};

function route(url: string, method: string): Reply {
  const path = url.split('?')[0];
  return (
    replies[`${method} ${path}`] ?? { status: 200, body: { pending: null } }
  );
}

beforeEach(() => {
  calls = [];
  replies = {
    'GET /api/player/tcg/packs': PACKS_OK,
    'GET /api/player/tcg/collection': COLLECTION_OK,
  };
  vi.clearAllMocks();
  globalThis.fetch = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    calls.push({ url, method, body, headers: new Headers(init?.headers) });
    const r = route(url, method);
    return new Response(JSON.stringify(r.body), { status: r.status });
  }) as unknown as typeof fetch;
});
afterEach(cleanup);

function renderScreen() {
  return renderPlayer(
    <PlayerQueryProvider>
      <TcgCollectionScreen />
    </PlayerQueryProvider>
  );
}

const reads = (path: string) =>
  calls.filter((c) => c.method === 'GET' && c.url.startsWith(path)).length;

describe('« Ma collection » — lecture', () => {
  it('une lecture ratée affiche l’erreur, jamais une collection vide ni un solde', async () => {
    replies['GET /api/player/tcg/collection'] = {
      status: 500,
      body: { error: 'Lecture impossible.', code: 'internal' },
    };
    renderScreen();
    expect(
      await screen.findByText(
        'Impossible de charger ta collection pour le moment.'
      )
    ).toBeTruthy();
    expect(screen.queryByText(/Aucune carte/i)).toBeNull();
    expect(screen.queryByText('Acheter un booster')).toBeNull();
    expect(screen.getByRole('button', { name: /réessayer/i })).toBeTruthy();
  });

  it('rend la collection paginée : vignette puis fiche avec le recyclage', async () => {
    renderScreen();
    const tile = await screen.findByRole('button', { name: /Nova/ });
    // Les paquets fermés seulement, et la collection par page.
    expect(
      calls.some((c) => c.url.includes('/api/player/tcg/packs?status=unopened'))
    ).toBe(true);
    expect(
      calls.some((c) => c.url.includes('/api/player/tcg/collection?limit=40'))
    ).toBe(true);
    fireEvent.click(tile);
    expect(
      await screen.findByRole('button', { name: /Recycler un doublon de Nova/ })
    ).toBeTruthy();
  });
});

describe('« Ma collection » — gestes monétaires', () => {
  it('achat refusé : message du code avec le prix, puis relecture de l’état réel', async () => {
    replies['POST /api/player/tcg/booster'] = {
      status: 402,
      body: {
        error: 'Solde insuffisant.',
        code: 'insufficient_funds',
        price: 100,
      },
    };
    renderScreen();
    fireEvent.click(await screen.findByText('Acheter un booster'));
    expect(
      await screen.findByText('Pièces insuffisantes : il t’en faut 100.')
    ).toBeTruthy();
    await waitFor(() => expect(reads('/api/player/tcg/packs')).toBe(2));
    const post = calls.find((c) => c.method === 'POST');
    expect(post?.headers.get('Idempotency-Key')).toBeTruthy();
  });

  it('recyclage : confirmation, Idempotency-Key, exemplaire désigné par l’API, relecture', async () => {
    replies['POST /api/player/tcg/recycle'] = {
      status: 200,
      body: { refund: 30 },
    };
    renderScreen();
    fireEvent.click(await screen.findByRole('button', { name: /Nova/ }));
    fireEvent.click(
      await screen.findByRole('button', { name: /Recycler un doublon de Nova/ })
    );
    // Rien ne part avant la confirmation.
    expect(calls.some((c) => c.method === 'POST')).toBe(false);
    fireEvent.click(await screen.findByRole('button', { name: 'Recycler' }));
    await waitFor(() =>
      expect(calls.some((c) => c.method === 'POST')).toBe(true)
    );
    const post = calls.find((c) => c.method === 'POST')!;
    expect(post.url).toBe('/api/player/tcg/recycle');
    expect(post.body).toEqual({ packId: PACK, position: 1 });
    expect(post.headers.get('Idempotency-Key')).toBeTruthy();
    expect(
      await screen.findByText('Doublon recyclé : +30 pièces.')
    ).toBeTruthy();
    await waitFor(() => expect(reads('/api/player/tcg/collection')).toBe(2));
  });
});
