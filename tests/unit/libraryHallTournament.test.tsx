// @vitest-environment happy-dom
//
// Women's Library, lot 7 — le tableau du tournoi en cours, dans le hall :
//   * le modèle (pur) : quel tournoi (en cours, sinon le prochain), quelle
//     phase, quel état pour une ligne de match (forfait compris) ;
//   * le panneau, contre un `fetch` SIMULÉ qui rend les réponses des routes
//     publiques (`/api/public/v1/tournaments*`, `/api/overlay/standings`) :
//     match en direct avec son score, prochain match, résultats, forfaits,
//     classement de la phase, arbre, aucun tournoi, lecture ratée ;
//   * l'ouverture : le bouton sous la scène et la zone de la vue ouvrent le
//     même dialogue, Échap le ferme et rend le focus, chaque ouverture relit ;
//   * la frontière de chargement : rien du tableau (panneau, lectures,
//     classement de la landing) dans le premier chargement de /player/library.

import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

vi.mock('next/router', () => ({
  default: { asPath: '/player/library', push: vi.fn() },
  useRouter: () => ({ asPath: '/player/library', query: {}, push: vi.fn() }),
}));

import type { HallClient } from '../../features/player/library/hall/client';
import { HallClientProvider } from '../../features/player/library/hall/clientContext';
import { requestHallSpot } from '../../features/player/library/hall/spotRequests';
import {
  BOARD_STANDINGS_STAGE_TYPES,
  type BoardStageRow,
  type BoardTournamentRow,
  boardMatchState,
  boardStageOf,
  pickBoardTournament,
  stageTables,
  toHubMatch,
} from '../../features/player/library/hall/tournamentBoard';
import { tournamentBoardUrls } from '../../features/player/library/hall/tournamentClient';
import HallExtras from '../../features/player/library/ui/hall/HallExtras';
import nsHall from '../../lib/i18n/locales/fr/playerLibraryHall';
import { format } from '../../lib/i18n/useT';
import type {
  OverlayStandingsResponse,
  OverlayStandingsTableView,
} from '../../utils/overlay/standingsOverlay';
import type { PublicMatch } from '../../utils/public/readMatches';
import { STANDINGS_STAGE_TYPES } from '../../utils/stages/publicStandings';

const t = nsHall.fr.tournament;
const NOW = Date.now();
const MIN = 60_000;
const DAY = 24 * 60 * MIN;
const iso = (deltaMs: number) => new Date(NOW + deltaMs).toISOString();

/* ------------------------------------------------------------ fixtures --- */

const tournament = (
  over: Partial<BoardTournamentRow> & { id: string }
): BoardTournamentRow & { game: string; format: null } => ({
  name: over.id,
  slug: null,
  status: 'running',
  start_date: null,
  end_date: null,
  game: 'overwatch',
  format: null,
  ...over,
});

const RUNNING = tournament({
  id: 't-run',
  name: 'Coupe 2026',
  slug: 'coupe-2026',
  status: 'running',
  start_date: iso(-7 * DAY),
  end_date: iso(30 * DAY),
});
const DONE = tournament({
  id: 't-old',
  name: 'Coupe 2025',
  status: 'completed',
  start_date: iso(-400 * DAY),
});
const NEXT = tournament({
  id: 't-next',
  name: 'Coupe d’hiver',
  status: 'published',
  start_date: iso(20 * DAY),
});

const STAGE_RR: BoardStageRow = {
  id: 's-rr',
  name: 'Saison régulière',
  stage_type: 'round_robin',
  status: 'active',
};
const STAGE_BR: BoardStageRow = {
  id: 's-br',
  name: 'Phase finale',
  stage_type: 'bracket',
  status: 'active',
};

const match = (over: Partial<PublicMatch> & { id: string }): PublicMatch => ({
  stage_id: 's-rr',
  round_number: 1,
  bracket_side: 'none',
  team1_id: 'a',
  team1_name: 'Valkyries',
  team1_logo_url: null,
  team2_id: 'b',
  team2_name: 'Sirènes',
  team2_logo_url: null,
  team1_score: null,
  team2_score: null,
  winner_team_id: null,
  status: 'pending',
  scheduled_at: iso(60 * MIN),
  ...over,
});

