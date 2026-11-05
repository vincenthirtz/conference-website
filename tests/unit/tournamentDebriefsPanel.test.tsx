// @vitest-environment happy-dom
//
// Debriefs de fin de tournoi — côté écran (sous-onglet « Debriefs » de
// Résultats). Contre des réponses-fixtures au contrat de conference-api :
//   GET  /api/admin/tournament/[id]/debriefs        → { teams: [...] }
//   POST /api/admin/tournament/[id]/debrief-request → { requested, withChannel }
//
// Ce que ces cas protègent :
//   - la liste montre TOUTES les équipes engagées, réponse ou non (« Pas encore
//     de réponse ») — une équipe muette ne doit pas disparaître de l'écran ;
//   - rien ne part sans confirmation : le bouton fait écrire le bot dans le
//     salon de chaque équipe ;
//   - le résultat dit combien d'équipes n'ont PAS de salon (elles ne reçoivent
//     rien) ;
//   - un nouvel essai après une erreur garde sa clé d'idempotence (pas de
//     double message si la première demande était partie), une relance après
//     un succès en prend une neuve.

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

vi.mock('@/utils/identityBrowser', () => ({
  identityBrowser: {
    getSession: async () => ({
      data: { session: { access_token: 'staff-token' } },
    }),
  },
}));
vi.mock('next/router', () => ({
  default: { asPath: '/admin', replace: vi.fn(async () => true) },
}));
vi.mock('next/image', () => ({
  default: ({ src, alt }: { src: string; alt: string }) => (
    // biome-ignore lint/performance/noImgElement: doublure de test de next/image
    <img src={src} alt={alt} />
  ),
}));

import TournamentDebriefsPanel, {
  debriefRequestMessage,
  sortDebriefTeams,
} from '@/features/admin/tournaments/ui/TournamentDebriefsPanel';
import type {
  TournamentDebriefsResponse,
  TournamentDebriefTeam,
} from '@/features/admin/tournaments/client';
import ns from '@/lib/i18n/locales/admin-fr/adminTournamentDebriefs';
import nsConfirm from '@/lib/i18n/locales/admin-fr/adminConfirmDialog';

const t = ns.fr;
const TOUR = 'a1b2c3d4-0000-4000-8000-000000000001';
const GET_URL = `/api/admin/tournament/${TOUR}/debriefs`;
const POST_URL = `/api/admin/tournament/${TOUR}/debrief-request`;

const alpha: TournamentDebriefTeam = {
  team_id: 'team-alpha',
  name: 'Alpha',
  logo_url: null,
  debrief: {
    positives: 'Bonne organisation',
    negatives: null,
    updated_at: '2026-11-01T20:00:00.000Z',
  },
};
const beta: TournamentDebriefTeam = {
  team_id: 'team-beta',
  name: 'Beta',
  logo_url: 'https://media.owwomenscup.fr/teams/beta.png',
  debrief: null,
};
const gamma: TournamentDebriefTeam = {
  team_id: 'team-gamma',
  name: 'Gamma',
  logo_url: null,
  debrief: {
    positives: 'Casters au top',
    negatives: 'Retards\nentre les matchs',
    updated_at: '2026-11-02T18:30:00.000Z',
  },
};

const WITH_ANSWERS: TournamentDebriefsResponse = {
  teams: [alpha, beta, gamma],
};
const NO_ANSWERS: TournamentDebriefsResponse = {
  teams: [
    { ...alpha, debrief: null },
    { ...gamma, debrief: null },
  ],
};
const NO_TEAMS: TournamentDebriefsResponse = { teams: [] };

type Call = { url: string; method: string; headers: Headers };
let calls: Call[] = [];
let onGet: () => Response | Promise<Response>;
let onPost: () => Response | Promise<Response>;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const realFetch = globalThis.fetch;

beforeEach(() => {
  calls = [];
  onGet = () => json(WITH_ANSWERS);
  onPost = () => json({ requested: 3, withChannel: 2 });
  globalThis.fetch = vi.fn(async (url: string, init: RequestInit = {}) => {
    const method = (init.method ?? 'GET').toUpperCase();
    calls.push({ url, method, headers: new Headers(init.headers) });
    return method === 'POST' ? onPost() : onGet();
  }) as unknown as typeof fetch;
});
afterEach(cleanup);
afterAll(() => {
  globalThis.fetch = realFetch;
});

function renderPanel() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <TournamentDebriefsPanel tournamentId={TOUR} />
    </QueryClientProvider>
  );
}

const requestButton = () => screen.getByRole('button', { name: t.requestCta });
const posts = () => calls.filter((c) => c.method === 'POST');

