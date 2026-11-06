// @vitest-environment happy-dom
//
// Liseuse du règlement (/player/tournaments/[id]/reglement), contre des
// réponses-fixtures au contrat de conference-api :
//   GET  /api/player/tournaments/[id]/rules        → { required, version, me }
//   POST /api/player/tournaments/[id]/rules/accept { versionId } → { acceptedAt }
//   GET  /api/tournaments/[id]/rules/file?version=n → le PDF (même origine)
//
// pdf.js est SIMULÉ (module pdfEngine) : ce qui est testé, c'est la règle de
// la liseuse, pas le rendu des glyphes. L'IntersectionObserver est simulé
// aussi : c'est lui qui dit « le repère de fin est dans la zone ».
//
// Ce que ces cas protègent — le « défilement obligatoire » :
//   - case INACTIVE (et le pourquoi annoncé) tant que le bas n'est pas atteint ;
//   - le bas atteint pendant que des pages sont encore blanches ne compte pas,
//     ni un repère vu puis quitté avant la fin du rendu (contre-épreuves) ;
//   - bouton inactif tant que la case n'est pas cochée, puis POST de la
//     version LUE, puis confirmation datée ;
//   - PDF en erreur : message + Réessayer, case jamais active ;
//   - 409 version périmée : nouvelle version chargée, lecture à refaire ;
//   - déjà validé : le dire, permettre de relire.

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
} from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

vi.mock('@/utils/identityBrowser', () => ({
  identityBrowser: {
    getSession: async () => ({
      data: { session: { access_token: 'player-token' } },
    }),
  },
}));
vi.mock('next/router', () => ({
  default: {
    asPath: '/player/tournaments/t-2027/reglement',
    replace: vi.fn(async () => true),
  },
  useRouter: () => ({
    asPath: '/player/tournaments/t-2027/reglement',
    query: { id: 't-2027' },
    isReady: true,
    push: vi.fn(),
  }),
}));

type FakePage = {
  width: number;
  height: number;
  renderToBlob: () => Promise<Blob>;
  text: () => Promise<string>;
  release: () => void;
};
const openRulesPdf = vi.fn();
vi.mock('@/features/player/tournamentRules/pdfEngine', () => ({
  openRulesPdf: (...a: unknown[]) => openRulesPdf(...a),
}));

import RulesReaderScreen from '@/features/player/tournamentRules/ui/RulesReaderScreen';
import RulesPdfReader from '@/features/player/tournamentRules/ui/RulesPdfReader';
import type {
  PlayerRulesView,
  RulesVersionView,
} from '@/features/player/tournamentRules/client';
import ns from '@/lib/i18n/locales/fr/playerTournamentRules';

const t = ns.fr;
const TOUR = 't-2027';

// ── pdf.js simulé ──────────────────────────────────────────────────────────

type Deferred = { resolve: () => void; promise: Promise<void> };
function deferred(): Deferred {
  let resolve = () => {};
  const promise = new Promise<void>((r) => {
    resolve = r;
  });
  return { resolve, promise };
}

/** Un document de `n` pages ; `hold[k]` retient le rendu de la page k. */
function fakeDoc(n: number, hold: Record<number, Deferred> = {}) {
  const destroy = vi.fn();
  return {
    destroy,
    doc: {
      numPages: n,
      page: async (k: number): Promise<FakePage> => ({
        width: 595,
        height: 842,
        renderToBlob: async () => {
          if (hold[k]) await hold[k].promise;
          return new Blob([`page-${k}`], { type: 'image/png' });
        },
        text: async () => `Article ${k} du règlement.`,
        release: () => {},
      }),
      destroy,
    },
  };
}

// ── IntersectionObserver simulé ───────────────────────────────────────────