const MATCHES: PublicMatch[] = [
  match({
    id: 'm-live',
    status: 'ongoing',
    team1_score: 2,
    team2_score: 1,
    scheduled_at: iso(-30 * MIN),
  }),
  match({
    id: 'm-next',
    team1_id: 'c',
    team1_name: 'Orchidées',
    team2_id: 'd',
    team2_name: 'Comètes',
    scheduled_at: iso(DAY),
  }),
  match({
    id: 'm-done',
    status: 'finished',
    team1_score: 3,
    team2_score: 1,
    winner_team_id: 'a',
    scheduled_at: iso(-3 * DAY),
  }),
  // Forfait avec un score : le score se montre.
  match({
    id: 'm-wo',
    status: 'walkover',
    team1_id: 'c',
    team1_name: 'Orchidées',
    team1_score: 2,
    team2_score: 0,
    winner_team_id: 'c',
    scheduled_at: iso(-2 * DAY),
  }),
  // Forfait à 0 - 0 : ce n'est pas un score, la gagnante le dit.
  match({
    id: 'm-wo-blank',
    status: 'walkover',
    team1_id: 'd',
    team1_name: 'Comètes',
    team2_id: 'a',
    team2_name: 'Valkyries',
    winner_team_id: 'a',
    scheduled_at: iso(-DAY),
  }),
];

const row = (
  rank: number,
  id: string,
  name: string,
  played: number,
  points: number,
  mapDiff: number
) => ({
  rank,
  team: { id, name, shortName: null, logoUrl: null },
  played,
  wins: Math.floor(points / 3),
  losses: played - Math.floor(points / 3),
  draws: 0,
  points,
  mapDiff,
  form: [],
  disqualified: false,
});

const TABLE_RR: OverlayStandingsTableView = {
  key: 's-rr',
  stageName: 'Saison régulière',
  groupKey: null,
  rows: [row(1, 'a', 'Valkyries', 3, 9, 5), row(2, 'c', 'Orchidées', 2, 3, -1)],
};

const STANDINGS: OverlayStandingsResponse = {
  tables: [TABLE_RR],
  qualifiers: 0,
  tournament: {
    id: 't-run',
    slug: 'coupe-2026',
    name: 'Coupe 2026',
    shortName: null,
    game: 'overwatch',
  },
  branding: null,
  serverTime: iso(0),
};

/* ------------------------------------------------------- fetch simulé --- */

type Routes = Record<string, { status?: number; body: unknown }>;
let routes: Routes = {};
let calls: string[] = [];
const realFetch = globalThis.fetch;

const runningRoutes = (over: Routes = {}): Routes => ({
  [tournamentBoardUrls.list]: { body: { data: [RUNNING, DONE, NEXT] } },
  [tournamentBoardUrls.detail('t-run')]: {
    body: { data: { ...RUNNING, stages: [STAGE_RR] } },
  },
  [tournamentBoardUrls.matches('t-run')]: { body: { data: MATCHES } },
  [tournamentBoardUrls.standings('t-run')]: { body: STANDINGS },
  ...over,
});

beforeEach(() => {
  calls = [];
  routes = runningRoutes();
  globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    calls.push(url);
    const hit = routes[url];
    if (!hit)
      return new Response(JSON.stringify({ error: 'not found' }), {
        status: 404,
      });
    return new Response(JSON.stringify(hit.body), {
      status: hit.status ?? 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as unknown as typeof fetch;
});

afterEach(() => {
  cleanup();
  globalThis.fetch = realFetch;
});

function makeHallClient(): HallClient {
  return {
    commonRoom: vi.fn(async (kind: 'hall') => ({ roomId: 'r', kind })),
    announcements: vi.fn(async () => ({ announcements: [] })),
    openRooms: vi.fn(async () => ({ rooms: [], nextCursor: null })),
  } as unknown as HallClient;
}

function mountHall() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={qc}>
      <HallClientProvider client={makeHallClient()}>
        <HallExtras room={{ kind: 'hall' }} navigate={vi.fn()} />
      </HallClientProvider>
    </QueryClientProvider>
  );
}

async function openWithButton() {
  const button = screen.getByRole('button', { name: t.open });
  button.focus();
  fireEvent.click(button);
  const dialog = await screen.findByRole('dialog', { name: t.title });
  return { button, dialog };
}