async function openConfirm() {
  await act(async () => {
    fireEvent.click(requestButton());
  });
  return screen.getByRole('dialog');
}

async function confirmRequest() {
  const dialog = await openConfirm();
  await act(async () => {
    fireEvent.click(
      within(dialog).getByRole('button', { name: t.confirmLabel })
    );
  });
}

describe('TournamentDebriefsPanel — la liste', () => {
  it('montre chaque équipe engagée : ses deux cases et sa date, ou « Pas encore de réponse »', async () => {
    renderPanel();

    const list = await screen.findByRole('list', { name: t.listLabel });
    const cards = within(list).getAllByRole('article');
    // Ont répondu d'abord (la plus récente en tête), puis les autres.
    expect(
      cards.map((c) => within(c).getByRole('heading', { level: 3 }).textContent)
    ).toEqual(['Gamma', 'Alpha', 'Beta']);

    const gammaCard = screen.getByRole('article', { name: 'Gamma' });
    expect(within(gammaCard).getByText(t.positives)).toBeTruthy();
    expect(within(gammaCard).getByText('Casters au top')).toBeTruthy();
    expect(within(gammaCard).getByText(t.negatives)).toBeTruthy();
    expect(
      within(gammaCard).getByText(/Retards\s+entre les matchs/)
    ).toBeTruthy();
    // Heure de Paris (UTC+1 en novembre), dans la langue de l'admin.
    const date = gammaCard.querySelector('time');
    expect(date?.getAttribute('dateTime')).toBe('2026-11-02T18:30:00.000Z');
    expect(date?.textContent).toBe('Mis à jour le 2 novembre 2026 à 19:30');

    // Une case laissée vide le dit, au lieu de rester blanche.
    const alphaCard = screen.getByRole('article', { name: 'Alpha' });
    expect(within(alphaCard).getByText('Bonne organisation')).toBeTruthy();
    expect(within(alphaCard).getByText(t.nothingNoted)).toBeTruthy();

    const betaCard = screen.getByRole('article', { name: 'Beta' });
    expect(within(betaCard).getByText(t.noAnswer)).toBeTruthy();
    expect(within(betaCard).queryByText(t.positives)).toBeNull();
    expect(betaCard.querySelector('img')?.getAttribute('src')).toBe(
      beta.logo_url
    );

    expect(screen.getByText('Réponses : 2 sur 3')).toBeTruthy();
    expect(calls).toEqual([
      expect.objectContaining({ url: GET_URL, method: 'GET' }),
    ]);
    expect(calls[0].headers.get('Authorization')).toBe('Bearer staff-token');
  });

  it('sans aucune réponse : toutes les équipes restent listées', async () => {
    onGet = () => json(NO_ANSWERS);
    renderPanel();

    const list = await screen.findByRole('list', { name: t.listLabel });
    expect(within(list).getAllByRole('article')).toHaveLength(2);
    expect(within(list).getAllByText(t.noAnswer)).toHaveLength(2);
    expect(screen.getByText('Réponses : 0 sur 2')).toBeTruthy();
    expect((requestButton() as HTMLButtonElement).disabled).toBe(false);
  });

  it('aucune équipe engagée : état vide, et rien à demander', async () => {
    onGet = () => json(NO_TEAMS);
    renderPanel();

    expect(await screen.findByText(t.emptyTitle)).toBeTruthy();
    expect(screen.queryByRole('list', { name: t.listLabel })).toBeNull();
    const button = requestButton() as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(button.getAttribute('aria-describedby')).toBeTruthy();
    expect(
      document.getElementById(button.getAttribute('aria-describedby') ?? '')
        ?.textContent
    ).toBe(t.noTeamsToRequest);
  });

  it('pendant le chargement : un indicateur, pas un écran vide', () => {
    onGet = () => new Promise<Response>(() => {});
    renderPanel();

    expect(screen.getByRole('status', { name: t.loading })).toBeTruthy();
  });

  it('une lecture en échec le dit et propose de réessayer', async () => {
    let fail = true;
    onGet = () =>
      fail ? json({ error: 'Tournoi introuvable' }, 404) : json(WITH_ANSWERS);
    renderPanel();

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain(t.loadError);
    expect(alert.textContent).toContain('Tournoi introuvable');

    fail = false;
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: t.retry }));
    });
    expect(await screen.findByRole('list', { name: t.listLabel })).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