type Obs = {
  cb: IntersectionObserverCallback;
  targets: Element[];
  root: Element | Document | null;
};
let observers: Obs[] = [];
class FakeIntersectionObserver {
  private readonly o: Obs;
  constructor(
    cb: IntersectionObserverCallback,
    opts?: IntersectionObserverInit
  ) {
    this.o = { cb, targets: [], root: opts?.root ?? null };
    observers.push(this.o);
  }
  observe(el: Element) {
    this.o.targets.push(el);
  }
  unobserve() {}
  disconnect() {
    observers = observers.filter((x) => x !== this.o);
  }
  takeRecords() {
    return [];
  }
}

/** Le repère de fin entre (ou sort) de la zone qui défile. */
function setEndVisible(visible: boolean) {
  const end = screen.getByTestId('rules-end');
  act(() => {
    for (const o of observers) {
      if (!o.targets.includes(end)) continue;
      // La racine observée est bien la zone qui défile, pas la page.
      expect(o.root).toBe(screen.getByTestId('rules-reader-zone'));
      o.cb(
        [
          {
            isIntersecting: visible,
            target: end,
          } as unknown as IntersectionObserverEntry,
        ],
        o as unknown as IntersectionObserver
      );
    }
  });
}

// ── réseau simulé ─────────────────────────────────────────────────────────

const V2: RulesVersionView = {
  id: 'ver-2',
  number: 2,
  fileName: 'reglement-owwc-2027-v2.pdf',
  requiresRevalidation: true,
  note: 'Article 4 : les play-offs passent en BO5.',
  createdAt: '2026-11-05T10:00:00.000Z',
  pageCount: 3,
};
const V3: RulesVersionView = {
  ...V2,
  id: 'ver-3',
  number: 3,
  note: 'Article 7 : nouvelle règle de pause.',
};
const PENDING: PlayerRulesView = {
  required: true,
  version: V2,
  me: {
    teamId: 'team-alpha',
    teamName: 'Les Alpha',
    role: 'player',
    mustValidate: true,
    accepted: false,
    acceptedAt: null,
  },
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
const pdfBytes = () =>
  new Response(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]), {
    status: 200,
    headers: { 'Content-Type': 'application/pdf' },
  });

type Call = { url: string; method: string; body: string | null };
let calls: Call[] = [];
let rulesQueue: PlayerRulesView[] = [];
let onAccept: () => Response;
let onFile: (url: string) => Response;

const realFetch = globalThis.fetch;
const realIO = globalThis.IntersectionObserver;
let blobCounter = 0;

beforeEach(() => {
  calls = [];
  observers = [];
  rulesQueue = [PENDING];
  onAccept = () => json({ acceptedAt: '2026-11-06T14:04:00.000Z' });
  onFile = () => pdfBytes();
  openRulesPdf.mockReset();
  openRulesPdf.mockImplementation(async () => fakeDoc(3).doc);
  globalThis.IntersectionObserver =
    FakeIntersectionObserver as unknown as typeof IntersectionObserver;
  URL.createObjectURL = vi.fn(() => `blob:rules/${++blobCounter}`);
  URL.revokeObjectURL = vi.fn();
  globalThis.fetch = vi.fn(
    async (input: RequestInfo | URL, init: RequestInit = {}) => {
      const url = String(input);
      const method = (init.method ?? 'GET').toUpperCase();
      calls.push({
        url,
        method,
        body: typeof init.body === 'string' ? init.body : null,
      });
      if (url === `/api/player/tournaments/${TOUR}/rules/accept`)
        return onAccept();
      if (url === `/api/player/tournaments/${TOUR}/rules`) {
        const next = rulesQueue.length > 1 ? rulesQueue.shift() : rulesQueue[0];
        return json(next);
      }
      if (url.startsWith(`/api/tournaments/${TOUR}/rules/file`))
        return onFile(url);
      if (url.startsWith('/api/tournaments?'))
        return json({
          tournaments: [
            {
              id: TOUR,
              name: 'OWWC 2027',
              status: 'published',
              start_date: '2027-03-01',
            },
          ],
        });
      return json({ error: 'inconnu' }, 404);
    }
  ) as unknown as typeof fetch;
});
afterEach(cleanup);
afterAll(() => {
  globalThis.fetch = realFetch;
  globalThis.IntersectionObserver = realIO;
});

