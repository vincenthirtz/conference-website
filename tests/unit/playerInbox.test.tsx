// @vitest-environment happy-dom
//
// Boîte de notifications durable de la joueuse (lot 4,
// docs/PLAN-interactions-joueuses.md) :
//   - l'Historique : personnelles + équipe, famille, point + « Nouveau »,
//     lien d'action (interne seulement), équipe nommée en multi-équipes,
//     « Tout marquer comme lu », « Voir plus » ; vide ; erreur ;
//   - le hook : marque lu à l'affichage (une fois, par paquets de 100),
//     jamais en inspection ; pagination `before=` ; API d'avant le lot 4
//     (404, autre forme, panne) → repli ; « tout marquer ».
// Les cloches : tests/unit/playerInboxBell.test.tsx.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('next/router', () => ({
  default: {
    asPath: '/player/notifications',
    replace: vi.fn(async () => true),
  },
  useRouter: () => ({
    asPath: '/player/notifications',
    query: {},
    push: vi.fn(),
  }),
}));

const inbox = vi.fn();
const markInboxRead = vi.fn();
vi.mock('@/features/player/notifications/client', () => ({
  notificationsUrls: {
    counters: '/api/player/notifications',
    team: '/api/player/notifications/team',
    prefs: '/api/player/push/prefs',
    inbox: '/api/player/inbox',
    inboxRead: '/api/player/inbox/read',
  },
  notificationsClient: {
    inbox: (...a: unknown[]) => inbox(...a),
    markInboxRead: (...a: unknown[]) => markInboxRead(...a),
    counters: vi.fn(async () => ({})),
  },
}));

const realtime = vi.fn();
vi.mock('@/hooks/useRealtimeChannel', () => ({
  useRealtimeChannel: (opts: unknown) => realtime(opts),
}));

import { PlayerAreaProvider } from '@/components/player/PlayerAreaContext';
import { ActiveTeamProvider } from '@/components/player/ActiveTeamContext';
import InboxList from '@/features/player/notifications/ui/InboxList';
import {
  inboxKindGroup,
  relativeDate,
  safeInternalPath,
} from '@/features/player/notifications/ui/inboxModel';
import {
  chunk,
  useInbox,
} from '@/features/player/notifications/hooks/useInbox';
import {
  type InboxItem,
  type InboxPayload,
  isInboxPayload,
} from '@/features/player/notifications/inboxTypes';
import { ApiHttpError } from '@/utils/http/authedRequest';
import { PLAYER_NOTIFICATIONS_CHANGED } from '@/utils/player/notificationsEvents';
import nsPlayerNotifications from '@/lib/i18n/locales/fr/playerNotifications';

const t = nsPlayerNotifications.fr;
const TEAM_A = '0a000000-0000-4000-8000-00000000000a';
const TEAM_B = '0b000000-0000-4000-8000-00000000000b';
const TOURNAMENT = '0c000000-0000-4000-8000-00000000000c';
const NOW = Date.parse('2026-11-08T12:00:00.000Z');

const MATCH: InboxItem = {
  id: 'p-match',
  source: 'personal',
  kind: 'match.scheduled',
  title: 'Match planifié',
  body: 'Phenix contre Aurora, jeudi 21 h.',
  url: '/player/match/m1',
  teamId: TEAM_A,
  createdAt: '2026-11-08T09:00:00.000Z',
  readAt: null,
};
const JOIN: InboxItem = {
  id: 'p-join',
  source: 'personal',
  kind: 'team.join.decided',
  title: 'Réponse à ta candidature',
  body: 'Aurora a accepté ta demande.',
  url: null,
  teamId: TEAM_B,
  createdAt: '2026-11-01T09:00:00.000Z',
  readAt: '2026-11-02T09:00:00.000Z',
};
const RULES_TEAM: InboxItem = {
  id: 't-rules',
  source: 'team',
  kind: 'rules_validation_requested',
  title: 'Règlement à valider',
  body: 'Le règlement de OWWC 2027 attend ta validation.',
  url: null,
  teamId: TEAM_A,
  createdAt: '2026-11-07T09:00:00.000Z',
  readAt: null,
  team: {
    id: 'n-rules',
    kind: 'rules_validation_requested',
    text: 'Le règlement de OWWC 2027 attend ta validation.',
    createdAt: '2026-11-07T09:00:00.000Z',
    read: false,
    fromTeamName: null,
    targetTeamName: 'Phenix',
    opponentTeamName: null,
    scrimDate: null,
    tournamentId: TOURNAMENT,
    tournamentName: 'OWWC 2027',
  },
};

const page = (
  items: InboxItem[],
  over: Partial<InboxPayload> = {}
): InboxPayload => ({
  items,
  nextBefore: null,
  unreadCount: items.filter((i) => !i.readAt).length,
  ...over,
});