describe('TournamentDebriefsPanel — « Demander le debrief »', () => {
  it('demande confirmation ; annulée, rien ne part', async () => {
    renderPanel();
    await screen.findByRole('list', { name: t.listLabel });

    const dialog = await openConfirm();
    expect(within(dialog).getByText(t.confirmTitle)).toBeTruthy();
    expect(
      within(dialog).getByText(
        'Le bot va demander un debrief dans le salon privé de chaque équipe engagée.'
      )
    ).toBeTruthy();
    // Deux équipes ont déjà répondu : la relance le rappelle.
    expect(
      within(dialog).getByText(
        '2 équipes ont déjà répondu : elles recevront aussi le message et pourront modifier leur debrief.'
      )
    ).toBeTruthy();

    await act(async () => {
      fireEvent.click(
        within(dialog).getByRole('button', { name: nsConfirm.fr.cancel })
      );
    });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(posts()).toHaveLength(0);
  });

  it('confirmée : un POST idempotent, puis « Envoyé à N équipes, dont M sans salon Discord »', async () => {
    renderPanel();
    await screen.findByRole('list', { name: t.listLabel });

    await confirmRequest();

    await waitFor(() => expect(posts()).toHaveLength(1));
    const [post] = posts();
    expect(post.url).toBe(POST_URL);
    expect(post.headers.get('Authorization')).toBe('Bearer staff-token');
    expect(post.headers.get('Idempotency-Key')).toMatch(/\S{8,}/);

    const status = await screen.findByText(
      /Envoyé à 3 équipes, dont 1 sans salon Discord\./
    );
    expect(status.closest('[role="status"]')).toBeTruthy();
    expect(status.textContent).toContain(t.resultWithoutHint);
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('toutes les équipes ont un salon : « Envoyé à N équipes. »', async () => {
    onPost = () => json({ requested: 3, withChannel: 3 });
    renderPanel();
    await screen.findByRole('list', { name: t.listLabel });

    await confirmRequest();

    const message = await screen.findByText('Envoyé à 3 équipes.');
    expect(message.closest('[role="status"]')).toBeTruthy();
    expect(screen.queryByText(/sans salon Discord/)).toBeNull();
  });

  it('une erreur s’affiche proprement ; le nouvel essai garde sa clé, la relance après succès en prend une neuve', async () => {
    let fail = true;
    onPost = () =>
      fail
        ? json({ error: 'Accès refusé', requestId: 'req-12345678-abcd' }, 403)
        : json({ requested: 3, withChannel: 2 });
    renderPanel();
    await screen.findByRole('list', { name: t.listLabel });

    await confirmRequest();
    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain(t.requestError);
    expect(alert.textContent).toContain('Accès refusé');
    expect(alert.textContent).toContain('réf. req-1234');
    // Le bouton reste utilisable pour réessayer.
    expect((requestButton() as HTMLButtonElement).disabled).toBe(false);

    fail = false;
    await confirmRequest();
    expect(
      await screen.findByText(/Envoyé à 3 équipes, dont 1 sans salon Discord/)
    ).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();

    await confirmRequest();
    await waitFor(() => expect(posts()).toHaveLength(3));

    const [first, retry, relaunch] = posts().map((p) =>
      p.headers.get('Idempotency-Key')
    );
    expect(first).toBeTruthy();
    expect(retry).toBe(first);
    expect(relaunch).toBeTruthy();
    expect(relaunch).not.toBe(first);
  });
});

describe('helpers du panneau', () => {
  it('debriefRequestMessage : zéro, singulier, pluriel, équipes sans salon', () => {
    expect(debriefRequestMessage(t, { requested: 0, withChannel: 0 })).toBe(
      t.resultNone
    );
    expect(debriefRequestMessage(t, { requested: 1, withChannel: 1 })).toBe(
      'Envoyé à 1 équipe.'
    );
    expect(debriefRequestMessage(t, { requested: 1, withChannel: 0 })).toBe(
      `Envoyé à 1 équipe, dont 1 sans salon Discord. ${t.resultWithoutHint}`
    );
    expect(debriefRequestMessage(t, { requested: 5, withChannel: 5 })).toBe(
      'Envoyé à 5 équipes.'
    );
    expect(debriefRequestMessage(t, { requested: 5, withChannel: 3 })).toBe(
      `Envoyé à 5 équipes, dont 2 sans salon Discord. ${t.resultWithoutHint}`
    );
  });

  it('sortDebriefTeams : réponses récentes d’abord, puis par nom, sans muter l’entrée', () => {
    const input = [beta, alpha, { ...beta, team_id: 'z', name: 'Aube' }, gamma];
    const sorted = sortDebriefTeams(input);
    expect(sorted.map((x) => x.name)).toEqual([
      'Gamma',
      'Alpha',
      'Aube',
      'Beta',
    ]);
    expect(input.map((x) => x.name)).toEqual([
      'Beta',
      'Alpha',
      'Aube',
      'Gamma',
    ]);
  });
});