function renderReader() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <RulesReaderScreen tournamentId={TOUR} />
    </QueryClientProvider>
  );
}

const checkbox = () =>
  screen.getByRole('checkbox', { name: t.checkboxLabel }) as HTMLInputElement;
const acceptButton = () =>
  screen.getByRole('button', { name: t.accept }) as HTMLButtonElement;

/** Attend que toutes les pages soient rendues (une image par page). */
async function allPagesRendered(n = 3) {
  await waitFor(() => expect(screen.getAllByRole('img')).toHaveLength(n));
}

describe('liseuse — la case ne s’active qu’en bas du règlement', () => {
  it('case inactive tant que le bas n’est pas atteint, avec le pourquoi relié à la case', async () => {
    renderReader();
    await allPagesRendered();

    // Les pages l'une sous l'autre, décrites pour les lecteurs d'écran.
    expect(screen.getAllByTestId('rules-page')).toHaveLength(3);
    expect(screen.getByRole('img', { name: 'Page 1 sur 3' })).toBeTruthy();
    expect(screen.getByText('Article 2 du règlement.')).toBeTruthy();
    // Le PDF lu est celui de la version qu'on validera.
    expect(
      calls.some(
        (c) => c.url === `/api/tournaments/${TOUR}/rules/file?version=2`
      )
    ).toBe(true);

    const box = checkbox();
    expect(box.disabled).toBe(true);
    const hintId = box.getAttribute('aria-describedby');
    expect(hintId).toBeTruthy();
    expect(document.getElementById(hintId as string)?.textContent).toBe(
      t.checkboxLockedHint
    );
    expect(acceptButton().disabled).toBe(true);

    // Cliquer une case inactive ne la coche pas, et rien ne part.
    fireEvent.click(box);
    expect(checkbox().checked).toBe(false);
    fireEvent.click(acceptButton());
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(0);

    // La zone défile au clavier : focalisable, nommée.
    const zone = screen.getByRole('region', { name: 'Règlement, 3 pages' });
    expect(zone.getAttribute('tabindex')).toBe('0');
  });

  it('bas atteint → case active → cochée → bouton actif → POST de la version lue → confirmation datée', async () => {
    renderReader();
    await allPagesRendered();

    setEndVisible(true);
    expect(checkbox().disabled).toBe(false);
    expect(screen.getByText(t.reachedEnd)).toBeTruthy();
    expect(
      document.getElementById(
        checkbox().getAttribute('aria-describedby') as string
      )?.textContent
    ).toBe(t.checkboxUnlockedHint);
    // Case active mais pas cochée : le bouton attend.
    expect(acceptButton().disabled).toBe(true);

    fireEvent.click(checkbox());
    expect(checkbox().checked).toBe(true);
    expect(acceptButton().disabled).toBe(false);

    await act(async () => {
      fireEvent.click(acceptButton());
    });

    const posts = calls.filter((c) => c.method === 'POST');
    expect(posts).toHaveLength(1);
    expect(posts[0].url).toBe(`/api/player/tournaments/${TOUR}/rules/accept`);
    expect(JSON.parse(posts[0].body as string)).toEqual({ versionId: 'ver-2' });

    const thanks = await screen.findByRole('heading', { name: t.thanks });
    // Le focus va sur la confirmation, annoncée.
    expect(document.activeElement).toBe(thanks);
    // 14:04 UTC = 15:04 à Paris en novembre.
    expect(screen.getByText('Validé le 6 novembre 2026 à 15:04')).toBeTruthy();
    // Plus de case : c'est fait. La liseuse se replie, on peut relire.
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.getByRole('button', { name: t.reread })).toBeTruthy();
  });

  it('contre-épreuve : le bas vu pendant que des pages sont encore blanches ne compte pas', async () => {
    const hold = { 3: deferred() };
    openRulesPdf.mockImplementation(async () => fakeDoc(3, hold).doc);
    renderReader();
    await waitFor(() => expect(screen.getAllByRole('img')).toHaveLength(2));

    // Le repère est visible (défilement en trombe) mais la page 3 est blanche.
    setEndVisible(true);
    expect(checkbox().disabled).toBe(true);

    // Elle sort du champ AVANT la fin du rendu…
    setEndVisible(false);
    await act(async () => {
      hold[3].resolve();
    });
    await allPagesRendered();
    // … le rendu fini ne déverrouille rien : il faut être en bas MAINTENANT.
    expect(checkbox().disabled).toBe(true);

    setEndVisible(true);
    expect(checkbox().disabled).toBe(false);
  });

  it('contre-épreuve : le bas atteint pendant le rendu déverrouille dès la dernière page rendue', async () => {
    const hold = { 3: deferred() };
    openRulesPdf.mockImplementation(async () => fakeDoc(3, hold).doc);
    renderReader();
    await waitFor(() => expect(screen.getAllByRole('img')).toHaveLength(2));

    setEndVisible(true);
    expect(checkbox().disabled).toBe(true);
    await act(async () => {
      hold[3].resolve();
    });
    await waitFor(() => expect(checkbox().disabled).toBe(false));
  });

  it('contre-épreuve : sans IntersectionObserver, seul un vrai défilement jusqu’en bas compte', async () => {
    // La liseuse seule (next/link, lui, exige l'observateur).
    globalThis.IntersectionObserver =
      undefined as unknown as typeof IntersectionObserver;
    const reached = vi.fn();
    render(
      <RulesPdfReader
        tournamentId={TOUR}
        versionNumber={2}
        onReachedEnd={reached}
        t={t}
      />
    );
    await allPagesRendered();
    const zone = screen.getByTestId('rules-reader-zone');
    // happy-dom ne met rien en page : une zone sans hauteur n'est en bas de rien.
    expect(reached).not.toHaveBeenCalled();

    Object.defineProperty(zone, 'scrollHeight', {
      value: 3000,
      configurable: true,
    });
    Object.defineProperty(zone, 'clientHeight', {
      value: 600,
      configurable: true,
    });
    zone.scrollTop = 1200;
    act(() => {
      zone.dispatchEvent(new Event('scroll'));
    });
    expect(reached).not.toHaveBeenCalled();

    zone.scrollTop = 2400;
    act(() => {
      zone.dispatchEvent(new Event('scroll'));
    });
    expect(reached).toHaveBeenCalledTimes(1);

    // Remonter puis redescendre ne rappelle pas : c'est acquis.
    zone.scrollTop = 0;
    act(() => {
      zone.dispatchEvent(new Event('scroll'));
    });
    zone.scrollTop = 2400;
    act(() => {
      zone.dispatchEvent(new Event('scroll'));
    });
    expect(reached).toHaveBeenCalledTimes(1);
  });
});

