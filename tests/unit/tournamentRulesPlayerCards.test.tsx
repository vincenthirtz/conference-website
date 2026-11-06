// @vitest-environment happy-dom
//
// Règlement à valider — le BANDEAU de l'espace joueuse et la carte de la
// CAPITAINE, contre des réponses-fixtures au contrat de conference-api :
//   GET  /api/tournaments?limit=20                 → tournois publics
//   GET  /api/player/tournaments/[id]/rules        → { required, version, me }
//   GET  /api/player/tournaments/[id]/rules/team   → { complete, validated, total, members }
//   POST /api/player/tournaments/[id]/rules/remind → { notified } | 429 remind_too_soon + retryAt
//
// Ce que ces cas protègent :
//   - le bandeau parle tant que `mustValidate && !accepted`, et seulement là
//     (validé, réglage éteint, hors équipe, tournoi fini : silence) ;
//   - pas une requête quand le bandeau est éteint (inspection, sans équipe) ;
//   - la capitaine voit « Règlement : X/Y validations », qui a validé et
//     quand, qui manque (sans compte compris), et relance — 429 → la date de
//     la prochaine relance possible ;
//   - l'équipe passe par l'équipe ACTIVE (`?teamId=`), jamais une autre.

import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';

vi.mock('@/utils/identityBrowser', () => ({
  identityBrowser: {
    getSession: async () => ({
      data: { session: { access_token: 'player-token' } },
    }),
  },
}));
vi.mock('next/router', () => ({
  default: { asPath: '/player', replace: vi.fn(async () => true) },
  useRouter: () => ({ asPath: '/player', query: {}, push: vi.fn() }),
}));
vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: ReactNode;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import TournamentRulesBanner from '@/features/player/tournamentRules/ui/TournamentRulesBanner';
import TeamRulesCard from '@/features/player/tournamentRules/ui/TeamRulesCard';
import TodoBanner from '@/components/player/TodoBanner';
import type {
  PlayerRulesView,
  TeamRulesView,
} from '@/features/player/tournamentRules/client';
import ns from '@/lib/i18n/locales/fr/playerTournamentRules';

const t = ns.fr;
const OWWC = 't-owwc-2027';
const OTHER = 't-scrim-cup';
const DONE = 't-finished';

const VERSION = {
  id: 'ver-1',
  number: 1,
  fileName: 'reglement.pdf',
  requiresRevalidation: true,
  note: null,
  createdAt: '2026-11-05T10:00:00.000Z',
  pageCount: 4,
};
const me = (over: Partial<NonNullable<PlayerRulesView['me']>> = {}) => ({
  teamId: 'team-alpha',
  teamName: 'Les Alpha',
  role: 'player',
  mustValidate: true,
  accepted: false,
  acceptedAt: null,
  ...over,
});

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

type Call = { url: string; method: string };
let calls: Call[] = [];
let rulesByTournament: Record<string, PlayerRulesView>;
let teamView: TeamRulesView;
let onRemind: () => Response;

const realFetch = globalThis.fetch;
beforeEach(() => {
  calls = [];
  rulesByTournament = {
    [OWWC]: { required: true, version: VERSION, me: me() },
    [OTHER]: { required: false, version: VERSION, me: me() },
  };
  teamView = {
    complete: false,
    validated: 2,
    total: 4,
    members: [
      {
        userId: 'u-1',
        name: 'Ana',
        role: 'player',
        accepted: true,
        acceptedAt: '2026-11-05T19:30:00.000Z',
      },
      {
        userId: 'u-2',
        name: 'Bea',
        role: 'substitute',
        accepted: true,
        acceptedAt: '2026-11-06T08:00:00.000Z',
      },
      {
        userId: 'u-3',
        name: 'Cleo',
        role: 'coach',
        accepted: false,
        acceptedAt: null,
      },
      {
        userId: null,
        name: 'Dana (invitée)',
        role: 'player',
        accepted: false,
        acceptedAt: null,
      },
    ],
  };
  onRemind = () => json({ notified: 1 });
  globalThis.fetch = vi.fn(
    async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const url = String(input);
      const method = (init.method ?? 'GET').toUpperCase();
      calls.push({ url, method });
      if (url.startsWith('/api/tournaments?'))
        return json({
          tournaments: [
            {
              id: OWWC,
              name: 'OWWC 2027',
              status: 'published',
              start_date: null,
            },
            {
              id: OTHER,
              name: 'Scrim Cup',
              status: 'running',
              start_date: null,
            },
            {
              id: DONE,
              name: 'Cup 2026',
              status: 'completed',
              start_date: null,
            },
          ],
        });
      const m = url.match(
        /^\/api\/player\/tournaments\/([^/]+)\/rules(\/[a-z]+)?/
      );
      if (m) {
        const [, id, sub] = m;
        if (sub === '/team') return json(teamView);
        if (sub === '/remind') return onRemind();
        const view = rulesByTournament[id];
        return view ? json(view) : json({ error: 'introuvable' }, 404);
      }
      return json({ error: 'inconnu' }, 404);
    }
  ) as unknown as typeof fetch;
});
afterEach(cleanup);
afterAll(() => {
  globalThis.fetch = realFetch;
});

