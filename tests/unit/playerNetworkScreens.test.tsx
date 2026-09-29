// @vitest-environment happy-dom
//
// Écrans du lot P15 (réseau, notifications) rendus dans le harnais joueuse +
// cache. Garde le comportement visible d'avant la migration ET la règle
// d'inspection : les COMPTEURS suivent le sujet (`?as=`), les préférences et
// le réseau — personnels, opt-in — ne sont ni lus ni montrés au staff.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';
import {
  act,
  cleanup,
  fireEvent,
  screen,
  waitFor,
} from '@testing-library/react';

vi.mock('@/utils/supabaseBrowser', () => ({
  supabaseClient: {
    auth: {
      getSession: async () => ({ data: { session: { access_token: 't' } } }),
    },
  },
}));
vi.mock('next/router', () => ({
  default: { asPath: '/player/notifications', replace: vi.fn() },
  useRouter: () => ({
    asPath: '/player/notifications',
    query: {},
    replace: vi.fn(),
  }),
}));
vi.mock('@/hooks/usePlayerSession', () => ({
  usePlayerSession: () => ({
    user: { id: 'me-0000' },
    token: 't',
    loading: false,
    ready: true,
  }),
}));
vi.mock('@/hooks/useManagedTeam', () => ({
  useManagedTeam: () => ({ data: null, loading: false }),
}));
// Cartes qui portent leur propre lecture : hors sujet ici.
vi.mock('@/components/shared/PushOptIn', () => ({ default: () => null }));
vi.mock('@/components/player/InvitationsSection', () => ({
  default: () => null,
}));

import NotificationsScreen from '../../features/player/notifications/ui/NotificationsScreen';
import DiscoveryScreen from '../../features/player/network/ui/DiscoveryScreen';
import DiscoverySettingsPanel from '../../features/player/network/ui/DiscoverySettingsPanel';
import {
  getPlayerQueryClient,
  PlayerQueryProvider,
} from '../../features/player/_shared/query';
import { renderPlayer } from './__helpers__/playerHarness';

const SUBJECT = '9b2e4c1a-3d5f-4a6b-8c7d-1e2f3a4b5c6d';

type Call = { url: string; method: string; body: unknown; headers: Headers };
let calls: Call[] = [];

const COUNTERS = {
  hasTeam: true,
  isCaptain: true,
  isManager: false,
  captainTeamId: 't1',
  memberTeamId: 't1',
  unreadMessages: 2,
  pendingScrims: 0,
  pendingJoinRequests: 0,
  pendingInvites: 0,
  checkinPending: 1,
  pendingPlannings: 0,
  total: 3,
};
const PREFS = {
  push: { 'match.starting': true },
  email: { 'match.starting': false },
  broadcastEmail: true,
};
const CARD = {
  discoverable: false,
  displayName: null,
  avatarUrl: null,
  tagline: null,
  showRatings: true,
  showTeams: true,
  optedInAt: null,
};
const NOVA = {
  authUserId: 'disco-user-1',
  displayName: 'Nova Striker',
  avatarUrl: null,
  tagline: 'Main support',
  discordUsername: 'nova',
  teams: [{ name: 'Aurora', slug: 'aurora' }],
  isFollowing: false,
  followerCount: 3,
};

function reply(url: string, method: string, body: any): unknown {
  if (url.startsWith('/api/player/notifications')) return COUNTERS;
  if (url.startsWith('/api/player/push/prefs')) {
    if (method === 'PUT') {
      return {
        ...PREFS,
        [body.channel]: { ...PREFS.push, [body.eventType]: body.enabled },
      };
    }
    return PREFS;
  }
  if (url.startsWith('/api/player/discovery/search')) {
    return { players: [NOVA], total: 1, limit: 24, offset: 0 };
  }
  if (url.startsWith('/api/player/discovery')) {
    return method === 'PUT' ? { ...CARD, ...body } : CARD;
  }
  return {};
}