const listProps = {
  fresh: new Set<string>(),
  olderUnread: 0,
  teamNames: null,
  readOnly: false,
  hasMore: false,
  loadingMore: false,
  moreError: false,
  onLoadMore: () => {},
  onMarkAll: () => {},
  markingAll: false,
  now: NOW,
};

function wrapper(client: QueryClient, subjectId: string | null = null) {
  return function W({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        <ActiveTeamProvider>
          <PlayerAreaProvider subjectId={subjectId} actAs={false}>
            {children}
          </PlayerAreaProvider>
        </ActiveTeamProvider>
      </QueryClientProvider>
    );
  };
}
const client = () =>
  new QueryClient({ defaultOptions: { queries: { retry: false } } });

beforeEach(() => {
  inbox.mockReset();
  markInboxRead.mockReset();
  realtime.mockReset();
  markInboxRead.mockResolvedValue({ ok: true, unreadCount: 0 });
  window.localStorage.clear();
});
afterEach(cleanup);

describe('inboxModel', () => {
  it('famille : match, équipe, scrim, règlement, autre', () => {
    expect(inboxKindGroup({ kind: 'match.scheduled' })).toBe('match');
    expect(inboxKindGroup({ kind: 'checkin.opened' })).toBe('match');
    expect(inboxKindGroup({ kind: 'team.join.decided' })).toBe('team');
    expect(inboxKindGroup({ kind: 'scrim.confirmed' })).toBe('scrim');
    expect(inboxKindGroup({ kind: 'scrim_accepted' })).toBe('scrim');
    expect(inboxKindGroup({ kind: 'rules_reminder' })).toBe('rules');
    expect(inboxKindGroup({ kind: 'news.published' })).toBe('other');
  });

  it('lien interne seulement', () => {
    expect(safeInternalPath('/player/match/m1')).toBe('/player/match/m1');
    expect(safeInternalPath('https://evil.example')).toBeNull();
    expect(safeInternalPath('//evil.example')).toBeNull();
    expect(safeInternalPath('javascript:alert(1)')).toBeNull();
    expect(safeInternalPath(null)).toBeNull();
  });

  it('date relative dans la langue, vide si illisible', () => {
    expect(relativeDate('2026-11-08T09:00:00.000Z', 'fr-FR', NOW)).toBe(
      'il y a 3 heures'
    );
    expect(relativeDate('2026-11-07T11:00:00.000Z', 'en-GB', NOW)).toBe(
      'yesterday'
    );
    expect(relativeDate('2026-11-08T11:59:50.000Z', 'en-GB', NOW)).toBe(
      'this minute'
    );
    expect(relativeDate('pas une date', 'fr-FR', NOW)).toBe('');
  });

  it('forme du contrat', () => {
    expect(isInboxPayload(page([MATCH]))).toBe(true);
    expect(isInboxPayload({})).toBe(false);
    expect(isInboxPayload({ items: [], unreadCount: 'x' })).toBe(false);
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
  });
});