function withClient(node: ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>{node}</QueryClientProvider>
  );
}

describe('bandeau « Le règlement de <tournoi> attend ta validation »', () => {
  it('parle pour le tournoi qui attend la validation, avec le lien vers la liseuse', async () => {
    withClient(<TournamentRulesBanner enabled />);
    const heading = await screen.findByRole('heading', {
      name: 'Le règlement de OWWC 2027 attend ta validation',
    });
    const section = heading.closest('section') as HTMLElement;
    expect(within(section).getByText(/Les Alpha/)).toBeTruthy();
    expect(
      within(section)
        .getByRole('link', { name: t.bannerCta })
        .getAttribute('href')
    ).toBe(`/player/tournaments/${OWWC}/reglement`);
    // Réglage éteint (Scrim Cup) : rien. Tournoi terminé : pas même lu.
    expect(screen.queryByText(/Scrim Cup/)).toBeNull();
    expect(calls.some((c) => c.url.includes(DONE))).toBe(false);
  });

  it('se tait une fois validé', async () => {
    rulesByTournament[OWWC] = {
      required: true,
      version: VERSION,
      me: me({ accepted: true, acceptedAt: '2026-11-06T10:00:00.000Z' }),
    };
    withClient(<TournamentRulesBanner enabled />);
    await waitFor(() =>
      expect(
        calls.some((c) => c.url === `/api/player/tournaments/${OWWC}/rules`)
      ).toBe(true)
    );
    await act(async () => {});
    expect(screen.queryByTestId('tournament-rules-banner')).toBeNull();
  });

  it('se tait hors équipe engagée, et pour un rôle non concerné', async () => {
    rulesByTournament[OWWC] = { required: true, version: VERSION, me: null };
    rulesByTournament[OTHER] = {
      required: true,
      version: VERSION,
      me: me({ mustValidate: false }),
    };
    withClient(<TournamentRulesBanner enabled />);
    await waitFor(() =>
      expect(
        calls.filter((c) => c.url.startsWith('/api/player/tournaments/'))
      ).toHaveLength(2)
    );
    await act(async () => {});
    expect(screen.queryByTestId('tournament-rules-banner')).toBeNull();
  });

  it('éteint (inspection, sans équipe) : aucune requête', async () => {
    withClient(<TournamentRulesBanner enabled={false} />);
    await act(async () => {});
    expect(calls).toHaveLength(0);
    expect(screen.queryByTestId('tournament-rules-banner')).toBeNull();
  });

  it('monté par le bandeau « à faire » du tableau de bord, même sans autre tâche', async () => {
    withClient(<TodoBanner items={[]} withRules />);
    expect(
      await screen.findByRole('heading', {
        name: 'Le règlement de OWWC 2027 attend ta validation',
      })
    ).toBeTruthy();
  });

  it('le bandeau « à faire » sans `withRules` ne lit rien', async () => {
    withClient(<TodoBanner items={[]} />);
    await act(async () => {});
    expect(calls).toHaveLength(0);
  });
});

