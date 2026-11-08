// @vitest-environment happy-dom
//
// Cloches de la joueuse avec la boîte de notifications durable (lot 4,
// docs/PLAN-interactions-joueuses.md) : pastille = actions en attente + non
// lues de la boîte, sans compter deux fois les notifications d'équipe (déjà
// dans la boîte) ; repli sur le total d'avant sans `inboxUnread` ; libellé
// accessible qui dit les deux ; relecture après un marquage sur l'écran.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  act,
  cleanup,
  render,
  renderHook,
  screen,
  waitFor,
} from '@testing-library/react';

const adminFetchJson = vi.fn();
vi.mock('@/hooks/useAdminFetch', () => ({
  useAdminFetch: () => ({ adminFetchJson }),
}));
vi.mock('@/hooks/useDocumentVisible', () => ({
  useDocumentVisible: () => true,
}));
vi.mock('@/hooks/useAuthSession', () => ({
  useAuthSession: () => ({ user: { id: 'u1' }, loading: false }),
}));
vi.mock('@/hooks/useRealtimeChannel', () => ({
  useRealtimeChannel: () => {},
}));

import { ActiveTeamProvider } from '@/components/player/ActiveTeamContext';
import { playerBellCounts } from '@/components/Navbar/playerBellCounts';
import PlayerTopBarBell, {
  bellLabel,
  usePlayerNotificationCounts,
} from '@/components/Navbar/PlayerTopBarBell';
import PlayerBell from '@/components/Navbar/PlayerBell';
import { PLAYER_NOTIFICATIONS_CHANGED } from '@/utils/player/notificationsEvents';
import nsPlayerTopBar from '@/lib/i18n/locales/fr/playerTopBar';

const tTop = nsPlayerTopBar.fr;
const TEAM_A = '0a000000-0000-4000-8000-00000000000a';

beforeEach(() => {
  adminFetchJson.mockReset();
  window.localStorage.clear();
});
afterEach(cleanup);

describe('playerBellCounts', () => {
  it('actions en attente + non lues, équipe pas comptée deux fois', () => {
    expect(
      playerBellCounts({ total: 4, teamNotifications: 1, inboxUnread: 2 })
    ).toEqual({ pending: 3, unread: 2, total: 5, hasInbox: true });
    expect(playerBellCounts({ total: 0, inboxUnread: 0 })).toEqual({
      pending: 0,
      unread: 0,
      total: 0,
      hasInbox: true,
    });
  });

  it('repli sans `inboxUnread` : le total d’avant', () => {
    expect(playerBellCounts({ total: 3, teamNotifications: 1 })).toEqual({
      pending: 3,
      unread: 0,
      total: 3,
      hasInbox: false,
    });
  });
});

describe('bellLabel', () => {
  it('dit les deux comptes ; sans non lue, le libellé d’avant', () => {
    expect(
      bellLabel({ pending: 3, unread: 2, total: 5, hasInbox: true }, tTop)
    ).toBe('Notifications (3 actions, 2 nouvelles notifications)');
    expect(
      bellLabel({ pending: 0, unread: 1, total: 1, hasInbox: true }, tTop)
    ).toBe('Notifications (1 nouvelle notification)');
    expect(
      bellLabel({ pending: 1, unread: 1, total: 2, hasInbox: true }, tTop)
    ).toBe('Notifications (1 action, 1 nouvelle notification)');
    expect(
      bellLabel({ pending: 3, unread: 0, total: 3, hasInbox: false }, tTop)
    ).toBe('Notifications (3 en attente)');
    expect(bellLabel(null, tTop)).toBe(tTop.bellEmpty);
  });
});

describe('cloches', () => {
  it('barre du haut : pastille et libellé, relus après un marquage', async () => {
    adminFetchJson
      .mockResolvedValueOnce({ total: 4, teamNotifications: 1, inboxUnread: 2 })
      .mockResolvedValueOnce({
        total: 3,
        teamNotifications: 0,
        inboxUnread: 0,
      });
    render(
      <ActiveTeamProvider>
        <PlayerTopBarBell />
      </ActiveTeamProvider>
    );
    const link = await screen.findByRole('link', {
      name: 'Notifications (3 actions, 2 nouvelles notifications)',
    });
    expect(link.textContent).toBe('5');
    act(() => {
      window.dispatchEvent(new Event(PLAYER_NOTIFICATIONS_CHANGED));
    });
    await screen.findByRole('link', { name: 'Notifications (3 en attente)' });
  });

  it('barre du haut sans boîte (API d’avant) : le total d’avant', async () => {
    adminFetchJson.mockResolvedValue({ total: 2 });
    const { result } = renderHook(() => usePlayerNotificationCounts(), {
      wrapper: ({ children }) => (
        <ActiveTeamProvider>{children}</ActiveTeamProvider>
      ),
    });
    await waitFor(() =>
      expect(result.current).toEqual({
        pending: 2,
        unread: 0,
        total: 2,
        hasInbox: false,
      })
    );
  });

  it('cloche publique : « 2 nouvelles notifications », sans double compte, mène à l’écran', async () => {
    adminFetchJson.mockResolvedValue({
      hasTeam: true,
      isCaptain: false,
      captainTeamId: null,
      memberTeamId: TEAM_A,
      unreadMessages: 0,
      pendingScrims: 0,
      pendingJoinRequests: 0,
      checkinPending: 0,
      teamNotifications: 1,
      inboxUnread: 2,
      total: 1,
    });
    render(<PlayerBell />);
    await waitFor(() =>
      expect(screen.getByRole('link').getAttribute('title')).toBe(
        '2 nouvelles notifications'
      )
    );
    expect(screen.getByRole('link').getAttribute('href')).toBe(
      '/player/notifications'
    );
    expect(screen.getByRole('link').textContent).toBe('2');
  });

  it('cloche publique : relit après un marquage sur l’écran', async () => {
    adminFetchJson
      .mockResolvedValueOnce({ total: 0, inboxUnread: 1 })
      .mockResolvedValueOnce({ total: 0, inboxUnread: 0 });
    render(<PlayerBell />);
    await waitFor(() => expect(screen.getByRole('link').textContent).toBe('1'));
    act(() => {
      window.dispatchEvent(new Event(PLAYER_NOTIFICATIONS_CHANGED));
    });
    await waitFor(() => expect(screen.getByRole('link').textContent).toBe(''));
  });
});
