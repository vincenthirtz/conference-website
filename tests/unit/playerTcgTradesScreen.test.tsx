// @vitest-environment happy-dom
//
// Écran « Échanges de cartes » (lot P14) : module features/player/tcg, rendu
// dans le harnais joueuse. Garde :
//   * ERREUR DE LECTURE ≠ LISTE VIDE : partenaires illisibles → message
//     d'erreur et « Réessayer », jamais « personne n'accepte » ;
//   * accepter passe par sa confirmation, porte une `Idempotency-Key` (qui
//     S'AJOUTE à la transaction en base) et relit boîte + préférence.

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
  default: { asPath: '/player/tcg/echanges', replace },
  useRouter: () => ({ asPath: '/player/tcg/echanges', query: {}, replace }),
}));
vi.mock('@/hooks/usePlayerSession', () => ({
  usePlayerSession: () => ({ ready: true }),
}));

import TradesScreen from '../../features/player/tcg/ui/trades/TradesScreen';
import { PlayerQueryProvider } from '../../features/player/_shared/query';
import { renderPlayer } from './__helpers__/playerHarness';

const HER = '5a1c2a7e-0b6d-4e3a-9c1f-2a3b4c5d6e7f';
const TRADE = '6b1c2a7e-0b6d-4e3a-9c1f-2a3b4c5d6e7f';

const SETTINGS = {
  acceptsProposals: true,
  eligible: true,
  eligibleAt: null,
  eligibilityReason: null,
  limits: {
    maxCardsPerSide: 5,
    ttlHours: 72,
    maxPendingSent: 5,
    maxPendingReceived: 10,
    declineCooldownHours: 24,
    maxAcceptedPerDay: 5,
    minAccountAgeDays: 7,
    minCollectionAgeDays: 3,
  },
  pending: { sent: 0, received: 1 },
};
const card = (slug: string) => ({
  kind: 'map',
  slug,
  name: slug,
  imageUrl: null,
  rarity: 'common',
  isFoil: false,
});
const TRADE_VIEW = {
  id: TRADE,
  direction: 'received',
  status: 'pending',
  reason: null,
  createdAt: '2026-09-28T10:00:00Z',
  expiresAt: '2026-10-01T10:00:00Z',
  resolvedAt: null,
  counterpart: { userId: HER, displayName: 'Nova' },
  offered: [card('ilios')],
  requested: [{ ...card('lijiang'), ownedCopies: 3, tradeableCopies: 2 }],
};

type Call = { url: string; method: string; body: unknown; headers: Headers };
let calls: Call[] = [];
let replies: Record<string, { status: number; body: unknown }>;

beforeEach(() => {
  calls = [];
  replies = {
    'GET /api/player/tcg/trades/settings': { status: 200, body: SETTINGS },
    'GET /api/player/tcg/trades': {
      status: 200,
      body: { trades: [TRADE_VIEW], nextCursor: null },
    },
    'GET /api/player/tcg/trades/partners': {
      status: 200,
      body: { partners: [{ userId: HER, displayName: 'Nova' }] },
    },
    'GET /api/player/tcg/trades/cards': { status: 200, body: { cards: [] } },
    [`POST /api/player/tcg/trades/${TRADE}`]: {
      status: 200,
      body: { trade: { id: TRADE, status: 'accepted' }, replayed: false },
    },
  };
  globalThis.fetch = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    calls.push({ url, method, body, headers: new Headers(init?.headers) });
    const r = replies[`${method} ${url.split('?')[0]}`] ?? {
      status: 404,
      body: { error: 'x' },
    };
    return new Response(JSON.stringify(r.body), { status: r.status });
  }) as unknown as typeof fetch;
});
afterEach(cleanup);

function renderScreen() {
  return renderPlayer(
    <PlayerQueryProvider>
      <TradesScreen />
    </PlayerQueryProvider>
  );
}

describe('« Échanges de cartes »', () => {
  it('partenaires illisibles : une erreur, pas « personne »', async () => {
    replies['GET /api/player/tcg/trades/partners'] = {
      status: 500,
      body: { error: 'Lecture impossible.' },
    };
    renderScreen();
    await screen.findByText('Les échanges sont activés.');
    const alerts = await screen.findAllByRole('alert');
    expect(
      alerts.some((a) => a.textContent?.includes('Une erreur est survenue'))
    ).toBe(true);
    expect(screen.queryByLabelText(/partenaire/i)).toBeNull();
  });

  it('accepter : confirmation, Idempotency-Key, puis relecture', async () => {
    renderScreen();
    fireEvent.click(
      await screen.findByRole('button', {
        name: 'Accepter la proposition de Nova',
      })
    );
    expect(calls.some((c) => c.method === 'POST')).toBe(false);
    fireEvent.click(await screen.findByRole('button', { name: 'Accepter' }));
    await waitFor(() =>
      expect(calls.some((c) => c.method === 'POST')).toBe(true)
    );
    const post = calls.find((c) => c.method === 'POST')!;
    expect(post.body).toEqual({ action: 'accept' });
    expect(post.headers.get('Idempotency-Key')).toBeTruthy();
    // Toast ET région d'annonce.
    expect(
      (
        await screen.findAllByText(
          'Échange accepté : les cartes sont dans ta collection.'
        )
      ).length
    ).toBeGreaterThan(0);
    await waitFor(() =>
      expect(
        calls.filter(
          (c) =>
            c.method === 'GET' && c.url.startsWith('/api/player/tcg/trades?')
        ).length
      ).toBeGreaterThanOrEqual(2)
    );
  });
});