describe('carte capitaine « Règlement : X/Y validations »', () => {
  it('le décompte, chaque membre (validé le… / pas encore / sans compte), sur l’équipe active', async () => {
    withClient(
      <TeamRulesCard tournamentId={OWWC} teamId="team-alpha" engaged />
    );
    expect(
      await screen.findByRole('heading', {
        name: 'Règlement : 2/4 validations',
      })
    ).toBeTruthy();
    expect(screen.getByText(t.teamIncomplete)).toBeTruthy();

    const list = screen.getByRole('list', { name: t.teamMembersLabel });
    const rows = within(list).getAllByRole('listitem');
    expect(rows).toHaveLength(4);
    expect(rows[0].textContent).toContain('Ana');
    expect(rows[0].textContent).toContain('Validé le 5 novembre 2026 à 20:30');
    expect(rows[1].textContent).toContain('Remplaçante');
    expect(rows[2].textContent).toContain('Coach');
    expect(rows[2].textContent).toContain(t.memberPending);
    expect(rows[3].textContent).toContain(t.memberNoAccount);

    // L'équipe ACTIVE part avec l'appel capitaine.
    expect(
      calls.some(
        (c) =>
          c.url ===
          `/api/player/tournaments/${OWWC}/rules/team?teamId=team-alpha`
      )
    ).toBe(true);
    // La capitaine elle-même n'a pas validé : le lien vers la liseuse.
    expect(screen.getByText(t.selfPending)).toBeTruthy();
    expect(
      screen.getByRole('link', { name: t.selfCta }).getAttribute('href')
    ).toBe(`/player/tournaments/${OWWC}/reglement`);
  });

  it('« Relancer » : notification aux manquants, le nombre relancé', async () => {
    withClient(
      <TeamRulesCard tournamentId={OWWC} teamId="team-alpha" engaged />
    );
    const button = await screen.findByRole('button', { name: t.remind });
    await act(async () => {
      fireEvent.click(button);
    });
    expect(await screen.findByText('1 membre relancé.')).toBeTruthy();
    const post = calls.find((c) => c.method === 'POST');
    expect(post?.url).toBe(
      `/api/player/tournaments/${OWWC}/rules/remind?teamId=team-alpha`
    );
  });

  it('« Relancer » trop tôt (429 remind_too_soon) : la date de la prochaine relance', async () => {
    onRemind = () =>
      json(
        {
          error: 'Relance déjà envoyée',
          code: 'remind_too_soon',
          retryAt: '2026-11-07T09:15:00.000Z',
        },
        429
      );
    withClient(
      <TeamRulesCard tournamentId={OWWC} teamId="team-alpha" engaged />
    );
    const button = await screen.findByRole('button', { name: t.remind });
    await act(async () => {
      fireEvent.click(button);
    });
    expect(
      await screen.findByText(
        'Relance déjà envoyée. Prochaine relance possible le 7 novembre 2026 à 10:15.'
      )
    ).toBeTruthy();
  });

  it('429 sans date : « moins de 24 h », pas une erreur', async () => {
    onRemind = () => json({ error: 'x', code: 'remind_too_soon' }, 429);
    withClient(
      <TeamRulesCard tournamentId={OWWC} teamId="team-alpha" engaged />
    );
    const button = await screen.findByRole('button', { name: t.remind });
    await act(async () => {
      fireEvent.click(button);
    });
    expect(await screen.findByText(t.remindTooSoonNoDate)).toBeTruthy();
  });

  it('équipe complète : rien à relancer (bouton inactif)', async () => {
    teamView = { ...teamView, complete: true, validated: 4 };
    withClient(
      <TeamRulesCard tournamentId={OWWC} teamId="team-alpha" engaged />
    );
    expect(
      await screen.findByRole('heading', {
        name: 'Règlement : 4/4 validations',
      })
    ).toBeTruthy();
    expect(
      (screen.getByRole('button', { name: t.remind }) as HTMLButtonElement)
        .disabled
    ).toBe(true);
  });

  it('inscription déjà acceptée mais incomplète : signalé à la capitaine', async () => {
    withClient(
      <TeamRulesCard
        tournamentId={OWWC}
        teamId="team-alpha"
        engaged
        registered
      />
    );
    expect(await screen.findByText(t.teamRegisteredIncomplete)).toBeTruthy();
  });

  it('avant l’envoi de l’inscription : ce qui attend l’équipe, sans décompte', async () => {
    withClient(
      <TeamRulesCard tournamentId={OWWC} teamId="team-alpha" engaged={false} />
    );
    expect(await screen.findByText(t.teamBeforeSubmit)).toBeTruthy();
    expect(calls.some((c) => c.url.includes('/rules/team'))).toBe(false);
  });

  it('réglage éteint : la carte se tait', async () => {
    withClient(
      <TeamRulesCard tournamentId={OTHER} teamId="team-alpha" engaged />
    );
    await waitFor(() =>
      expect(
        calls.some((c) => c.url === `/api/player/tournaments/${OTHER}/rules`)
      ).toBe(true)
    );
    await act(async () => {});
    expect(screen.queryByTestId('team-rules-card')).toBeNull();
    expect(calls.some((c) => c.url.includes('/rules/team'))).toBe(false);
  });
});
