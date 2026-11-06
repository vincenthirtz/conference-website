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
//   - déjà validé : le dire, permettre de relire ;
//   - le PDF part avec la session (Bearer), et sans session pour un tournoi
//     public ; 404 → erreur ;
//   - « Télécharger » enregistre les octets déjà chargés, sans requête ;
//   - zoom : bornes, annonce, pages nettes près de la vue seulement, et
//     JAMAIS de déblocage par un changement d'échelle (contre-épreuves).

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

const auth = vi.hoisted(() => ({ token: 'player-token' as string | null }));
vi.mock('@/utils/identityBrowser', () => ({
  identityBrowser: {
    getSession: async () => ({
      data: { session: auth.token ? { access_token: auth.token } : null },
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
  renderToBlob: (pixelWidth: number) => Promise<Blob>;
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

/** Chaque rendu demandé : page (1…n) et largeur en pixels réels. */
let renders: { page: number; pixelWidth: number }[] = [];

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
        renderToBlob: async (pixelWidth: number) => {
          renders.push({ page: k, pixelWidth });
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

/** Pages près de la vue (indices 0…n-1), comme les voit l'observateur des pages. */
function setPagesNear(indices: number[]) {
  const pages = screen.getAllByTestId('rules-page');
  act(() => {
    for (const o of observers) {
      if (!o.targets.some((el) => pages.includes(el as HTMLElement))) continue;
      o.cb(
        o.targets.map((el) => ({
          isIntersecting: indices.includes(pages.indexOf(el as HTMLElement)),
          target: el,
        })) as unknown as IntersectionObserverEntry[],
        o as unknown as IntersectionObserver
      );
    }
  });
}

function rect(top: number, bottom: number): DOMRect {
  return {
    top,
    bottom,
    height: bottom - top,
    left: 0,
    right: 360,
    width: 360,
    x: 0,
    y: top,
    toJSON: () => ({}),
  } as DOMRect;
}

/** happy-dom ne met rien en page : la zone mesure `px` de large. */
function zoneWidth(px: number) {
  return vi
    .spyOn(HTMLElement.prototype, 'clientWidth', 'get')
    .mockImplementation(function (this: HTMLElement) {
      return this.dataset?.testid === 'rules-reader-zone' ? px : 0;
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

type Call = {
  url: string;
  method: string;
  body: string | null;
  authorization: string | null;
  credentials: RequestCredentials | undefined;
};
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
  renders = [];
  auth.token = 'player-token';
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
        authorization: new Headers(init.headers).get('Authorization'),
        credentials: init.credentials,
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
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.useRealTimers();
});
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
const button = (name: string) =>
  screen.getByRole('button', { name }) as HTMLButtonElement;
const fileCalls = () =>
  calls.filter((c) => c.url.startsWith(`/api/tournaments/${TOUR}/rules/file`));

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

describe('liseuse — le PDF part avec la session de la joueuse', () => {
  it('Bearer de la session, même origine, version précise', async () => {
    renderReader();
    await allPagesRendered();
    const file = fileCalls();
    expect(file).toHaveLength(1);
    expect(file[0].url).toBe(`/api/tournaments/${TOUR}/rules/file?version=2`);
    expect(file[0].authorization).toBe('Bearer player-token');
    expect(file[0].credentials).toBe('same-origin');
  });

  it('sans session : la requête part quand même, sans Bearer (tournoi public)', async () => {
    auth.token = null;
    render(<RulesPdfReader tournamentId={TOUR} versionNumber={2} t={t} />);
    await allPagesRendered();
    expect(fileCalls()).toHaveLength(1);
    expect(fileCalls()[0].authorization).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('404 (tournoi non public, pas concernée) : erreur + Réessayer, case inactive', async () => {
    onFile = () => json({ error: 'Introuvable', code: 'not_found' }, 404);
    renderReader();
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain(t.pdfErrorFile);
    expect(alert.textContent).toContain(t.pdfErrorLocked);
    expect(screen.getByRole('button', { name: t.retry })).toBeTruthy();
    expect(checkbox().disabled).toBe(true);
    expect(openRulesPdf).not.toHaveBeenCalled();
    expect(screen.queryByTestId('rules-end')).toBeNull();
  });
});

describe('liseuse — « Télécharger » enregistre le fichier déjà chargé', () => {
  it('Blob des octets lus, nom de la version, URL révoquée après usage, aucune requête', async () => {
    const clicked: { href: string; download: string }[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement
    ) {
      clicked.push({ href: this.href, download: this.download });
    });
    renderReader();
    await allPagesRendered();
    expect(fileCalls()).toHaveLength(1);
    // Plus de lien vers l'API : il partirait sans la session.
    expect(document.querySelector('a[href*="/rules/file"]')).toBeNull();

    vi.useFakeTimers({ toFake: ['setTimeout'] });
    fireEvent.click(button(t.download));

    expect(clicked).toHaveLength(1);
    expect(clicked[0].download).toBe('reglement-owwc-2027-v2.pdf');
    const url = clicked[0].href;
    // Le lien d'aide ne reste pas dans le DOM ; l'URL vit le temps de partir.
    expect(document.querySelector(`a[href="${url}"]`)).toBeNull();
    expect(URL.revokeObjectURL).not.toHaveBeenCalledWith(url);
    vi.advanceTimersByTime(10_000);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(url);
    vi.useRealTimers();

    // C'est le PDF chargé — ses octets, intacts — qui part, sans requête.
    const pdf = vi
      .mocked(URL.createObjectURL)
      .mock.calls.map((c) => c[0])
      .find(
        (b): b is Blob => b instanceof Blob && b.type === 'application/pdf'
      );
    expect(pdf).toBeTruthy();
    expect(
      Array.from(new Uint8Array(await (pdf as Blob).arrayBuffer()))
    ).toEqual([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]);
    expect(fileCalls()).toHaveLength(1);
  });

  it('inactif tant que le PDF n’est pas chargé', async () => {
    let release = () => {};
    onFile = () => pdfBytes();
    openRulesPdf.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = () => resolve(fakeDoc(3).doc);
        })
    );
    renderReader();
    await waitFor(() => expect(openRulesPdf).toHaveBeenCalled());
    expect(button(t.download).disabled).toBe(true);
    await act(async () => {
      release();
    });
    await allPagesRendered();
    expect(button(t.download).disabled).toBe(false);
  });
});

describe('liseuse — zoom', () => {
  it('−, +, Ajuster à la largeur : niveau affiché, annoncé poliment, bornes désactivées', async () => {
    renderReader();
    await allPagesRendered();
    const level = screen.getByTestId('rules-zoom-level');
    expect(level.getAttribute('aria-live')).toBe('polite');
    // Par défaut : ajusté à la largeur, rien d'annoncé.
    expect(level.textContent).toBe('100 %');
    expect(button(t.zoomOut).disabled).toBe(true);
    expect(button(t.zoomFit).disabled).toBe(true);
    expect(button(t.zoomIn).disabled).toBe(false);
    expect(screen.getByRole('group', { name: t.zoomGroup })).toBeTruthy();

    fireEvent.click(button(t.zoomIn));
    expect(level.textContent).toBe('Zoom : 125 %');
    expect(button(t.zoomOut).disabled).toBe(false);
    expect(button(t.zoomFit).disabled).toBe(false);

    // Au clavier : arrivé à 300 %, « + » se désactive et rend le focus à « − ».
    button(t.zoomIn).focus();
    for (let i = 0; i < 5; i++) fireEvent.click(button(t.zoomIn));
    expect(level.textContent).toBe('Zoom : 300 %');
    expect(button(t.zoomIn).disabled).toBe(true);
    expect(document.activeElement).toBe(button(t.zoomOut));
    fireEvent.click(button(t.zoomIn));
    expect(level.textContent).toBe('Zoom : 300 %');

    fireEvent.click(button(t.zoomOut));
    expect(level.textContent).toBe('Zoom : 250 %');

    fireEvent.click(button(t.zoomFit));
    expect(level.textContent).toBe('Zoom : 100 %');
    expect(button(t.zoomOut).disabled).toBe(true);
    expect(button(t.zoomFit).disabled).toBe(true);
  });

  it('les pages grandissent avec le zoom, relatif à la largeur de la zone', async () => {
    zoneWidth(360);
    renderReader();
    await allPagesRendered();
    const sheet = screen.getByTestId('rules-sheet');
    expect(sheet.style.width).toBe('360px');
    fireEvent.click(button(t.zoomIn));
    expect(sheet.style.width).toBe('450px');
    for (let i = 0; i < 5; i++) fireEvent.click(button(t.zoomIn));
    expect(sheet.style.width).toBe('1080px');
    expect(screen.getByTestId('rules-reader-zone').dataset.zoom).toBe('300');
  });

  it('mémoire : seules les pages près de la vue sont rendues net (au plus 3), puis rendues', async () => {
    zoneWidth(360);
    openRulesPdf.mockImplementation(async () => fakeDoc(5).doc);
    renderReader();
    await allPagesRendered(5);
    // Rendu de base : chaque page une fois, à la largeur ajustée.
    expect(renders).toHaveLength(5);
    expect(new Set(renders.map((r) => r.pixelWidth))).toEqual(new Set([360]));
    const baseSrc = screen
      .getAllByRole('img')
      .map((i) => i.getAttribute('src'));

    // À 100 %, l'image de base suffit : aucun rendu net.
    setPagesNear([0, 1]);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
    expect(renders).toHaveLength(5);

    setPagesNear([]);
    for (let i = 0; i < 6; i++) fireEvent.click(button(t.zoomIn));
    setPagesNear([0, 1, 2, 3, 4]);
    await waitFor(() => expect(renders).toHaveLength(8));
    const sharp = renders.slice(5);
    // Les 3 du milieu de la vue, à la largeur affichée (300 % de 360 px).
    expect(sharp.map((r) => r.page).sort()).toEqual([2, 3, 4]);
    expect(new Set(sharp.map((r) => r.pixelWidth))).toEqual(new Set([1080]));
    await waitFor(() =>
      expect(screen.getAllByRole('img')[2].getAttribute('src')).not.toBe(
        baseSrc[2]
      )
    );
    const sharpSrc = screen.getAllByRole('img')[2].getAttribute('src');
    // Pas plus de 3 : les pages 1 et 5 gardent leur image de base.
    expect(screen.getAllByRole('img')[0].getAttribute('src')).toBe(baseSrc[0]);
    expect(screen.getAllByRole('img')[4].getAttribute('src')).toBe(baseSrc[4]);

    // La vue s'éloigne : l'image HD est libérée, la page retombe sur la base.
    setPagesNear([4]);
    await waitFor(() =>
      expect(screen.getAllByRole('img')[2].getAttribute('src')).toBe(baseSrc[2])
    );
    expect(URL.revokeObjectURL).toHaveBeenCalledWith(sharpSrc);
    await waitFor(() => expect(renders).toHaveLength(9));
    expect(renders[8]).toEqual({ page: 5, pixelWidth: 1080 });
  });
});

describe('liseuse — le zoom ne débloque JAMAIS la case', () => {
  it('contre-épreuve : un repère que le zoom fait apparaître ne compte pas, tant qu’il n’est pas sorti puis revenu', async () => {
    renderReader();
    await allPagesRendered();
    fireEvent.click(button(t.zoomIn));

    // Mise en page simulée : après le zoom arrière, le repère est dans la zone
    // (il n'y était pas : l'observateur ne l'a jamais signalé).
    vi.spyOn(
      screen.getByTestId('rules-reader-zone'),
      'getBoundingClientRect'
    ).mockReturnValue(rect(0, 600));
    vi.spyOn(
      screen.getByTestId('rules-end'),
      'getBoundingClientRect'
    ).mockReturnValue(rect(500, 560));
    fireEvent.click(button(t.zoomOut));

    // L'observateur constate le repère apparu par le zoom : rien ne se débloque.
    setEndVisible(true);
    expect(checkbox().disabled).toBe(true);

    // Il ne compte qu'une fois sorti de la zone puis revenu — un défilement.
    setEndVisible(false);
    expect(checkbox().disabled).toBe(true);
    setEndVisible(true);
    expect(checkbox().disabled).toBe(false);
  });

  it('contre-épreuve (sans IntersectionObserver) : le zoom arrière qui ramène tout en bas ne débloque pas', async () => {
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
    // Une zone de 600 px sur 3 pages de 500 px à 100 % : le contenu grandit
    // avec le zoom ; le navigateur borne le défilement (scrollTop) au contenu.
    const zone = screen.getByTestId('rules-reader-zone');
    const contentHeight = () => 1500 * (Number(zone.dataset.zoom) / 100);
    let top = 0;
    Object.defineProperty(zone, 'clientHeight', {
      value: 600,
      configurable: true,
    });
    Object.defineProperty(zone, 'scrollHeight', {
      get: contentHeight,
      configurable: true,
    });
    Object.defineProperty(zone, 'scrollTop', {
      get: () => top,
      set: (v: number) => {
        top = Math.min(Math.max(0, v), contentHeight() - 600);
      },
      configurable: true,
    });
    const scrollTo = (v: number) => {
      zone.scrollTop = v;
      act(() => {
        zone.dispatchEvent(new Event('scroll'));
      });
    };

    for (let i = 0; i < 6; i++) fireEvent.click(button(t.zoomIn));
    // À 300 % (4 500 px), au milieu du règlement : pas en bas.
    scrollTo(1800);
    expect(reached).not.toHaveBeenCalled();

    // Retour à 100 % : contenu de 1 500 px, le défilement est ramené à 900 —
    // tout en bas, sans que la joueuse ait défilé jusque-là.
    fireEvent.click(button(t.zoomFit));
    act(() => {
      zone.dispatchEvent(new Event('scroll'));
    });
    expect(zone.scrollTop + 600).toBeGreaterThanOrEqual(1496);
    expect(reached).not.toHaveBeenCalled();

    // Remonter, puis redescendre : là, c'est un vrai défilement.
    scrollTo(0);
    expect(reached).not.toHaveBeenCalled();
    scrollTo(900);
    expect(reached).toHaveBeenCalledTimes(1);
  });

  it('une case débloquée le reste au zoom (et cochée, elle reste cochée)', async () => {
    renderReader();
    await allPagesRendered();
    setEndVisible(true);
    expect(checkbox().disabled).toBe(false);
    fireEvent.click(checkbox());

    fireEvent.click(button(t.zoomIn));
    fireEvent.click(button(t.zoomIn));
    setEndVisible(false);
    fireEvent.click(button(t.zoomFit));
    fireEvent.click(button(t.zoomIn));

    expect(checkbox().disabled).toBe(false);
    expect(checkbox().checked).toBe(true);
    expect(acceptButton().disabled).toBe(false);
  });
});