beforeEach(() => {
  calls = [];
  globalThis.fetch = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? 'GET';
    const body = init?.body ? JSON.parse(String(init.body)) : null;
    calls.push({ url, method, body, headers: new Headers(init?.headers) });
    return new Response(JSON.stringify(reply(url, method, body)), {
      status: 200,
    });
  }) as unknown as typeof fetch;
});
afterEach(() => {
  cleanup();
  // Le client joueuse est un singleton navigateur : un test ne lit pas le
  // cache du précédent.
  getPlayerQueryClient().clear();
});

function render(ui: ReactElement, scope = {}) {
  return renderPlayer(<PlayerQueryProvider>{ui}</PlayerQueryProvider>, scope);
}

describe('Notifications (Fil)', () => {
  it('soi : compteurs actionnables + préférences, interrupteur idempotent', async () => {
    render(<NotificationsScreen />);
    const link = await screen.findByRole('link', { name: /Messages non lus/ });
    expect(link.getAttribute('href')).toBe('/player/messages');
    expect(
      screen.getByRole('link', { name: /Check-in à valider/ })
    ).toBeTruthy();
    expect(screen.queryByRole('link', { name: /Demandes de scrim/ })).toBe(
      null
    );

    const toggle = await screen.findByRole('switch', {
      name: 'Push — Match imminent',
    });
    expect(toggle.getAttribute('aria-checked')).toBe('true');
    await act(async () => {
      fireEvent.click(toggle);
    });
    await screen.findByText('Préférence enregistrée.');
    const put = calls.find((c) => c.method === 'PUT');
    expect(put?.url).toBe('/api/player/push/prefs');
    expect(put?.body).toEqual({
      eventType: 'match.starting',
      channel: 'push',
      enabled: false,
    });
    expect(put?.headers.get('Idempotency-Key')).toBeTruthy();
    // Aucune portée sur les routes « soi ».
    expect(calls.every((c) => !c.url.includes('as='))).toBe(true);
  });

  it('inspection : compteurs du SUJET, préférences ni lues ni montrées', async () => {
    render(<NotificationsScreen />, { subjectId: SUBJECT, readOnly: true });
    await screen.findByRole('link', { name: /Messages non lus/ });
    const counters = calls.find((c) =>
      c.url.startsWith('/api/player/notifications')
    );
    expect(counters?.url).toContain(`as=${SUBJECT}`);
    expect(calls.some((c) => c.url.startsWith('/api/player/push/prefs'))).toBe(
      false
    );
    expect(screen.queryByRole('switch')).toBe(null);
  });
});

describe('Réseau (découverte opt-in, jamais inspecté)', () => {
  it('annuaire : ligne de joueuse + interrupteur du bandeau (PUT discoverable)', async () => {
    render(<DiscoveryScreen />);
    const nova = await screen.findByRole('link', { name: /Nova Striker/ });
    expect(nova.getAttribute('href')).toBe('/player/disco-user-1');
    const master = await screen.findByRole('switch', {
      name: 'Activer ma visibilité dans le réseau',
    });
    await act(async () => {
      fireEvent.click(master);
    });
    await waitFor(() =>
      expect(calls.some((c) => c.method === 'PUT')).toBe(true)
    );
    const put = calls.find((c) => c.method === 'PUT');
    expect(put?.url).toBe('/api/player/discovery');
    expect(put?.body).toEqual({ discoverable: true });
    expect(calls.every((c) => !c.url.includes('as='))).toBe(true);
  });

  it('inspection : ni annuaire ni carte, aucune lecture', () => {
    const { container } = render(<DiscoveryScreen />, {
      subjectId: SUBJECT,
      readOnly: true,
    });
    expect(container.querySelector('h1')).toBe(null);
    expect(calls).toEqual([]);
  });

  it('carte du profil : invisible par défaut, l’accroche n’apparaît qu’une fois découvrable', async () => {
    render(<DiscoverySettingsPanel />);
    const master = await screen.findByRole('switch', {
      name: 'Activer ma visibilité dans le réseau',
    });
    expect(master.getAttribute('aria-checked')).toBe('false');
    expect(screen.queryByLabelText('Accroche')).toBe(null);
    await act(async () => {
      fireEvent.click(master);
    });
    await screen.findByText('Préférences enregistrées.');
    expect(screen.getByLabelText('Accroche')).toBeTruthy();
  });
});
