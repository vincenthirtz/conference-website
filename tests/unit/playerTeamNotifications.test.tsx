// @vitest-environment happy-dom
//
// Notifications de l'ÉQUIPE dans l'espace joueuse (scrim accepté, scrim pris
// en compte) :
//   - la liste : titre selon le type, texte rangé, date, pastille « Nouveau »
//     pour les non lues à l'arrivée ; état vide ; erreur ;
//   - le hook : marque lu dès l'affichage (une fois), jamais en inspection,
//     prévient la cloche ; écoute temps réel du salon de l'équipe gérée ;
//   - les cloches : la barre du haut relit sur l'événement ; la cloche
//     publique dit « 1 notification d'équipe » et mène à l'écran.
//
// Côté API (conference-api) : tests/unit/teamNotifications.test.ts prouve que
// personne d'autre que les membres de l'équipe ne les voit.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  act,
  cleanup,
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

const team = vi.fn();
const markTeamRead = vi.fn();
vi.mock('@/features/player/notifications/client', () => ({
  notificationsUrls: {
    counters: '/api/player/notifications',
    team: '/api/player/notifications/team',
    prefs: '/api/player/push/prefs',
  },
  notificationsClient: {
    team: (...a: unknown[]) => team(...a),
    markTeamRead: (...a: unknown[]) => markTeamRead(...a),
    counters: vi.fn(async () => ({})),
  },
}));

const realtime = vi.fn();
vi.mock('@/hooks/useRealtimeChannel', () => ({
  useRealtimeChannel: (opts: unknown) => realtime(opts),
}));

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

import { PlayerAreaProvider } from '@/components/player/PlayerAreaContext';
import { ActiveTeamProvider } from '@/components/player/ActiveTeamContext';
import TeamNotificationsList from '@/features/player/notifications/ui/TeamNotificationsList';
import { useTeamNotifications } from '@/features/player/notifications/hooks/useTeamNotifications';
import type {
  TeamNotification,
  TeamNotificationsPayload,
} from '@/features/player/notifications/schemas';
import { usePlayerNotificationCount } from '@/components/Navbar/PlayerTopBarBell';
import PlayerBell from '@/components/Navbar/PlayerBell';
import {
  PLAYER_NOTIFICATIONS_CHANGED,
  announcePlayerNotificationsChanged,
} from '@/utils/player/notificationsEvents';
import nsPlayerNotifications from '@/lib/i18n/locales/fr/playerNotifications';

const t = nsPlayerNotifications.fr;
const TEAM = '0a000000-0000-4000-8000-00000000000a';

const ACK: TeamNotification = {
  id: 'n-ack',
  kind: 'scrim_acknowledged',
  text: "Votre demande de scrim contre Les Invitées a été prise en compte : l'organisation se fait directement entre les équipes.",
  createdAt: '2026-11-05T14:00:00.000Z',
  read: false,
  fromTeamName: 'Les Demandeuses',
  targetTeamName: 'Les Invitées',
};
const ACC: TeamNotification = {
  id: 'n-acc',
  kind: 'scrim_accepted',
  text: 'Scrim accepté : Les Demandeuses vs Les Invitées',
  createdAt: '2026-11-03T10:00:00.000Z',
  read: true,
  fromTeamName: 'Les Demandeuses',
  targetTeamName: 'Les Invitées',
};

const payload = (
  notifications: TeamNotification[]
): TeamNotificationsPayload => ({
  teamId: TEAM,
  notifications,
  unread: notifications.filter((n) => !n.read).length,
});

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

beforeEach(() => {
  team.mockReset();
  markTeamRead.mockReset();
  realtime.mockReset();
  adminFetchJson.mockReset();
  markTeamRead.mockResolvedValue({ marked: 1 });
  window.localStorage.clear();
});
afterEach(cleanup);

describe('TeamNotificationsList', () => {
  it('une carte par notification : titre du type, texte, date ; « Nouveau » seulement si fraîche', () => {
    render(
      <TeamNotificationsList
        notifications={[ACK, ACC]}
        fresh={new Set(['n-ack'])}
      />
    );
    const cards = screen.getAllByTestId('team-notification');
    expect(cards).toHaveLength(2);
    expect(cards[0].textContent).toContain(t.teamKindLabels.scrim_acknowledged);
    expect(cards[0].textContent).toContain(ACK.text);
    expect(cards[0].textContent).toContain(t.teamNew);
    expect(cards[0].querySelector('time')?.getAttribute('dateTime')).toBe(
      ACK.createdAt
    );
    expect(cards[1].textContent).toContain(t.teamKindLabels.scrim_accepted);
    expect(cards[1].textContent).not.toContain(t.teamNew);
  });

  it('type inconnu : titre générique', () => {
    render(
      <TeamNotificationsList
        notifications={[{ ...ACC, kind: 'future_kind' }]}
        fresh={new Set()}
      />
    );
    expect(screen.getByText(t.teamKindFallback)).toBeTruthy();
  });

  it('vide : le dit', () => {
    render(<TeamNotificationsList notifications={[]} fresh={new Set()} />);
    expect(screen.getByText(t.teamEmpty)).toBeTruthy();
  });

  it('erreur : une alerte', () => {
    render(
      <TeamNotificationsList notifications={[]} fresh={new Set()} error />
    );
    expect(screen.getByRole('alert').textContent).toBe(t.teamLoadError);
  });
});