describe('InboxList', () => {
  it('personnelles et équipe mêlées : famille, titre, texte, date, lien', () => {
    render(
      <InboxList
        {...listProps}
        items={[MATCH, RULES_TEAM, JOIN]}
        fresh={new Set(['p-match', 't-rules'])}
      />
    );
    const cards = screen.getAllByTestId('inbox-item');
    expect(cards).toHaveLength(3);

    // Personnelle : titre et texte rangés, famille, lien « Ouvrir ».
    expect(cards[0].textContent).toContain(t.historyGroups.match);
    expect(cards[0].textContent).toContain('Match planifié');
    expect(cards[0].textContent).toContain('Phenix contre Aurora, jeudi 21 h.');
    const time = cards[0].querySelector('time');
    expect(time?.getAttribute('dateTime')).toBe(MATCH.createdAt);
    expect(time?.textContent).toBe('il y a 3 heures');
    expect(time?.getAttribute('title')).toContain('2026');
    const open = cards[0].querySelector('[data-testid="inbox-item-link"]');
    expect(open?.getAttribute('href')).toBe('/player/match/m1');
    expect(open?.textContent).toBe(t.historyOpen);

    // Équipe : le rendu d'avant (phrase composée, lien vers la liseuse).
    expect(cards[1].textContent).toContain(t.historyGroups.rules);
    expect(cards[1].textContent).toContain(
      t.teamKindLabels.rules_validation_requested
    );
    expect(cards[1].textContent).toContain(
      'Le règlement de OWWC 2027 attend ta validation : lis-le jusqu’au bout'
    );
    const rules = cards[1].querySelector(
      '[data-testid="team-notification-rules-link"]'
    );
    expect(rules?.getAttribute('href')).toBe(
      `/player/tournaments/${TOURNAMENT}/reglement`
    );

    // Lue, sans lien : ni « Nouveau » ni bouton.
    expect(cards[2].textContent).toContain(t.historyGroups.team);
    expect(cards[2].textContent).not.toContain(t.teamNew);
    expect(cards[2].querySelector('a')).toBeNull();
  });

  it('non lue : point + « Nouveau » écrit (pas la couleur seule), gardé après le marquage', () => {
    render(
      <InboxList
        {...listProps}
        // Déjà marquée lue côté cache, mais non lue à l'arrivée.
        items={[{ ...MATCH, readAt: '2026-11-08T11:00:00.000Z' }]}
        fresh={new Set(['p-match'])}
      />
    );
    const card = screen.getByTestId('inbox-item');
    expect(card.getAttribute('data-unread')).toBe('true');
    expect(card.textContent).toContain(t.teamNew);
  });

  it('lien externe ignoré', () => {
    render(
      <InboxList
        {...listProps}
        items={[{ ...MATCH, url: 'https://evil.example/x' }]}
      />
    );
    expect(screen.queryByTestId('inbox-item-link')).toBeNull();
  });

  it('multi-équipes : le nom de l’équipe', () => {
    render(
      <InboxList
        {...listProps}
        items={[MATCH, JOIN]}
        teamNames={
          new Map([
            [TEAM_A, 'Phenix'],
            [TEAM_B, 'Aurora'],
          ])
        }
      />
    );
    const cards = screen.getAllByTestId('inbox-item');
    expect(cards[0].textContent).toContain('Équipe Phenix');
    expect(cards[1].textContent).toContain('Équipe Aurora');
  });

  it('« Tout marquer comme lu » et « Voir plus »', () => {
    const onMarkAll = vi.fn();
    const onLoadMore = vi.fn();
    render(
      <InboxList
        {...listProps}
        items={[MATCH]}
        olderUnread={4}
        hasMore
        onMarkAll={onMarkAll}
        onLoadMore={onLoadMore}
      />
    );
    expect(
      screen.getByText('4 notifications non lues plus anciennes.')
    ).toBeTruthy();
    fireEvent.click(screen.getByTestId('inbox-mark-all'));
    expect(onMarkAll).toHaveBeenCalledTimes(1);
    const more = screen.getByTestId('inbox-load-more');
    expect(more.textContent).toBe(t.historyLoadMore);
    fireEvent.click(more);
    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

  it('inspection : pas de « tout marquer »', () => {
    render(
      <InboxList {...listProps} items={[MATCH]} olderUnread={4} readOnly />
    );
    expect(screen.queryByTestId('inbox-mark-all')).toBeNull();
  });

  it('vide, erreur', () => {
    const { unmount } = render(<InboxList {...listProps} items={[]} />);
    expect(screen.getByText(t.historyEmpty)).toBeTruthy();
    unmount();
    render(<InboxList {...listProps} items={[]} error />);
    expect(screen.getByRole('alert').textContent).toBe(t.historyLoadError);
  });
});

describe('useInbox', () => {
  const args = { enabled: true, readOnly: false, realtimeTeamId: null };

  it('marque lues les entrées affichées, UNE fois ; pastille gardée ; cloche prévenue', async () => {
    inbox.mockResolvedValue(page([MATCH, RULES_TEAM, JOIN]));
    const announced = vi.fn();
    window.addEventListener(PLAYER_NOTIFICATIONS_CHANGED, announced);
    const { result, rerender } = renderHook(() => useInbox(args), {
      wrapper: wrapper(client()),
    });
    await waitFor(() => expect(markInboxRead).toHaveBeenCalledTimes(1));
    expect(markInboxRead).toHaveBeenCalledWith({
      ids: ['p-match', 't-rules'],
    });
    expect(result.current.available).toBe(true);
    expect(result.current.unavailable).toBe(false);
    expect(result.current.fresh.has('p-match')).toBe(true);
    expect(result.current.fresh.has('p-join')).toBe(false);
    // Toutes les équipes : jamais `teamId` dans la portée de la lecture.
    expect(inbox.mock.calls[0][0]).toMatchObject({ teamId: null });
    expect(inbox.mock.calls[0][1]).toBe(20);
    expect(inbox.mock.calls[0][2]).toBeNull();
    await waitFor(() => expect(announced).toHaveBeenCalled());
    rerender();
    expect(markInboxRead).toHaveBeenCalledTimes(1);
    window.removeEventListener(PLAYER_NOTIFICATIONS_CHANGED, announced);
  });

  it('plus de 100 non lues : par paquets de 100', async () => {
    const many = Array.from({ length: 130 }, (_, i) => ({
      ...MATCH,
      id: `p-${i}`,
    }));
    inbox.mockResolvedValue(page(many));
    renderHook(() => useInbox(args), { wrapper: wrapper(client()) });
    await waitFor(() => expect(markInboxRead).toHaveBeenCalledTimes(2));
    expect(
      (markInboxRead.mock.calls[0][0] as { ids: string[] }).ids
    ).toHaveLength(100);
    expect(
      (markInboxRead.mock.calls[1][0] as { ids: string[] }).ids
    ).toHaveLength(30);
  });

  it('inspection : lit, ne marque rien', async () => {
    inbox.mockResolvedValue(page([MATCH]));
    const { result } = renderHook(() => useInbox({ ...args, readOnly: true }), {
      wrapper: wrapper(client(), 'subject-1'),
    });
    await waitFor(() => expect(result.current.fresh.has('p-match')).toBe(true));
    expect(markInboxRead).not.toHaveBeenCalled();
    expect(inbox.mock.calls[0][0]).toMatchObject({ subjectId: 'subject-1' });
  });

  it('« Voir plus » : `before=` = le curseur de la page précédente', async () => {
    inbox
      .mockResolvedValueOnce(
        page([JOIN], { nextBefore: '2026-11-01T09:00:00.000Z', unreadCount: 3 })
      )
      .mockResolvedValueOnce(page([{ ...JOIN, id: 'p-old' }]));
    const { result } = renderHook(() => useInbox(args), {
      wrapper: wrapper(client()),
    });
    await waitFor(() => expect(result.current.query.hasNextPage).toBe(true));
    // 3 non lues côté serveur, aucune affichée : 3 plus anciennes.
    expect(result.current.olderUnread).toBe(3);
    await act(async () => {
      await result.current.query.fetchNextPage();
    });
    expect(inbox.mock.calls[1][2]).toBe('2026-11-01T09:00:00.000Z');
    await waitFor(() =>
      expect(result.current.items.map((i) => i.id)).toEqual(['p-join', 'p-old'])
    );
    expect(result.current.query.hasNextPage).toBe(false);
  });

  it('« Tout marquer comme lu » : POST all, cache lu, compteur à 0', async () => {
    inbox.mockResolvedValue(page([JOIN], { nextBefore: 'c1', unreadCount: 5 }));
    const { result } = renderHook(() => useInbox(args), {
      wrapper: wrapper(client()),
    });
    await waitFor(() => expect(result.current.olderUnread).toBe(5));
    act(() => result.current.markAll());
    await waitFor(() =>
      expect(markInboxRead).toHaveBeenCalledWith({ all: true })
    );
    expect(result.current.olderUnread).toBe(0);
  });

  it('API d’avant le lot 4 : 404 → repli, sans erreur', async () => {
    inbox.mockRejectedValue(new ApiHttpError('Not found', 404, null));
    const { result } = renderHook(() => useInbox(args), {
      wrapper: wrapper(client()),
    });
    await waitFor(() => expect(result.current.unavailable).toBe(true));
    expect(result.current.available).toBe(false);
    expect(markInboxRead).not.toHaveBeenCalled();
  });

  it('réponse d’une autre forme → repli', async () => {
    inbox.mockResolvedValue({});
    const { result } = renderHook(() => useInbox(args), {
      wrapper: wrapper(client()),
    });
    await waitFor(() => expect(result.current.unavailable).toBe(true));
  });

  it('panne → repli aussi (la liste d’avant reste lisible)', async () => {
    inbox.mockRejectedValue(new ApiHttpError('Boom', 500, null));
    const { result } = renderHook(() => useInbox(args), {
      wrapper: wrapper(client()),
    });
    // Une 5xx est réessayée deux fois (playerRetry) avant le repli.
    await waitFor(() => expect(result.current.unavailable).toBe(true), {
      timeout: 6000,
    });
  });

  it('temps réel : le salon de l’équipe gérée relit la boîte', async () => {
    inbox.mockResolvedValue(page([JOIN]));
    renderHook(() => useInbox({ ...args, realtimeTeamId: TEAM_A }), {
      wrapper: wrapper(client()),
    });
    await waitFor(() =>
      expect(realtime.mock.calls.at(-1)?.[0]).toMatchObject({ enabled: true })
    );
    const opts = realtime.mock.calls.at(-1)?.[0] as {
      table: string;
      filter: string;
      onChange: () => void;
    };
    expect(opts.table).toBe('demandes');
    expect(opts.filter).toBe(`team_id=eq.${TEAM_A}`);
    act(() => opts.onChange());
    await waitFor(() => expect(inbox).toHaveBeenCalledTimes(2));
  });
});