const itemOf = (root: HTMLElement, id: string) =>
  root.querySelector(`[data-match-id="${id}"]`) as HTMLElement;

/* --------------------------------------------------------------- modèle --- */

describe('le modèle du tableau', () => {
  const now = new Date(NOW);

  it('le tournoi en cours le plus récent, sinon un publié commencé, sinon le prochain', () => {
    const older = tournament({
      id: 'older',
      status: 'running',
      start_date: iso(-60 * DAY),
    });
    expect(
      pickBoardTournament([NEXT, older, RUNNING, DONE], now)
    ).toMatchObject({ tournament: { id: 't-run' }, phase: 'running' });

    const started = tournament({
      id: 'started',
      status: 'published',
      start_date: iso(-5 * DAY),
    });
    const stale = tournament({
      id: 'stale',
      status: 'published',
      start_date: iso(-40 * DAY),
    });
    expect(pickBoardTournament([NEXT, started, stale], now)).toMatchObject({
      tournament: { id: 'started' },
      phase: 'running',
    });

    const later = tournament({
      id: 'later',
      status: 'published',
      start_date: iso(60 * DAY),
    });
    const undated = tournament({ id: 'undated', status: 'published' });
    expect(
      pickBoardTournament([undated, later, NEXT, stale, DONE], now)
    ).toMatchObject({ tournament: { id: 't-next' }, phase: 'upcoming' });
    expect(pickBoardTournament([undated, DONE], now)?.tournament.id).toBe(
      'undated'
    );
    expect(pickBoardTournament([DONE, stale], now)).toBeNull();
  });

  it('la phase en cours : un match en direct, sinon la phase active, sinon le prochain match', () => {
    const stages = [STAGE_RR, { ...STAGE_BR, status: 'inactive' }];
    const live = match({ id: 'l', stage_id: 's-br', status: 'ongoing' });
    expect(boardStageOf(stages, [live])?.id).toBe('s-br');
    expect(boardStageOf(stages, [])?.id).toBe('s-rr');
    const inactive = stages.map((s) => ({ ...s, status: 'inactive' }));
    expect(
      boardStageOf(inactive, [match({ id: 'n', stage_id: 's-br' })])?.id
    ).toBe('s-br');
    expect(boardStageOf(inactive, [])).toBeNull();
  });

  it('une ligne de match : direct, à venir, résultat, forfait (avec ou sans score)', () => {
    const state = (m: PublicMatch) => boardMatchState(toHubMatch(m));
    expect(state(MATCHES[0])).toEqual({ kind: 'live', score1: 2, score2: 1 });
    expect(state(MATCHES[1])).toEqual({ kind: 'upcoming', at: iso(DAY) });
    expect(state(MATCHES[2])).toEqual({ kind: 'result', score1: 3, score2: 1 });
    expect(state(MATCHES[3])).toMatchObject({
      kind: 'forfeit',
      score: { score1: 2, score2: 0 },
      winner: { id: 'c' },
    });
    expect(state(MATCHES[4])).toMatchObject({
      kind: 'forfeit',
      score: null,
      winner: { id: 'a', name: 'Valkyries' },
    });
    // Un match tranché à qui il manque une équipe est une exemption.
    expect(
      toHubMatch(match({ id: 'bye', status: 'finished', team2_id: null }))
        .is_bye
    ).toBe(true);
    expect(toHubMatch(match({ id: 'tbd', team2_id: null })).is_bye).toBe(false);
  });

  it('les tables de la phase (une par poule), sinon le classement en cours', () => {
    const groupA = { ...TABLE_RR, key: 's-g:A', groupKey: 'A' };
    const groupB = { ...TABLE_RR, key: 's-g:B', groupKey: 'B' };
    expect(
      stageTables([TABLE_RR, groupA, groupB], 's-g').map((x) => x.key)
    ).toEqual(['s-g:A', 's-g:B']);
    expect(stageTables([TABLE_RR], 'ailleurs').map((x) => x.key)).toEqual([
      's-rr',
    ]);
    expect(stageTables([], 's-rr')).toEqual([]);
  });

  it('les phases à points sont celles du classement public', () => {
    expect([...BOARD_STANDINGS_STAGE_TYPES]).toEqual([
      ...STANDINGS_STAGE_TYPES,
    ]);
  });
});

