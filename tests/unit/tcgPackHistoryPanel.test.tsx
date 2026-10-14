// @vitest-environment happy-dom
//
// Onglet « Historique des gains » de /admin/tcg — côté écran, contre une
// réponse figée de `/api/admin/tcg/pack-history` (la route est testée dans
// conference-api, `adminTcgPackHistory.test.ts`, mêmes clés).
//
// Ce que ces cas protègent : la question d'origine (« a-t-elle eu son
// drop ? ») se lit à l'écran — nom, source, pseudo Twitch ; le filtre vit dans
// l'URL et part dans la requête ; « Charger plus » envoie le curseur rendu par
// la page précédente.

import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import nsAdminTcgPage from '@/lib/i18n/locales/admin-fr/adminTcgPage';

const { adminRequest, router } = vi.hoisted(() => ({
  adminRequest: vi.fn(),
  router: {
    pathname: '/admin/tcg',
    query: {} as Record<string, string>,
    push: vi.fn(),
  },
}));
vi.mock('@/utils/admin/adminHttp', () => ({ adminRequest }));
vi.mock('next/router', () => ({ useRouter: () => router }));

import TcgPackHistoryPanel from '@/components/admin/tcg/TcgPackHistoryPanel';

const t = nsAdminTcgPage.fr;

const COUNTS = {
  drop: 1,
  victory: 3,
  streak: 0,
  placement: 0,
  welcome: 1,
  purchase: 0,
  forge: 0,
};

const DROP = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000001',
  userId: '11111111-1111-4111-8111-111111111111',
  displayName: 'Viewer',
  twitchLogin: 'viewer_tw',
  source: 'drop',
  grantedAt: '2026-10-14T21:30:00.000Z',
  openedAt: null,
  matchId: null,
};

const VICTORY = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000004',
  userId: '22222222-2222-4222-8222-222222222222',
  displayName: null,
  twitchLogin: 'player_tw',
  source: 'victory',
  grantedAt: '2026-10-14T20:44:45.384Z',
  openedAt: '2026-10-14T21:00:00.000Z',
  matchId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
};

const WELCOME = {
  id: 'aaaaaaaa-aaaa-4aaa-8aaa-000000000005',
  userId: '22222222-2222-4222-8222-222222222222',
  displayName: 'Joueuse',
  twitchLogin: null,
  source: 'welcome',
  grantedAt: '2026-09-14T10:00:00.000Z',
  openedAt: '2026-09-15T10:00:00.000Z',
  matchId: null,
};

function renderPanel(props: { canOpenMatch?: boolean } = {}) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <TcgPackHistoryPanel {...props} />
    </QueryClientProvider>
  );
}

const paramsOf = (call: unknown[]) =>
  new URLSearchParams(String(call[0]).split('?')[1] ?? '');

afterEach(() => {
  cleanup();
  adminRequest.mockReset();
  router.push.mockReset();
  router.query = {};
});

