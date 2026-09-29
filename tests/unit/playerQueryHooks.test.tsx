// @vitest-environment happy-dom
//
// Cache joueuse (lot P5) : la clé porte le sujet inspecté et l'équipe active —
// en changer relit ; les gestes portent `?as=…&act=1` en act-as ; une 4xx ne
// se réessaie pas ; sous l'admin, le client déjà monté est réutilisé.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, renderHook, waitFor } from '@testing-library/react';
import {
  QueryClient,
  QueryClientProvider,
  useQueryClient,
} from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('@/utils/supabaseBrowser', () => ({
  supabaseClient: {
    auth: {
      getSession: async () => ({ data: { session: { access_token: 't' } } }),
    },
  },
}));
vi.mock('next/router', () => ({
  default: { asPath: '/player', replace: vi.fn(async () => true) },
}));

import { PlayerAreaProvider } from '../../components/player/PlayerAreaContext';
import {
  ActiveTeamProvider,
  useActiveTeam,
} from '../../components/player/ActiveTeamContext';
import {
  PlayerQueryProvider,
  getPlayerQueryClient,
  withPlayerQuery,
} from '../../features/player/_shared/query';
import { useProgression } from '../../features/player/progression/hooks/useProgression';
import { useToggleJoinable } from '../../features/player/teamSettings/hooks/useTeamSettings';

const SUBJECT = '4f1c2a7e-0b6d-4e3a-9c1f-2a3b4c5d6e7f';
const OTHER = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';

let urls: string[] = [];
let status = 200;

beforeEach(() => {
  urls = [];
  status = 200;
  window.localStorage.clear();
  globalThis.fetch = vi.fn(async (url: string) => {
    urls.push(url);
    const body =
      status === 200
        ? { rating: 1500, milestones: [], is_joinable: true }
        : { error: 'Interdit', code: 'forbidden' };
    return new Response(JSON.stringify(body), { status });
  }) as unknown as typeof fetch;
});
afterEach(cleanup);

function freshClient() {
  return new QueryClient({
    defaultOptions: { queries: { retryDelay: 0 } },
  });
}

function wrapper(client: QueryClient, subjectId: string | null, actAs = false) {
  return function W({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>
        <ActiveTeamProvider>
          <PlayerAreaProvider subjectId={subjectId} actAs={actAs}>
            {children}
          </PlayerAreaProvider>
        </ActiveTeamProvider>
      </QueryClientProvider>
    );
  };
}

describe('useProgression — clé sujet + équipe', () => {
  it('changer de sujet inspecté relit, sous le nouveau ?as=', async () => {
    const client = freshClient();
    let subject = SUBJECT;
    const { result, rerender } = renderHook(() => useProgression(), {
      wrapper: ({ children }) => wrapper(client, subject)({ children }),
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(urls).toEqual([`/api/player/progression?as=${SUBJECT}`]);

    subject = OTHER;
    rerender();
    await waitFor(() => expect(urls).toHaveLength(2));
    expect(urls[1]).toBe(`/api/player/progression?as=${OTHER}`);
  });

  it('changer d’équipe active relit, avec ?teamId=', async () => {
    const client = freshClient();
    const { result } = renderHook(
      () => ({ q: useProgression(), team: useActiveTeam() }),
      { wrapper: wrapper(client, null) }
    );
    await waitFor(() => expect(result.current.q.isSuccess).toBe(true));
    const before = urls.length;
    result.current.team.setActiveTeamId('team-b');
    await waitFor(() => expect(urls.length).toBe(before + 1));
    expect(urls.at(-1)).toBe('/api/player/progression?teamId=team-b');
  });

  it('une 4xx ne se réessaie pas', async () => {
    status = 403;
    const client = freshClient();
    const { result } = renderHook(() => useProgression(), {
      wrapper: wrapper(client, null),
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(urls).toHaveLength(1);
  });
});

describe('gestes équipe', () => {
  it('act-as : la bascule porte ?as=…&act=1', async () => {
    const client = freshClient();
    const { result } = renderHook(() => useToggleJoinable(), {
      wrapper: wrapper(client, SUBJECT, true),
    });
    await result.current.mutateAsync({ joinable: false });
    expect(urls).toEqual([`/api/teams/toggle-joinable?as=${SUBJECT}&act=1`]);
  });

  it('joueuse elle-même : URL nue', async () => {
    const client = freshClient();
    const { result } = renderHook(() => useToggleJoinable(), {
      wrapper: wrapper(client, null),
    });
    await result.current.mutateAsync({});
    expect(urls).toEqual(['/api/teams/toggle-joinable']);
  });
});

describe('PlayerQueryProvider', () => {
  it('réutilise le client déjà monté (inspection sous l’admin)', () => {
    const admin = freshClient();
    let seen: QueryClient | null = null;
    function Probe() {
      seen = useQueryClient();
      return null;
    }
    render(
      <QueryClientProvider client={admin}>
        <PlayerQueryProvider>
          <Probe />
        </PlayerQueryProvider>
      </QueryClientProvider>
    );
    expect(seen).toBe(admin);
  });

  it('page autonome : client joueuse ; `seo` recopié sur l’enveloppe', () => {
    let seen: QueryClient | null = null;
    function Page() {
      seen = useQueryClient();
      return null;
    }
    Page.seo = { title: 'x' };
    const Wrapped = withPlayerQuery(Page);
    expect(Wrapped.seo).toEqual({ title: 'x' });
    render(<Wrapped />);
    expect(seen).toBe(getPlayerQueryClient());
  });
});