/* -------------------------------------------------------------- panneau --- */

describe('le tableau du tournoi', () => {
  it('« Voir le tableau » l’ouvre : tournoi, phase, direct, prochain, résultats, forfaits, classement', async () => {
    mountHall();
    const { dialog } = await openWithButton();
    expect(
      await within(dialog).findByRole('heading', { name: 'Coupe 2026' })
    ).toBeTruthy();
    expect(within(dialog).getByText(/^En cours · Du /)).toBeTruthy();
    expect(
      within(dialog).getByText(format(t.stage, { stage: 'Saison régulière' }))
    ).toBeTruthy();

    const live = itemOf(dialog, 'm-live');
    expect(live.getAttribute('data-match-state')).toBe('live');
    expect(within(live).getByText(t.live)).toBeTruthy();
    expect(within(live).getByText('2 – 1')).toBeTruthy();
    expect(live.textContent).toContain(`Valkyries ${t.versus} Sirènes`);

    const next = itemOf(dialog, 'm-next');
    expect(next.querySelector('time')?.getAttribute('datetime')).toBe(iso(DAY));

    expect(within(itemOf(dialog, 'm-done')).getByText('3 – 1')).toBeTruthy();
    const wo = itemOf(dialog, 'm-wo');
    expect(within(wo).getByText(t.forfeit)).toBeTruthy();
    expect(within(wo).getByText('2 – 0')).toBeTruthy();
    const blank = itemOf(dialog, 'm-wo-blank');
    expect(within(blank).getByText(t.forfeit)).toBeTruthy();
    expect(
      within(blank).getByText(format(t.forfeitWinner, { team: 'Valkyries' }))
    ).toBeTruthy();
    expect(blank.textContent).not.toMatch(/0 – 0/);

    const standings = dialog.querySelector(
      '[data-board-section="standings"]'
    ) as HTMLElement;
    const table = within(standings).getByRole('table');
    const first = within(table).getAllByRole('row')[1];
    expect(within(first).getByText('Valkyries')).toBeTruthy();
    expect(within(first).getByText('9')).toBeTruthy();
    expect(within(first).getByText('+5')).toBeTruthy();
    expect(
      within(standings)
        .getByRole('link', { name: t.seeStandings })
        .getAttribute('href')
    ).toBe('/tournament/coupe-2026/standings');
    expect(
      within(dialog)
        .getByRole('link', { name: t.seeTournament })
        .getAttribute('href')
    ).toBe('/tournament/coupe-2026');

    expect(calls).toEqual(
      expect.arrayContaining([
        '/api/public/v1/tournaments?limit=50',
        '/api/public/v1/tournaments/t-run',
        '/api/public/v1/tournaments/t-run/matches',
        '/api/overlay/standings?tournament=t-run',
      ])
    );
  });

  it('la zone de la vue ouvre le même tableau ; Échap ferme et rend le focus ; chaque ouverture relit', async () => {
    mountHall();
    act(() => {
      requestHallSpot('tournament_board');
    });
    const fromSpot = await screen.findByRole('dialog', { name: t.title });
    await within(fromSpot).findByRole('heading', { name: 'Coupe 2026' });
    fireEvent.keyDown(fromSpot, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    const { button, dialog } = await openWithButton();
    await within(dialog).findByRole('heading', { name: 'Coupe 2026' });
    await waitFor(() =>
      expect(calls.filter((u) => u === tournamentBoardUrls.list)).toHaveLength(
        2
      )
    );
    fireEvent.keyDown(dialog, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.activeElement).toBe(button);
  });

  it('aucun tournoi en cours ni annoncé : un état calme, sans autre lecture', async () => {
    routes = runningRoutes({
      [tournamentBoardUrls.list]: { body: { data: [DONE] } },
    });
    mountHall();
    const { dialog } = await openWithButton();
    expect(await within(dialog).findByText(t.empty)).toBeTruthy();
    expect(
      within(dialog)
        .getByRole('link', { name: t.seeAllTournaments })
        .getAttribute('href')
    ).toBe('/tournaments');
    expect(calls).toEqual([tournamentBoardUrls.list]);
  });

  it('le prochain tournoi annoncé, sans match ni classement encore', async () => {
    routes = {
      [tournamentBoardUrls.list]: { body: { data: [DONE, NEXT] } },
      [tournamentBoardUrls.detail('t-next')]: {
        body: { data: { ...NEXT, stages: [] } },
      },
      [tournamentBoardUrls.matches('t-next')]: { body: { data: [] } },
    };
    mountHall();
    const { dialog } = await openWithButton();
    expect(
      await within(dialog).findByRole('heading', { name: 'Coupe d’hiver' })
    ).toBeTruthy();
    expect(within(dialog).getByText(/^À venir · À partir du /)).toBeTruthy();
    expect(within(dialog).getByText(t.noMatches)).toBeTruthy();
    expect(dialog.querySelector('[data-board-section="standings"]')).toBeNull();
    expect(
      within(dialog)
        .getByRole('link', { name: t.seeTournament })
        .getAttribute('href')
    ).toBe('/tournament/t-next');
  });

  it('une lecture ratée se dit, et se relance', async () => {
    routes = runningRoutes({
      [tournamentBoardUrls.list]: { status: 429, body: { error: 'trop' } },
    });
    mountHall();
    const { dialog } = await openWithButton();
    const alert = await within(dialog).findByRole('alert');
    expect(within(alert).getByText(t.error)).toBeTruthy();
    routes = runningRoutes();
    fireEvent.click(within(alert).getByRole('button', { name: t.retry }));
    expect(
      await within(dialog).findByRole('heading', { name: 'Coupe 2026' })
    ).toBeTruthy();
  });

  it('un classement refusé (palier) n’empêche rien : il renvoie à la page du tournoi', async () => {
    routes = runningRoutes({
      [tournamentBoardUrls.standings('t-run')]: {
        status: 402,
        body: { error: 'palier', code: 'PLAN_CAPABILITY_REQUIRED' },
      },
    });
    mountHall();
    const { dialog } = await openWithButton();
    const standings = (await waitFor(() => {
      const el = dialog.querySelector('[data-board-section="standings"]');
      if (!el) throw new Error('pas encore');
      return el;
    })) as HTMLElement;
    expect(within(standings).getByText(t.standingsUnavailable)).toBeTruthy();
    expect(within(standings).queryByRole('table')).toBeNull();
    expect(itemOf(dialog, 'm-live')).toBeTruthy();
  });

  it('une phase à élimination : le tour en cours de chaque côté de l’arbre', async () => {
    const bracket: PublicMatch[] = [
      match({
        id: 'w1a',
        stage_id: 's-br',
        bracket_side: 'wb',
        status: 'finished',
        team1_score: 2,
        team2_score: 0,
        winner_team_id: 'a',
        scheduled_at: iso(-2 * DAY),
      }),
      match({
        id: 'w2',
        stage_id: 's-br',
        bracket_side: 'wb',
        round_number: 2,
        team2_id: 'c',
        team2_name: 'Orchidées',
        scheduled_at: iso(DAY),
      }),
      match({
        id: 'l1',
        stage_id: 's-br',
        bracket_side: 'lb',
        status: 'ongoing',
        team1_id: 'b',
        team1_name: 'Sirènes',
        team2_id: 'd',
        team2_name: 'Comètes',
        team1_score: 1,
        team2_score: 1,
        scheduled_at: iso(-10 * MIN),
      }),
      match({
        id: 'gf',
        stage_id: 's-br',
        bracket_side: 'final',
        round_number: 4,
        team1_id: null,
        team1_name: null,
        team2_id: null,
        team2_name: null,
        scheduled_at: null,
      }),
    ];
    routes = runningRoutes({
      [tournamentBoardUrls.detail('t-run')]: {
        body: { data: { ...RUNNING, stages: [STAGE_BR] } },
      },
      [tournamentBoardUrls.matches('t-run')]: { body: { data: bracket } },
    });
    mountHall();
    const { dialog } = await openWithButton();
    const section = (await waitFor(() => {
      const el = dialog.querySelector('[data-board-section="bracket"]');
      if (!el) throw new Error('pas encore');
      return el;
    })) as HTMLElement;
    const rounds = [...section.querySelectorAll('[data-bracket-round]')].map(
      (el) => el.getAttribute('data-bracket-round')
    );
    expect(rounds).toEqual(['main-2', 'lower-1']);
    expect(
      within(section).getByText(format(t.round, { round: 2 }))
    ).toBeTruthy();
    expect(
      within(section).getByText(
        `${t.sideLower} · ${format(t.round, { round: 1 })}`
      )
    ).toBeTruthy();
    expect(itemOf(section, 'w1a')).toBeNull();
    expect(within(itemOf(section, 'l1')).getByText('1 – 1')).toBeTruthy();
    expect(
      within(section)
        .getByRole('link', { name: t.seeBracket })
        .getAttribute('href')
    ).toBe('/tournament/coupe-2026/bracket');
    // Pas de classement pour un arbre : la route n'est pas appelée.
    expect(calls).not.toContain(tournamentBoardUrls.standings('t-run'));
  });
});

/* ---------------------------------------------- frontière de chargement --- */

describe('frontière de chargement de /player/library', () => {
  const ROOT = path.resolve(__dirname, '../..');
  const read = (rel: string) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const EXTS = ['', '.ts', '.tsx', '/index.ts', '/index.tsx'];

  const resolveLocal = (from: string, spec: string): string | null => {
    let base: string;
    if (spec.startsWith('@/')) base = spec.slice(2);
    else if (spec.startsWith('.'))
      base = path.posix.join(path.posix.dirname(from), spec);
    else return null;
    for (const ext of EXTS) {
      const cand = path.posix.normalize(base + ext);
      const abs = path.join(ROOT, cand);
      if (fs.existsSync(abs) && fs.statSync(abs).isFile()) return cand;
    }
    return null;
  };

  /** Imports STATIQUES de valeur (ni `import type`, ni `import()`). */
  const staticImports = (src: string): string[] => {
    const out: string[] = [];
    const re =
      /(?:import|export)\s+(?!type\s)[^'"]*?from\s+['"]([^'"]+)['"]|import\s+['"]([^'"]+)['"]/g;
    for (const m of src.matchAll(re)) out.push(m[1] ?? m[2]);
    return out;
  };

  const reach = (entry: string): Set<string> => {
    const seen = new Set<string>();
    const stack = [entry];
    while (stack.length) {
      const rel = stack.pop() as string;
      if (seen.has(rel)) continue;
      seen.add(rel);
      for (const spec of staticImports(read(rel))) {
        const next = resolveLocal(rel, spec);
        if (next && !seen.has(next)) stack.push(next);
      }
    }
    return seen;
  };

  /** Ce qui ne part qu'à l'ouverture du tableau. */
  const LAZY = [
    'features/player/library/ui/hall/TournamentBoardPanel.tsx',
    'features/player/library/hall/useHallTournament.ts',
    'features/player/library/hall/tournamentClient.ts',
    'features/player/library/hall/tournamentBoard.ts',
    'components/tournament/landing/LiveHub.tsx',
    'utils/tournament/liveHub.ts',
    'utils/overlay/standingsOverlay.ts',
  ];

  it('le détecteur mord : le panneau, lui, atteint lectures et classement', () => {
    const fromPanel = reach(LAZY[0]);
    expect(LAZY.filter((f) => !fromPanel.has(f))).toEqual([]);
  });

  it('la page atteint le hall, mais rien du tableau du tournoi', () => {
    const page = reach('pages/player/library.tsx');
    expect(page.has('features/player/library/ui/hall/HallExtras.tsx')).toBe(
      true
    );
    expect(LAZY.filter((f) => page.has(f))).toEqual([]);
    expect(
      [...page].filter((f) => f.startsWith('components/tournament/'))
    ).toEqual([]);
  });

  it('HallExtras charge le panneau par next/dynamic, et seulement ainsi', () => {
    const src = read('features/player/library/ui/hall/HallExtras.tsx');
    expect(src).toMatch(
      /dynamic\(\s*\(\)\s*=>\s*import\(\s*'\.\/TournamentBoardPanel'\s*\)/
    );
    expect(
      staticImports(src).some((s) => /TournamentBoard|tournament/i.test(s))
    ).toBe(false);
  });
});