describe('TcgPackHistoryPanel', () => {
  it('nomme la personne, la source et le pseudo Twitch d’un drop', async () => {
    adminRequest.mockResolvedValueOnce({
      items: [DROP, VICTORY],
      nextCursor: null,
      counts: COUNTS,
      source: null,
    });
    renderPanel({ canOpenMatch: true });

    const rows = await screen.findAllByTestId('tcg-pack-history-row');
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).toContain('Viewer');
    expect(rows[0].textContent).toContain(t.historySourceDrop);
    expect(rows[0].textContent).toContain('Twitch : viewer_tw');
    expect(rows[0].textContent).toContain(t.historySealed);

    // Une victoire : lien vers son match, pas de pseudo Twitch, et un compte
    // sans pseudo reste lisible.
    expect(rows[1].textContent).toContain(t.historyNoName);
    expect(rows[1].textContent).not.toContain('player_tw');
    expect(rows[1].textContent).toContain(t.historyOpened);
    const link = screen.getByRole('link', { name: t.historySeeMatch });
    expect(link.getAttribute('href')).toBe(`/admin/matches/${VICTORY.matchId}`);

    const first = paramsOf(adminRequest.mock.calls[0]);
    expect(String(adminRequest.mock.calls[0][0])).toMatch(
      /^\/api\/admin\/tcg\/pack-history\?/
    );
    expect(first.get('source')).toBeNull();
    expect(first.get('cursor')).toBeNull();
  });

  it('sans `arbitrate_matches`, pas de lien vers le match (il mènerait en 403)', async () => {
    adminRequest.mockResolvedValueOnce({
      items: [VICTORY],
      nextCursor: null,
      counts: COUNTS,
      source: null,
    });
    renderPanel();

    await screen.findAllByTestId('tcg-pack-history-row');
    expect(screen.queryByRole('link', { name: t.historySeeMatch })).toBeNull();
  });

  it('affiche les comptes par source et écrit le filtre dans l’URL', async () => {
    router.query = { tab: 'historique' };
    adminRequest.mockResolvedValueOnce({
      items: [DROP, VICTORY],
      nextCursor: null,
      counts: COUNTS,
      source: null,
    });
    renderPanel();
    await screen.findAllByTestId('tcg-pack-history-row');

    const select = screen.getByLabelText(
      `${t.historySourceFilter} :`
    ) as HTMLSelectElement;
    expect([...select.options].map((o) => o.textContent)).toContain(
      `${t.historySourceDrop} (1)`
    );

    fireEvent.change(select, { target: { value: 'drop' } });

    // L'onglet est gardé : le lien partagé rouvre le même écran.
    expect(router.push).toHaveBeenCalledWith(
      { pathname: '/admin/tcg', query: { tab: 'historique', source: 'drop' } },
      undefined,
      { shallow: true }
    );
  });

  it('un lien `?source=drop` lit les seuls drops ; une source inconnue, tout', async () => {
    router.query = { tab: 'historique', source: 'drop' };
    adminRequest.mockResolvedValueOnce({
      items: [DROP],
      nextCursor: null,
      counts: COUNTS,
      source: 'drop',
    });
    renderPanel();

    expect(await screen.findAllByTestId('tcg-pack-history-row')).toHaveLength(
      1
    );
    expect(paramsOf(adminRequest.mock.calls[0]).get('source')).toBe('drop');
    cleanup();

    router.query = { tab: 'historique', source: 'trade' };
    adminRequest.mockResolvedValueOnce({
      items: [DROP, VICTORY],
      nextCursor: null,
      counts: COUNTS,
      source: null,
    });
    renderPanel();
    await screen.findAllByTestId('tcg-pack-history-row');
    expect(paramsOf(adminRequest.mock.calls[1]).get('source')).toBeNull();
  });

  it('« Charger plus » envoie le curseur de la page précédente', async () => {
    adminRequest.mockResolvedValueOnce({
      items: [DROP, VICTORY],
      nextCursor: 'CURSOR-1',
      counts: COUNTS,
      source: null,
    });
    renderPanel();
    await screen.findAllByTestId('tcg-pack-history-row');

    adminRequest.mockResolvedValueOnce({
      // VICTORY répété : un paquet distribué entre deux lectures décale la
      // page suivante, l'écran ne l'affiche qu'une fois.
      items: [VICTORY, WELCOME],
      nextCursor: null,
      counts: COUNTS,
      source: null,
    });
    fireEvent.click(screen.getByRole('button', { name: t.historyLoadMore }));

    await waitFor(() =>
      expect(screen.getAllByTestId('tcg-pack-history-row')).toHaveLength(3)
    );
    expect(paramsOf(adminRequest.mock.calls[1]).get('cursor')).toBe('CURSOR-1');
    expect(
      screen.queryByRole('button', { name: t.historyLoadMore })
    ).toBeNull();
  });

  it('une lecture en échec s’affiche, sans « aucun paquet »', async () => {
    adminRequest.mockRejectedValueOnce(new Error('Lecture impossible.'));
    renderPanel();

    expect(await screen.findByText('Lecture impossible.')).toBeTruthy();
    expect(screen.queryByText(t.historyEmpty)).toBeNull();
  });
});