describe('useTeamNotifications', () => {
  const client = () =>
    new QueryClient({ defaultOptions: { queries: { retry: false } } });

  it('marque lu UNE fois à l’affichage, garde la pastille, prévient la cloche', async () => {
    team.mockResolvedValue(payload([ACK, ACC]));
    const announced = vi.fn();
    window.addEventListener(PLAYER_NOTIFICATIONS_CHANGED, announced);
    const { result } = renderHook(
      () =>
        useTeamNotifications({
          enabled: true,
          readOnly: false,
          realtimeTeamId: null,
        }),
      { wrapper: wrapper(client()) }
    );
    await waitFor(() => expect(markTeamRead).toHaveBeenCalledTimes(1));
    expect(result.current.fresh.has('n-ack')).toBe(true);
    expect(result.current.fresh.has('n-acc')).toBe(false);
    await waitFor(() => expect(announced).toHaveBeenCalledTimes(1));
    window.removeEventListener(PLAYER_NOTIFICATIONS_CHANGED, announced);
  });

  it('inspection (lecture seule) : lit, ne marque rien', async () => {
    team.mockResolvedValue(payload([ACK]));
    const { result } = renderHook(
      () =>
        useTeamNotifications({
          enabled: true,
          readOnly: true,
          realtimeTeamId: null,
        }),
      { wrapper: wrapper(client()) }
    );
    await waitFor(() => expect(result.current.fresh.has('n-ack')).toBe(true));
    expect(markTeamRead).not.toHaveBeenCalled();
  });

  it('tout est déjà lu : aucun marquage', async () => {
    team.mockResolvedValue(payload([ACC]));
    const { result } = renderHook(
      () =>
        useTeamNotifications({
          enabled: true,
          readOnly: false,
          realtimeTeamId: null,
        }),
      { wrapper: wrapper(client()) }
    );
    await waitFor(() => expect(result.current.query.isSuccess).toBe(true));
    expect(markTeamRead).not.toHaveBeenCalled();
  });

  it('temps réel : écoute le salon de l’équipe gérée et relit le fil', async () => {
    team.mockResolvedValue(payload([ACC]));
    renderHook(
      () =>
        useTeamNotifications({
          enabled: true,
          readOnly: false,
          realtimeTeamId: TEAM,
        }),
      { wrapper: wrapper(client()) }
    );
    await waitFor(() => expect(team).toHaveBeenCalledTimes(1));
    const opts = realtime.mock.calls.at(-1)?.[0] as {
      enabled: boolean;
      table: string;
      filter: string;
      onChange: () => void;
    };
    expect(opts).toMatchObject({
      enabled: true,
      table: 'demandes',
      filter: `team_id=eq.${TEAM}`,
    });
    act(() => opts.onChange());
    await waitFor(() => expect(team).toHaveBeenCalledTimes(2));
  });

  it('sans équipe gérée : pas d’écoute temps réel', async () => {
    team.mockResolvedValue(payload([]));
    renderHook(
      () =>
        useTeamNotifications({
          enabled: true,
          readOnly: false,
          realtimeTeamId: null,
        }),
      { wrapper: wrapper(client()) }
    );
    await waitFor(() => expect(team).toHaveBeenCalled());
    expect(realtime.mock.calls.at(-1)?.[0]).toMatchObject({ enabled: false });
  });
});

describe('cloches', () => {
  it('barre du haut : relit le compteur dès que l’écran annonce un changement', async () => {
    adminFetchJson
      .mockResolvedValueOnce({ total: 2 })
      .mockResolvedValueOnce({ total: 1 });
    const { result } = renderHook(() => usePlayerNotificationCount(), {
      wrapper: ({ children }) => (
        <ActiveTeamProvider>{children}</ActiveTeamProvider>
      ),
    });
    await waitFor(() => expect(result.current).toBe(2));
    act(() => announcePlayerNotificationsChanged());
    await waitFor(() => expect(result.current).toBe(1));
  });

  it('cloche publique : « 1 notification d’équipe », et mène à l’écran Notifications', async () => {
    adminFetchJson.mockResolvedValue({
      hasTeam: true,
      isCaptain: false,
      captainTeamId: null,
      memberTeamId: TEAM,
      unreadMessages: 0,
      pendingScrims: 0,
      pendingJoinRequests: 0,
      checkinPending: 0,
      teamNotifications: 1,
      total: 1,
    });
    render(<PlayerBell />);
    await waitFor(() =>
      expect(screen.getByRole('link').getAttribute('title')).toContain(
        '1 notification d’équipe'
      )
    );
    expect(screen.getByRole('link').getAttribute('href')).toBe(
      '/player/notifications'
    );
  });
});