describe('liseuse — aucun contournement quand le PDF ne s’affiche pas', () => {
  it('PDF injoignable : message + Réessayer, case inactive ; Réessayer recharge', async () => {
    onFile = () => json({ error: 'boom' }, 500);
    renderReader();

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain(t.pdfErrorFile);
    expect(alert.textContent).toContain(t.pdfErrorLocked);
    expect(checkbox().disabled).toBe(true);
    expect(acceptButton().disabled).toBe(true);
    // Pas de repère de fin : rien à « atteindre ».
    expect(screen.queryByTestId('rules-end')).toBeNull();

    onFile = () => pdfBytes();
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: t.retry }));
    });
    await allPagesRendered();
    expect(checkbox().disabled).toBe(true);
    setEndVisible(true);
    expect(checkbox().disabled).toBe(false);
  });

  it('PDF illisible (pdf.js refuse) : message dédié, case inactive', async () => {
    openRulesPdf.mockImplementation(async () => {
      throw new Error('Invalid PDF structure.');
    });
    renderReader();
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain(t.pdfErrorPdf);
    expect(checkbox().disabled).toBe(true);
  });
});

describe('liseuse — versions et états', () => {
  it('409 version périmée : la nouvelle version est chargée, case décochée, lecture à refaire', async () => {
    onAccept = () =>
      json({ error: 'Version périmée', code: 'rules_version_outdated' }, 409);
    rulesQueue = [PENDING, { ...PENDING, version: V3 }];
    renderReader();
    await allPagesRendered();
    setEndVisible(true);
    fireEvent.click(checkbox());
    await act(async () => {
      fireEvent.click(acceptButton());
    });

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain(t.outdated);
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: t.loadNewVersion }));
    });

    await waitFor(() =>
      expect(
        calls.some(
          (c) => c.url === `/api/tournaments/${TOUR}/rules/file?version=3`
        )
      ).toBe(true)
    );
    await allPagesRendered();
    expect(
      screen.getByText('Article 7 : nouvelle règle de pause.')
    ).toBeTruthy();
    expect(checkbox().disabled).toBe(true);
    expect(checkbox().checked).toBe(false);
    expect(screen.queryByText(t.outdated)).toBeNull();
  });

  it('version et note « ce qui change » affichées', async () => {
    renderReader();
    expect(
      await screen.findByText(
        'Version 2 · 3 pages · déposée le 5 novembre 2026'
      )
    ).toBeTruthy();
    expect(screen.getByText(t.whatChanges)).toBeTruthy();
    expect(
      screen.getByText('Article 4 : les play-offs passent en BO5.')
    ).toBeTruthy();
    expect(screen.getByText(t.importantChange)).toBeTruthy();
    expect(screen.getByText('Ton équipe : Les Alpha')).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe(
      'Règlement · OWWC 2027'
    );
  });

  it('déjà validé : le dire avec la date, sans case ; « Relire » rouvre la liseuse', async () => {
    rulesQueue = [
      {
        ...PENDING,
        me: {
          ...PENDING.me!,
          accepted: true,
          acceptedAt: '2026-11-05T19:30:00.000Z',
        },
      },
    ];
    renderReader();
    expect(
      await screen.findByText('Tu as validé ce règlement (version 2).')
    ).toBeTruthy();
    expect(screen.getByText('Validé le 5 novembre 2026 à 20:30')).toBeTruthy();
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(screen.queryByTestId('rules-reader-zone')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: t.reread }));
    await allPagesRendered();
    expect(screen.queryByRole('checkbox')).toBeNull();
  });

  it('réglage éteint : lecture seule, sans case', async () => {
    rulesQueue = [{ ...PENDING, required: false }];
    renderReader();
    expect(await screen.findByText(t.notRequired)).toBeTruthy();
    await allPagesRendered();
    expect(screen.queryByRole('checkbox')).toBeNull();
  });

  it('pas membre d’une équipe engagée : lecture seule, sans case', async () => {
    rulesQueue = [{ ...PENDING, me: null }];
    renderReader();
    expect(await screen.findByText(t.notMember)).toBeTruthy();
    expect(screen.queryByRole('checkbox')).toBeNull();
  });

  it('aucune version déposée : le dire, rien à valider', async () => {
    rulesQueue = [{ ...PENDING, version: null }];
    renderReader();
    expect(await screen.findByText(t.noVersion)).toBeTruthy();
    expect(screen.getByText(t.noVersionRequired)).toBeTruthy();
    expect(screen.queryByRole('checkbox')).toBeNull();
    expect(openRulesPdf).not.toHaveBeenCalled();
  });
});
